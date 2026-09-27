/**
 * 菜单高亮关联（highlightSitemapNodeKeys）。
 *
 * 容器按当前地址在 Sitemap 中找到页面，再沿父页面往上找第一个关联了菜单的页面并高亮它，
 * 所以页面的后代天然归属该页面的菜单。附加列表只用来认领层级上够不着的页面（平级、其他分支、
 * 其他微应用），被认领页面下没有自己菜单的后代也随之归属。一个页面只能归属一个菜单。
 */
import type { SitemapNode } from '../sitemap/node.js';
import {
  classifyMenuNode,
  isSitemapSelfOrDescendant,
  resolveMicroapp,
  walkMenu,
  type IndexedSitemapNode,
  type MenuMicroapp,
  type MenuNode,
} from './menu-config.js';

export const highlightField = 'highlightSitemapNodeKeys';

export const highlightKeysOf = (node: MenuNode): string[] => {
  const value = node[highlightField];
  return Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : [];
};

/** 列表为空时去掉字段，避免写出空数组（容器据此决定面包屑是否多一级）。 */
export const withHighlightKeys = (node: MenuNode, keys: readonly string[]): MenuNode => {
  const { [highlightField]: _removed, ...rest } = node;
  return keys.length > 0 ? { ...rest, [highlightField]: [...keys] } : rest;
};

/** 菜单中各页面的归属：页面菜单自身，以及各菜单认领的页面（可能被多个菜单认领）。 */
export interface MenuClaims {
  pageKeys: Set<string>;
  /** 被认领页面 key → 认领它的菜单节点。 */
  claimedBy: Map<string, MenuNode[]>;
}

export const collectMenuClaims = (nodes: readonly MenuNode[]): MenuClaims => {
  const pageKeys = new Set<string>();
  const claimedBy = new Map<string, MenuNode[]>();
  walkMenu(nodes, (node) => {
    if (classifyMenuNode(node) === 'page') {
      pageKeys.add(node.key);
    }
    highlightKeysOf(node).forEach((key) => claimedBy.set(key, [...(claimedBy.get(key) ?? []), node]));
  });
  return { pageKeys, claimedBy };
};

export type HighlightCandidateStatus =
  /** 可以认领。 */
  | 'available'
  /** 是本菜单页面自身或其后代，沿父页面往上已能找到本菜单。 */
  | 'covered'
  /** 自身已是菜单页面，由它自己的菜单高亮。 */
  | 'menuPage'
  /** 已被其他菜单认领。 */
  | 'claimed';

export interface HighlightCandidate {
  node: SitemapNode;
  microapp: MenuMicroapp | undefined;
  status: HighlightCandidateStatus;
  /** status 为 claimed 时认领它的菜单标题。 */
  claimedBy?: string;
  /** 认领后随之归属的后代数（遇到自身是菜单页面的子树即停止）。 */
  inheritedCount: number;
}

const countInherited = (node: SitemapNode, pageKeys: ReadonlySet<string>): number =>
  node.children.reduce(
    (total, child) => (pageKeys.has(child.key) ? total : total + 1 + countInherited(child, pageKeys)),
    0
  );

/**
 * 页面菜单 menuNode 的候选附加高亮页面：Sitemap 中的全部页面（含动态路由，不限微应用），
 * 按是否可认领标出状态。menuNode 当前已选的页面仍计为 available，便于保留或取消。
 */
export const highlightCandidates = (
  menu: readonly MenuNode[],
  menuNode: MenuNode,
  sitemap: readonly SitemapNode[],
  index: ReadonlyMap<string, IndexedSitemapNode>,
  microapps: readonly MenuMicroapp[]
): HighlightCandidate[] => {
  const { pageKeys, claimedBy } = collectMenuClaims(menu);
  const candidates: HighlightCandidate[] = [];
  const visit = (nodes: readonly SitemapNode[]): void =>
    nodes.forEach((node) => {
      const others = (claimedBy.get(node.key) ?? []).filter((claimer) => claimer.key !== menuNode.key);
      const status: HighlightCandidateStatus = isSitemapSelfOrDescendant(index, node.key, menuNode.key)
        ? 'covered'
        : pageKeys.has(node.key)
          ? 'menuPage'
          : others.length > 0
            ? 'claimed'
            : 'available';
      candidates.push({
        node,
        microapp: resolveMicroapp(node.path, microapps),
        status,
        ...(status === 'claimed' && { claimedBy: others[0]?.title || others[0]?.key || '' }),
        inheritedCount: countInherited(node, pageKeys),
      });
      visit(node.children);
    });
  visit(sitemap);
  return candidates;
};
