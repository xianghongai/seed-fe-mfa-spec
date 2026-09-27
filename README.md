# @seed-fe/mfa-spec

English | [简体中文](README.zh-CN.md)

Configuration protocols of the [MFA](https://github.com/xianghongai/seed-fe-mfa) micro-frontend workspace: project metadata (`project/meta.json` and the generated `project.config.json`), the preset menu (`project/menu.config.json`) and sitemaps (`sitemap.json`).

- Pure data logic: no file system, process or UI access, so it runs in Node.js and browsers alike.
- Not tied to a tool. The `mfa` CLI, the VS Code extension and any other tool read, check, generate and merge these files the same way. Reading and writing files is left to the tool.
- The menu and sitemap are presets. A container may use them as they are, adapt them after loading, or bring its own.
- ES modules only. Runtime dependencies: `jsonc-parser` and `js-yaml` for page declarations.

## Install

```sh
npm install @seed-fe/mfa-spec
```

## Usage

```ts
import { diagnoseMenu, hasBlockingDiagnostics, parseMenuConfig } from '@seed-fe/mfa-spec';

const { nodes, issues } = parseMenuConfig(JSON.parse(menuJson));
const diagnostics = diagnoseMenu(nodes, {
  sitemap,
  microapps: [{ name: 'orders', displayName: 'Orders', pathname: 'orders' }],
});
if (hasBlockingDiagnostics(diagnostics)) {
  // Structural errors: empty or duplicate keys, empty titles, invalid links and so on.
}
```

Diagnostics and errors carry a stable `code`, an English `message` and, where the message has parameters, `values`. A GUI that shows another language can build its text from `code` and `values`.

## API

| Area                 | Exports                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Project metadata     | `ProjectMetadata`, `parseProjectMetadata`, `generateProjectRuntimeConfig`, `workspaceDirectories`, file name constants     |
| Menu                 | `MenuNode`, `parseMenuConfig`, `serializeMenuConfig`, `classifyMenuNode`, `resolveMicroapp`, `walkMenu`, `collectMenuKeys` |
| Menu checks          | `diagnoseMenu`, `hasBlockingDiagnostics`, `MenuDiagnosticCode`                                                             |
| Menu highlighting    | `highlightKeysOf`, `withHighlightKeys`, `collectMenuClaims`, `highlightCandidates`                                         |
| Sitemap nodes        | `SitemapNode`, `WritableSitemapNode`, `isSitemapNode`, `cloneSitemapNodeForWrite`                                          |
| Sitemap keys         | `createSitemapNodeKey`, `createSitemapBaseKey`, `hasSitemapNodeKeyPrefix`, `toKebabCase`                                   |
| Sitemap files        | `parseSitemapNodes`, `applicationSitemapRelativePath`, `projectSitemapRelativePath`                                        |
| Sitemap trees        | `flattenSitemapTree`, `rebuildTreeFromFlatNodes`, `validateSitemapTree`                                                    |
| Page declarations    | `parsePageSitemapDeclaration`, `isSupportedPageFile`, `deriveRoutePage`                                                    |
| Generation and merge | `generateApplicationSitemap`, `mergeProjectSitemap`                                                                        |

## License

[MIT](LICENSE)
