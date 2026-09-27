/**
 * 菜单诊断：结构错误阻止保存；与 Sitemap 映射不上、高亮关联的问题只提示，容器运行时会跳过失效引用。
 */
import type { SitemapNode } from '../sitemap/node.js';
import {
  classifyMenuNode,
  findDuplicateSitemapKeys,
  indexSitemap,
  isSitemapSelfOrDescendant,
  isValidManualKey,
  isValidMenuHref,
  menuNodeHref,
  menuNodePath,
  resolveMicroapp,
  sitemapNodeTitle,
  walkMenu,
  type MenuMicroapp,
  type MenuNode,
} from './menu-config.js';
import { collectMenuClaims, highlightKeysOf } from './menu-highlight.js';

export type MenuDiagnosticCode =
  | 'emptyKey'
  | 'invalidKey'
  | 'duplicateKey'
  | 'manualKeyIsSitemapKey'
  | 'emptyTitle'
  | 'invalidHref'
  | 'leafHasChildren'
  | 'sitemapMissing'
  | 'sitemapKeyAmbiguous'
  | 'pathChanged'
  | 'sitemapDynamic'
  | 'microappMissing'
  | 'highlightOnNonPage'
  | 'highlightMissing'
  | 'highlightCovered'
  | 'highlightIsMenuPage'
  | 'highlightConflict'
  | 'highlightNoTitle'
  | 'navigationFallback';

/**
 * 修复建议：把页面 key 关联到同 path 的 Sitemap 节点、把 path 同步为 Sitemap 当前值、
 * 从高亮列表移除一个页面、为分组或外链重新生成 key。
 */
export type MenuDiagnosticFix =
  | { kind: 'associate'; sitemapKey: string }
  | { kind: 'syncPath'; path: string }
  | { kind: 'removeHighlight'; sitemapKey: string }
  | { kind: 'regenerateKey' };

export interface MenuDiagnostic {
  severity: 'error' | 'warning';
  code: MenuDiagnosticCode;
  nodeKey: string;
  /** 文案插值参数。 */
  values?: Record<string, string>;
  fix?: MenuDiagnosticFix;
}

export interface MenuDiagnosticContext {
  sitemap: readonly SitemapNode[];
  microapps: readonly MenuMicroapp[];
}

export const hasBlockingDiagnostics = (diagnostics: readonly MenuDiagnostic[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.severity === 'error');

export const diagnoseMenu = (nodes: readonly MenuNode[], context: MenuDiagnosticContext): MenuDiagnostic[] => {
  const sitemap = indexSitemap(context.sitemap);
  const duplicateSitemapKeys = findDuplicateSitemapKeys(context.sitemap);
  const pathIndex = new Map<string, string>();
  sitemap.forEach(({ node, dynamic }) => {
    if (!dynamic && !pathIndex.has(node.path)) {
      pathIndex.set(node.path, node.key);
    }
  });
  const keyCounts = new Map<string, number>();
  walkMenu(nodes, (node) => keyCounts.set(node.key, (keyCounts.get(node.key) ?? 0) + 1));
  const claims = collectMenuClaims(nodes);

  const diagnostics: MenuDiagnostic[] = [];
  walkMenu(nodes, (node) => {
    const kind = classifyMenuNode(node);
    const report = (
      severity: MenuDiagnostic['severity'],
      code: MenuDiagnosticCode,
      extra: Pick<MenuDiagnostic, 'values' | 'fix'> = {}
    ): void => {
      diagnostics.push({ severity, code, nodeKey: node.key, ...extra });
    };

    // 结构：阻止保存。
    if (node.key.trim().length === 0) {
      report('error', 'emptyKey', kind === 'page' ? {} : { fix: { kind: 'regenerateKey' } });
    } else if (kind !== 'page' && !isValidManualKey(node.key)) {
      report('error', 'invalidKey', { values: { key: node.key }, fix: { kind: 'regenerateKey' } });
    }
    if (node.key && (keyCounts.get(node.key) ?? 0) > 1) {
      report('error', 'duplicateKey', {
        values: { key: node.key },
        ...(kind !== 'page' && { fix: { kind: 'regenerateKey' } }),
      });
    }
    if (kind !== 'page' && sitemap.has(node.key)) {
      report('error', 'manualKeyIsSitemapKey', { values: { key: node.key }, fix: { kind: 'regenerateKey' } });
    }
    if (node.title.trim().length === 0) {
      report('error', 'emptyTitle');
    }
    if (kind !== 'group' && (node.children?.length ?? 0) > 0) {
      report('error', 'leafHasChildren');
    }
    if (kind === 'link' && !isValidMenuHref(menuNodeHref(node) ?? '')) {
      report('error', 'invalidHref', { values: { href: menuNodeHref(node) ?? '' } });
    }

    // 页面与 Sitemap 的映射：只提示。
    const highlightKeys = highlightKeysOf(node);
    if (kind === 'page') {
      const path = menuNodePath(node) ?? '';
      const indexed = sitemap.get(node.key);
      if (!indexed) {
        const sitemapKey = pathIndex.get(path);
        report('warning', 'sitemapMissing', sitemapKey === undefined ? {} : { fix: { kind: 'associate', sitemapKey } });
        // 主页面失效时，容器点击菜单会跳到附加列表中第一个存在的页面。
        const fallback = highlightKeys.map((key) => sitemap.get(key)?.node).find((item) => item !== undefined);
        if (fallback) {
          report('warning', 'navigationFallback', {
            values: { title: sitemapNodeTitle(fallback) ?? fallback.key, path: fallback.path },
          });
        }
      } else {
        if (duplicateSitemapKeys.has(node.key)) {
          report('warning', 'sitemapKeyAmbiguous', { values: { key: node.key } });
        }
        if (indexed.dynamic) {
          report('warning', 'sitemapDynamic');
        }
        if (indexed.node.path !== path) {
          report('warning', 'pathChanged', {
            values: { path: indexed.node.path },
            fix: { kind: 'syncPath', path: indexed.node.path },
          });
        }
      }
      if (!resolveMicroapp(path, context.microapps)) {
        report('warning', 'microappMissing', { values: { path } });
      }
    }

    // 高亮关联：只提示。
    if (highlightKeys.length > 0 && kind !== 'page') {
      report('warning', 'highlightOnNonPage');
    }
    if (kind !== 'page') {
      return;
    }
    highlightKeys.forEach((key) => {
      const remove = { kind: 'removeHighlight', sitemapKey: key } as const;
      const indexed = sitemap.get(key);
      if (!indexed) {
        report('warning', 'highlightMissing', { values: { key }, fix: remove });
        return;
      }
      if (sitemap.has(node.key) && isSitemapSelfOrDescendant(sitemap, key, node.key)) {
        report('warning', 'highlightCovered', { values: { key }, fix: remove });
        return;
      }
      if (claims.pageKeys.has(key)) {
        report('warning', 'highlightIsMenuPage', { values: { key }, fix: remove });
        return;
      }
      const others = (claims.claimedBy.get(key) ?? []).filter((claimer) => claimer !== node);
      if (others.length > 0) {
        report('warning', 'highlightConflict', {
          values: { key, menus: others.map((claimer) => claimer.title || claimer.key).join('、') },
        });
      }
      if (!sitemapNodeTitle(indexed.node)) {
        report('warning', 'highlightNoTitle', { values: { key } });
      }
    });
  });
  return diagnostics;
};
