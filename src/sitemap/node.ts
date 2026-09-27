/**
 * Sitemap 节点协议（sitemap.json）：节点模型、文件位置、key 规则与写出归一。
 */
import { isJsonObject } from '../json.js';

/**
 * 内部 Sitemap 节点结构，children 始终是数组，方便树编辑和校验。
 */
export interface SitemapNode {
  [property: string]: unknown;
  key: string;
  path: string;
  children: SitemapNode[];
  title?: unknown;
  extension?: unknown;
  extensions?: unknown;
}

/**
 * 写入 sitemap.json 的公开节点结构，叶子节点可以省略 children。
 */
export interface WritableSitemapNode {
  [property: string]: unknown;
  key: string;
  path: string;
  children?: WritableSitemapNode[];
  title?: unknown;
  extension?: unknown;
  extensions?: unknown;
}

/**
 * Sitemap 生成摘要，用于命令结果提示、日志输出和界面展示。
 */
export interface SitemapGenerationSummary {
  pageCount: number;
  nodeCount: number;
  preservedHierarchyCount: number;
  removedNodeCount: number;
  skippedCount: number;
  pageRootCount?: number;
  updatedApplicationCount?: number;
  preservedApplicationCount?: number;
  skippedApplicationCount?: number;
}

// 公开字段由应用级和项目级 sitemap.json 共同消费，新增字段需同步契约文档。
export const sitemapNodeFields = {
  children: 'children',
  key: 'key',
  path: 'path',
  title: 'title',
  extension: 'extension',
  extensions: 'extensions',
} as const;

/**
 * 旧版归属字段只用于剔除生成字段，当前公开输出不再写入这些字段。
 */
export const generatedSitemapOwnershipFields = ['sourceApplicationName', 'sourcePackageName'] as const;

/**
 * 归属字段集合，用于写出前过滤非开发者配置字段。
 */
export const generatedSitemapOwnershipFieldSet = new Set<string>(generatedSitemapOwnershipFields);

/**
 * 应用级 Sitemap 相对应用根目录的路径。
 */
export const applicationSitemapRelativePath = 'public/sitemap.json';
/**
 * 工程级 Sitemap 相对工作区根目录的路径。
 */
export const projectSitemapRelativePath = 'project/sitemap.json';
/**
 * key 前缀和页面 key 的默认分隔符。
 */
export const defaultSitemapKeySeparator = '.';

const splitWords = (value: string): string[] =>
  value
    .replace(/^@/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

/**
 * 将包名、路由名或声明 key 归一为 kebab-case 片段。
 */
export const toKebabCase = (value: string): string =>
  splitWords(value)
    .map((word) => word.toLowerCase())
    .join('-');

/**
 * 校验 Sitemap key 分隔符，禁止字母、数字、空白、反斜杠和短横线。
 */
export const isSitemapKeySeparator = (value: string): boolean => {
  const separator = value.trim();
  return separator.length >= 1 && separator.length <= 3 && !/[A-Za-z0-9\s\\-]/u.test(separator);
};

/**
 * 归一化 key 分隔符，非法配置回退到默认分隔符。
 */
export const normalizeSitemapKeySeparator = (value: string): string =>
  isSitemapKeySeparator(value) ? value.trim() : defaultSitemapKeySeparator;

/**
 * 创建最终 Sitemap key，格式为 `<app-package-name><separator><page-key>`。
 */
export const createSitemapNodeKey = (
  applicationPackageName: string,
  baseKey: string,
  keySeparator = defaultSitemapKeySeparator
): string =>
  `${toKebabCase(applicationPackageName)}${normalizeSitemapKeySeparator(keySeparator)}${toKebabCase(baseKey) || 'index'}`;

/**
 * 从路由路径和路由名推导页面基础 key，兜底为 index。
 */
export const createSitemapBaseKey = (routePath: string, routeName: string): string =>
  toKebabCase(routePath) || toKebabCase(routeName) || 'index';

/**
 * 创建应用级节点 key，语义上强调包名前缀由应用级生成阶段注入。
 */
export const createApplicationSitemapNodeKey = (
  applicationPackageName: string,
  baseKey: string,
  keySeparator = defaultSitemapKeySeparator
): string => createSitemapNodeKey(applicationPackageName, baseKey, keySeparator);

/**
 * 判断节点 key 是否属于指定应用包名前缀，用于项目级增量合并归属识别。
 */
export const hasSitemapNodeKeyPrefix = (
  nodeKey: string,
  applicationPackageName: string,
  keySeparator = defaultSitemapKeySeparator
): boolean => {
  const packagePrefix = toKebabCase(applicationPackageName);
  return (
    packagePrefix.length > 0 && nodeKey.startsWith(`${packagePrefix}${normalizeSitemapKeySeparator(keySeparator)}`)
  );
};

/**
 * 克隆公开写出节点，剔除内部字段，并且只在存在真实子节点时写 children。
 */
export const cloneSitemapNodeForWrite = (node: SitemapNode): WritableSitemapNode => {
  const writable: WritableSitemapNode = {
    ...Object.fromEntries(
      Object.entries(node).filter(
        ([property]) => property !== sitemapNodeFields.children && !generatedSitemapOwnershipFieldSet.has(property)
      )
    ),
    key: node.key,
    path: node.path,
  };
  if (node.children.length > 0) {
    // 叶子节点不写 children，保持最终 JSON 简洁；内部模型仍始终使用数组。
    writable.children = node.children.map(cloneSitemapNodeForWrite);
  }
  return writable;
};

/**
 * 判断未知值是否为内部 SitemapNode，要求 children 已归一为数组。
 */
export const isSitemapNode = (value: unknown): value is SitemapNode => {
  if (
    !isJsonObject(value) ||
    typeof value.key !== 'string' ||
    value.key.trim().length === 0 ||
    typeof value.path !== 'string' ||
    !Array.isArray(value.children)
  ) {
    return false;
  }
  return value.children.every(isSitemapNode);
};
