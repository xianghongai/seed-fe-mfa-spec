import { describe, expect, it } from 'vitest';
import {
  diagnoseMenu,
  highlightCandidates,
  indexSitemap,
  migrateLegacyMenu,
  withHighlightKeys,
  type MenuNode,
  type SitemapNode,
} from '../src/index.js';

// title 为 null 表示页面没有标题。
const page = (key: string, path: string, children: SitemapNode[] = [], title: string | null = key): SitemapNode => ({
  key,
  path,
  children,
  ...(title !== null && { title }),
});

// orders.detail sits under orders.list; orders.create is a sibling; billing pages come from another microapp.
const sitemap = [
  page('orders.list', '/orders/list', [page('orders.detail', '/orders/list/:id')]),
  page('orders.create', '/orders/create', [page('orders.create.step', '/orders/create/step')]),
  page('orders.report', '/orders/report'),
  page('billing.invoice', '/billing/invoice/:id', [], null),
];
const microapps = [
  { name: 'orders', displayName: 'Orders', pathname: 'orders' },
  { name: 'billing', displayName: 'Billing', pathname: 'billing' },
];
const index = indexSitemap(sitemap);
const pageMenu = (key: string, path: string, highlight: string[] = []): MenuNode =>
  withHighlightKeys({ key, title: key, selectRule: { path, target: '_self' } }, highlight);

describe('highlight candidates', () => {
  it('covers the page subtree, respects menu pages and claims, and does not limit microapps', () => {
    const list = pageMenu('orders.list', '/orders/list', ['orders.create']);
    const report = pageMenu('orders.report', '/orders/report');
    const other = pageMenu('orders.other', '/orders/other', ['billing.invoice']);
    const statuses = Object.fromEntries(
      highlightCandidates([list, report, other], list, sitemap, index, microapps).map((candidate) => [
        candidate.node.key,
        candidate.status,
      ])
    );
    expect(statuses).toEqual({
      'orders.list': 'covered',
      'orders.detail': 'covered',
      // Already selected by this menu: stays selectable so it can be kept or removed.
      'orders.create': 'available',
      'orders.create.step': 'available',
      'orders.report': 'menuPage',
      'billing.invoice': 'claimed',
    });
  });

  it('counts descendants that follow a claimed page, stopping at their own menu pages', () => {
    const list = pageMenu('orders.list', '/orders/list');
    const create = (menu: MenuNode[]) =>
      highlightCandidates(menu, list, sitemap, index, microapps).find(
        (candidate) => candidate.node.key === 'orders.create'
      );
    expect(create([list])?.inheritedCount).toBe(1);
    expect(create([list, pageMenu('orders.create.step', '/orders/create/step')])?.inheritedCount).toBe(0);
  });
});

describe('highlight diagnostics', () => {
  const codes = (nodes: MenuNode[]) =>
    diagnoseMenu(nodes, { sitemap, microapps })
      .filter((item) => item.code.startsWith('highlight') || item.code === 'navigationFallback')
      .map((item) => `${item.nodeKey}:${item.code}:${item.values?.key ?? ''}`);

  it('warns about stale, redundant and conflicting claims without blocking save', () => {
    const nodes = [
      pageMenu('orders.list', '/orders/list', ['gone', 'orders.detail', 'orders.report', 'billing.invoice']),
      pageMenu('orders.report', '/orders/report', ['billing.invoice']),
      withHighlightKeys({ key: 'group-1', title: 'Group', children: [] }, ['orders.create']),
    ];
    expect(codes(nodes)).toEqual([
      'orders.list:highlightMissing:gone',
      'orders.list:highlightCovered:orders.detail',
      'orders.list:highlightIsMenuPage:orders.report',
      'orders.list:highlightConflict:billing.invoice',
      'orders.list:highlightNoTitle:billing.invoice',
      'orders.report:highlightConflict:billing.invoice',
      'orders.report:highlightNoTitle:billing.invoice',
      'group-1:highlightOnNonPage:',
    ]);
    const diagnostics = diagnoseMenu(nodes, { sitemap, microapps });
    expect(diagnostics.every((item) => item.severity === 'warning' || !item.code.startsWith('highlight'))).toBe(true);
    expect(diagnostics.find((item) => item.code === 'highlightMissing')?.fix).toEqual({
      kind: 'removeHighlight',
      sitemapKey: 'gone',
    });
  });

  it('explains where the menu navigates when its main page is gone', () => {
    const diagnostic = diagnoseMenu([pageMenu('orders.gone', '/orders/gone', ['missing', 'orders.create'])], {
      sitemap,
      microapps,
    }).find((item) => item.code === 'navigationFallback');
    expect(diagnostic?.values).toEqual({ title: 'orders.create', path: '/orders/create' });
  });

  it('flags duplicate page keys in the Sitemap', () => {
    const duplicated = [...sitemap, page('orders.list', '/orders/list-copy')];
    const codes = diagnoseMenu([pageMenu('orders.list', '/orders/list')], { sitemap: duplicated, microapps }).map(
      (item) => item.code
    );
    expect(codes).toContain('sitemapKeyAmbiguous');
  });
});

describe('legacy menu migration', () => {
  it('moves sitemapNodeKey into key for page menus and leaves other nodes untouched', () => {
    const result = migrateLegacyMenu([
      {
        key: 'group',
        title: 'Group',
        children: [
          { key: 'menu-list', title: 'List', selectRule: { path: '/orders/list' }, sitemapNodeKey: 'orders.list' },
          { key: 'docs', title: 'Docs', selectRule: { href: '/docs/' }, sitemapNodeKey: 'kept' },
        ],
      },
    ]);
    expect(result.migrated).toBe(1);
    expect(result.nodes).toEqual([
      {
        key: 'group',
        title: 'Group',
        children: [
          { key: 'orders.list', title: 'List', selectRule: { path: '/orders/list' } },
          { key: 'docs', title: 'Docs', selectRule: { href: '/docs/' }, sitemapNodeKey: 'kept' },
        ],
      },
    ]);
  });
});
