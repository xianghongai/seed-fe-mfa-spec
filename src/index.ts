/**
 * MFA configuration protocols: project metadata (meta.json), the preset menu (menu.config.json) and sitemaps
 * (sitemap.json). Pure data logic without file system, process or UI dependencies, usable in Node.js and browsers.
 */
export * from './result.js';
export * from './json.js';
export * from './project/metadata.js';
export * from './project/metadata-parser.js';
export * from './project/runtime-config.js';
export * from './sitemap/node.js';
export * from './sitemap/diagnostic.js';
export * from './sitemap/tree.js';
export * from './sitemap/file.js';
export * from './sitemap/declaration.js';
export * from './sitemap/declaration-parser.js';
export * from './sitemap/route.js';
export * from './sitemap/generator.js';
export * from './sitemap/project-merge.js';
export * from './menu/menu-config.js';
export * from './menu/menu-diagnostics.js';
export * from './menu/menu-highlight.js';
