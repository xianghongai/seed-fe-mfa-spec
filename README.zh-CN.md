# @seed-fe/mfa-spec

[English](README.md) | 简体中文

[MFA](https://github.com/xianghongai/seed-fe-mfa) 微前端工程的配置协议：工程元数据（`project/meta.json` 与生成的 `project.config.json`）、预设菜单（`project/menu.config.json`）与 Sitemap（`sitemap.json`）。

- 纯数据逻辑：不访问文件系统、进程或界面，Node.js 与浏览器都能用。
- 不绑定具体工具。`mfa` CLI、VS Code 扩展和其他工具按同一套规则解析、校验、生成与合并这些文件；读写文件由工具自己负责。
- 菜单与 Sitemap 是预设配置。容器可以直接使用、读取后再调整，也可以自行实现。
- 只提供 ES 模块。运行时依赖 `jsonc-parser` 与 `js-yaml`，用于解析页面声明。

## 安装

```sh
npm install @seed-fe/mfa-spec
```

## 用法

```ts
import { diagnoseMenu, hasBlockingDiagnostics, parseMenuConfig } from '@seed-fe/mfa-spec';

const { nodes, issues } = parseMenuConfig(JSON.parse(menuJson));
const diagnostics = diagnoseMenu(nodes, {
  sitemap,
  microapps: [{ name: 'orders', displayName: 'Orders', pathname: 'orders' }],
});
if (hasBlockingDiagnostics(diagnostics)) {
  // 结构错误：key 为空或重复、标题为空、外链格式错误等。
}
```

诊断与错误带稳定的 `code`、英文 `message`，消息中有参数时另给 `values`。需要显示其他语言的界面，可以按 `code` 与 `values` 组织自己的文案。

## API

| 范围         | 导出                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 工程元数据   | `ProjectMetadata`、`parseProjectMetadata`、`generateProjectRuntimeConfig`、`workspaceDirectories`、文件名常量              |
| 菜单         | `MenuNode`、`parseMenuConfig`、`serializeMenuConfig`、`classifyMenuNode`、`resolveMicroapp`、`walkMenu`、`collectMenuKeys` |
| 菜单校验     | `diagnoseMenu`、`hasBlockingDiagnostics`、`MenuDiagnosticCode`                                                             |
| 菜单高亮     | `highlightKeysOf`、`withHighlightKeys`、`collectMenuClaims`、`highlightCandidates`                                         |
| Sitemap 节点 | `SitemapNode`、`WritableSitemapNode`、`isSitemapNode`、`cloneSitemapNodeForWrite`                                          |
| Sitemap key  | `createSitemapNodeKey`、`createSitemapBaseKey`、`hasSitemapNodeKeyPrefix`、`toKebabCase`                                   |
| Sitemap 文件 | `parseSitemapNodes`、`applicationSitemapRelativePath`、`projectSitemapRelativePath`                                        |
| Sitemap 树   | `flattenSitemapTree`、`rebuildTreeFromFlatNodes`、`validateSitemapTree`                                                    |
| 页面声明     | `parsePageSitemapDeclaration`、`isSupportedPageFile`、`deriveRoutePage`                                                    |
| 生成与合并   | `generateApplicationSitemap`、`mergeProjectSitemap`                                                                        |

## 许可

[MIT](LICENSE)
