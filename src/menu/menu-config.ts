/**
 * 菜单配置协议（project/menu.config.json），Extension Host 与 Webview 共用；不依赖 vscode 或 Node。
 *
 * 菜单只有 `key` 一个标识：页面节点的 key 就是 Sitemap key，编辑时靠它与 Sitemap 对照。
 * 菜单仍保存 selectRule.path，运行时只按菜单自身渲染，与 Sitemap 解耦。
 * 编辑器负责 key、title、icon、selectRule、children 与 highlightSitemapNodeKeys；
 * 其余字段（disabled、hideTopItem 等）原样写回。
 */
import { isJsonObject } from '../json.js';
import type { SitemapNode } from '../sitemap/node.js';

export type MenuTarget = '_self' | '_blank';

export type MenuSelectRule =
  | { path: string; target?: string; [property: string]: unknown }
  | { href: string; target?: string; [property: string]: unknown };

export interface MenuNode {
  [property: string]: unknown;
  key: string;
  title: string;
  icon?: string;
  selectRule?: MenuSelectRule;
  children?: MenuNode[];
}

/** 分组没有 selectRule；页面用 path 导航到微应用；外链用 href。 */
export type MenuNodeKind = 'group' | 'page' | 'link';

export interface MenuParseIssue {
  /** 从根开始的节点位置，如 `[0].children[2]`。 */
  location: string;
  code: 'notArray' | 'notObject' | 'keyNotString' | 'titleNotString' | 'selectRuleInvalid' | 'childrenNotArray';
}

export interface MenuParseResult {
  nodes: MenuNode[];
  issues: MenuParseIssue[];
}

/** meta.json 中注册的微应用，用于按 path 第一段判定归属。 */
export interface MenuMicroapp {
  name: string;
  displayName: string;
  pathname: string;
}

export const classifyMenuNode = (node: MenuNode): MenuNodeKind => {
  if (!node.selectRule) {
    return 'group';
  }
  return typeof node.selectRule.href === 'string' ? 'link' : 'page';
};

export const menuNodePath = (node: MenuNode): string | undefined =>
  typeof node.selectRule?.path === 'string' ? node.selectRule.path : undefined;

export const menuNodeHref = (node: MenuNode): string | undefined =>
  typeof node.selectRule?.href === 'string' ? node.selectRule.href : undefined;

export const opensInNewTab = (node: MenuNode): boolean => node.selectRule?.target === '_blank';

const parseSelectRule = (value: unknown): MenuSelectRule | undefined => {
  if (!isJsonObject(value)) {
    return undefined;
  }
  const target = value.target;
  if (target !== undefined && typeof target !== 'string') {
    return undefined;
  }
  if (typeof value.path === 'string') {
    return { ...value, path: value.path } as MenuSelectRule;
  }
  if (typeof value.href === 'string') {
    return { ...value, href: value.href } as MenuSelectRule;
  }
  return undefined;
};

const parseNode = (value: unknown, location: string, issues: MenuParseIssue[]): MenuNode | undefined => {
  if (!isJsonObject(value)) {
    issues.push({ location, code: 'notObject' });
    return undefined;
  }
  const { key, title, selectRule, children, ...rest } = value;
  if (typeof key !== 'string') {
    issues.push({ location, code: 'keyNotString' });
    return undefined;
  }
  const node: MenuNode = { ...rest, key, title: '' };
  if (typeof title === 'string') {
    node.title = title;
  } else {
    issues.push({ location, code: 'titleNotString' });
  }
  if (selectRule !== undefined) {
    const rule = parseSelectRule(selectRule);
    if (rule) {
      node.selectRule = rule;
    } else {
      issues.push({ location, code: 'selectRuleInvalid' });
    }
  }
  if (children !== undefined) {
    if (Array.isArray(children)) {
      node.children = children.flatMap((child, index) => {
        const parsed = parseNode(child, `${location}.children[${index}]`, issues);
        return parsed ? [parsed] : [];
      });
    } else {
      issues.push({ location, code: 'childrenNotArray' });
    }
  }
  return node;
};

/** 解析未知 JSON 值；无法识别的节点被丢弃并记入 issues，读取与导入共用。 */
export const parseMenuConfig = (value: unknown): MenuParseResult => {
  const issues: MenuParseIssue[] = [];
  if (!Array.isArray(value)) {
    return { nodes: [], issues: [{ location: '', code: 'notArray' }] };
  }
  const nodes = value.flatMap((item, index) => {
    const parsed = parseNode(item, `[${index}]`, issues);
    return parsed ? [parsed] : [];
  });
  return { nodes, issues };
};

/** 写出前去掉叶子节点的 children 字段；分组即使为空也保留 `children: []`。 */
const normalizeForWrite = (node: MenuNode): MenuNode => {
  const { children, ...rest } = node;
  if (classifyMenuNode(node) === 'group') {
    return { ...rest, children: (children ?? []).map(normalizeForWrite) };
  }
  return children && children.length > 0 ? { ...rest, children: children.map(normalizeForWrite) } : rest;
};

export const serializeMenuConfig = (nodes: readonly MenuNode[]): string =>
  `${JSON.stringify(nodes.map(normalizeForWrite), null, 2)}\n`;

/** 动态路由：某个路径段以 `:` 开头，或含 `*`、`[`。这类页面不能作为菜单入口。 */
export const isDynamicSitemapPath = (path: string): boolean =>
  path.split('/').some((segment) => segment.startsWith(':') || segment.includes('*') || segment.includes('['));

/** 按 path 第一段匹配 meta.json 中注册的 pathname。 */
export const resolveMicroapp = (path: string, microapps: readonly MenuMicroapp[]): MenuMicroapp | undefined => {
  const first = path.split('/').find((segment) => segment.length > 0);
  return first === undefined ? undefined : microapps.find((microapp) => microapp.pathname === first);
};

export const sitemapNodeTitle = (node: SitemapNode): string | undefined =>
  typeof node.title === 'string' && node.title.trim().length > 0 ? node.title.trim() : undefined;

/** 以 key 为索引的 Sitemap 节点表，附带父节点 key 与是否处于动态路由之下。 */
export interface IndexedSitemapNode {
  node: SitemapNode;
  parentKey: string | undefined;
  dynamic: boolean;
}

/** 重复的 key 只保留第一次出现的节点；重复本身由 findDuplicateSitemapKeys 报告。 */
export const indexSitemap = (nodes: readonly SitemapNode[]): Map<string, IndexedSitemapNode> => {
  const index = new Map<string, IndexedSitemapNode>();
  const visit = (items: readonly SitemapNode[], parentKey: string | undefined, parentDynamic: boolean): void => {
    items.forEach((node) => {
      const dynamic = parentDynamic || isDynamicSitemapPath(node.path);
      if (!index.has(node.key)) {
        index.set(node.key, { node, parentKey, dynamic });
      }
      visit(node.children, node.key, dynamic);
    });
  };
  visit(nodes, undefined, false);
  return index;
};

/** 页面 key 必须全局唯一；工程 Sitemap 合并时会拦截重复，这里兜底检查手改或旧文件。 */
export const findDuplicateSitemapKeys = (nodes: readonly SitemapNode[]): Set<string> => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const visit = (items: readonly SitemapNode[]): void =>
    items.forEach((node) => {
      if (seen.has(node.key)) {
        duplicates.add(node.key);
      }
      seen.add(node.key);
      visit(node.children);
    });
  visit(nodes);
  return duplicates;
};

/** key 是否为 ancestorKey 自身或其后代。 */
export const isSitemapSelfOrDescendant = (
  index: ReadonlyMap<string, IndexedSitemapNode>,
  key: string,
  ancestorKey: string
): boolean => {
  let current: string | undefined = key;
  const visited = new Set<string>();
  while (current !== undefined && !visited.has(current)) {
    if (current === ancestorKey) {
      return true;
    }
    visited.add(current);
    current = index.get(current)?.parentKey;
  }
  return false;
};

/** 由 Sitemap 节点创建页面菜单节点：key 与 path 取自 Sitemap，标题缺省时用 key。 */
export const createPageNode = (node: SitemapNode): MenuNode => ({
  key: node.key,
  title: sitemapNodeTitle(node) ?? node.key,
  selectRule: { path: node.path, target: '_self' },
});

/** 外链 href：`http(s)://` 完整地址，或以 `/` 开头的同域绝对地址。只校验格式，不检查可达性。 */
export const isValidMenuHref = (href: string): boolean => {
  if (href.startsWith('/')) {
    return !href.startsWith('//');
  }
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/** 分组与外链的 key：非空且不含空白字符。编辑器自动生成，这里用于检查手改的配置。 */
export const isValidManualKey = (key: string): boolean => /^\S+$/.test(key);

/**
 * 旧协议的页面菜单用 `sitemapNodeKey` 关联 Sitemap；新协议中页面菜单的 key 就是 Sitemap key。
 * 迁移时把 key 改为 sitemapNodeKey 并去掉该字段，返回迁移的节点数。
 */
export const migrateLegacyMenu = (nodes: readonly MenuNode[]): { nodes: MenuNode[]; migrated: number } => {
  let migrated = 0;
  const migrate = (node: MenuNode): MenuNode => {
    const { sitemapNodeKey, children, ...rest } = node;
    const next: MenuNode = { ...rest };
    if (typeof sitemapNodeKey === 'string' && sitemapNodeKey && classifyMenuNode(node) === 'page') {
      next.key = sitemapNodeKey;
      migrated += 1;
    } else if (sitemapNodeKey !== undefined) {
      next.sitemapNodeKey = sitemapNodeKey;
    }
    if (children !== undefined) {
      next.children = children.map(migrate);
    }
    return next;
  };
  return { nodes: nodes.map(migrate), migrated };
};

export const walkMenu = (
  nodes: readonly MenuNode[],
  visit: (node: MenuNode, parent: MenuNode | undefined) => void,
  parent?: MenuNode
): void => {
  nodes.forEach((node) => {
    visit(node, parent);
    walkMenu(node.children ?? [], visit, node);
  });
};

export const collectMenuKeys = (nodes: readonly MenuNode[]): string[] => {
  const keys: string[] = [];
  walkMenu(nodes, (node) => keys.push(node.key));
  return keys;
};
