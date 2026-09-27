import { describe, expect, it } from 'vitest';
import {
  classifyMenuNode,
  diagnoseMenu,
  hasBlockingDiagnostics,
  isDynamicSitemapPath,
  isValidMenuHref,
  parseMenuConfig,
  resolveMicroapp,
  serializeMenuConfig,
  type MenuNode,
  type SitemapNode,
} from '../src/index.js';

const page = (key: string, path: string, children: SitemapNode[] = []): SitemapNode => ({ key, path, children });
const sitemap = [
  page('orders.list', '/orders/list', [page('orders.detail', '/orders/list/:id')]),
  page('orders.create', '/orders/create'),
];
const microapps = [{ name: 'orders', displayName: 'Orders', pathname: 'orders' }];
const context = { sitemap, microapps };
const codes = (nodes: MenuNode[]) => diagnoseMenu(nodes, context).map((item) => `${item.severity}:${item.code}`);

describe('menu protocol', () => {
  it('classifies nodes and keeps fields the editor does not own', () => {
    const raw = [
      {
        key: 'group',
        title: 'Group',
        hideTopItem: true,
        children: [
          {
            key: 'orders.list',
            title: 'List',
            selectRule: { path: '/orders/list', target: '_self' },
            highlightSitemapNodeKeys: ['orders.create'],
            sitemapNodeKey: 'orders.list',
          },
          { key: 'docs', title: 'Docs', selectRule: { href: 'https://docs.example.com', target: '_blank' } },
        ],
      },
    ];
    const { nodes, issues } = parseMenuConfig(raw);
    expect(issues).toEqual([]);
    expect(nodes.map(classifyMenuNode)).toEqual(['group']);
    expect(nodes[0]?.children?.map(classifyMenuNode)).toEqual(['page', 'link']);
    expect(JSON.parse(serializeMenuConfig(nodes))).toEqual(raw);
  });

  it('reports unrecognized nodes with their location instead of guessing', () => {
    const { nodes, issues } = parseMenuConfig([{ key: 'a', title: 'A', children: [{ title: 'no key' }] }, 'x']);
    expect(nodes).toHaveLength(1);
    expect(issues).toEqual([
      { location: '[0].children[0]', code: 'keyNotString' },
      { location: '[1]', code: 'notObject' },
    ]);
    expect(parseMenuConfig({}).issues[0]?.code).toBe('notArray');
  });

  it('always writes children for groups and drops empty children from leaves', () => {
    const text = serializeMenuConfig([
      { key: 'g', title: 'G' },
      { key: 'l', title: 'L', selectRule: { href: '/app/' }, children: [] },
    ]);
    expect(JSON.parse(text)).toEqual([
      { key: 'g', title: 'G', children: [] },
      { key: 'l', title: 'L', selectRule: { href: '/app/' } },
    ]);
    expect(text.endsWith('\n')).toBe(true);
  });

  it('recognizes dynamic routes, owners and link formats', () => {
    expect(isDynamicSitemapPath('/orders/list/:id')).toBe(true);
    expect(isDynamicSitemapPath('/orders/[id]')).toBe(true);
    expect(isDynamicSitemapPath('/orders/list')).toBe(false);
    expect(resolveMicroapp('/orders/list', microapps)?.name).toBe('orders');
    expect(resolveMicroapp('/billing/list', microapps)).toBeUndefined();
    expect(isValidMenuHref('https://example.com/a')).toBe(true);
    expect(isValidMenuHref('/third-party/')).toBe(true);
    expect(isValidMenuHref('//example.com')).toBe(false);
    expect(isValidMenuHref('javascript:alert(1)')).toBe(false);
    expect(isValidMenuHref('example.com')).toBe(false);
  });
});

describe('menu diagnostics', () => {
  it('blocks saving on structural errors only', () => {
    const nodes: MenuNode[] = [
      { key: 'dup', title: 'A', children: [] },
      { key: 'dup', title: '', children: [] },
      { key: 'orders.create', title: 'Manual key taken from Sitemap', children: [] },
      { key: 'bad-link', title: 'Bad', selectRule: { href: 'ftp://x' } },
      { key: 'leaf', title: 'Leaf', selectRule: { href: '/x' }, children: [{ key: 'child', title: 'C' }] },
    ];
    expect(codes(nodes)).toEqual([
      'error:duplicateKey',
      'error:duplicateKey',
      'error:emptyTitle',
      'error:manualKeyIsSitemapKey',
      'error:invalidHref',
      'error:leafHasChildren',
    ]);
    expect(hasBlockingDiagnostics(diagnoseMenu(nodes, context))).toBe(true);
  });

  it('warns about pages that no longer match the Sitemap and offers fixes', () => {
    const nodes: MenuNode[] = [
      { key: 'orders.list', title: 'List', selectRule: { path: '/orders/old' } },
      { key: 'orders.detail', title: 'Detail', selectRule: { path: '/orders/list/:id' } },
      { key: 'orders.renamed', title: 'Renamed', selectRule: { path: '/orders/create' } },
      { key: 'gone', title: 'Gone', selectRule: { path: '/billing/x' } },
    ];
    const diagnostics = diagnoseMenu(nodes, context);
    expect(hasBlockingDiagnostics(diagnostics)).toBe(false);
    expect(diagnostics.map((item) => `${item.nodeKey}:${item.code}`)).toEqual([
      'orders.list:pathChanged',
      'orders.detail:sitemapDynamic',
      'orders.renamed:sitemapMissing',
      'gone:sitemapMissing',
      'gone:microappMissing',
    ]);
    expect(diagnostics[0]?.fix).toEqual({ kind: 'syncPath', path: '/orders/list' });
    // Only a static Sitemap node with the same path is offered for association.
    expect(diagnostics[2]?.fix).toEqual({ kind: 'associate', sitemapKey: 'orders.create' });
    expect(diagnostics[3]?.fix).toBeUndefined();
  });
});
