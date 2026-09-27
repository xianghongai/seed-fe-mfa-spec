# AGENTS.md

## 职责

- `@seed-fe/mfa-spec`（仓库与目录名 `seed-fe-mfa-spec`）是 MF 配置协议包：工程元数据（`meta.json`、工作区布局、`project.config.json` 生成）、预设菜单（`menu.config.json`）与 Sitemap（`sitemap.json`）的数据模型、解析、校验、生成与合并规则。协议依据《微前端 2 - 工作区与配置契约规范》《微前端 3 - 路由、菜单与 Sitemap 规范》。
- 不绑定工具：`mfa` CLI（`@seed-fe/mfa`）、VS Code 扩展和以后的网页平台都消费它。只放这些使用方都需要的数据逻辑。
- 纯数据逻辑：不读写文件，不访问进程，不依赖 `node:*`、`vscode` 或界面库，Node.js 与浏览器都能用。读写文件、扫描页面目录、开发服务、构建装配属于开发领域，留在核心。
- 不做 i18n：诊断与错误给出稳定的 `code`、英文 `message`，消息有参数时另给 `values`；翻译只在 GUI 里按 `code` 与 `values` 做。
- 不依赖任何 MFA 包；运行时依赖只有 `jsonc-parser` 与 `js-yaml`。

## 结构

- `src/result.ts`、`src/json.ts`：解析结果与 JSON 值收窄。
- `src/project/`：`metadata.ts` 数据模型与布局常量，`metadata-parser.ts` 解析 `meta.json`，`runtime-config.ts` 生成 `project.config.json`。
- `src/sitemap/`：`node.ts` 节点与 key 规则，`diagnostic.ts` 诊断，`tree.ts` 树工具与校验，`file.ts` 解析 `sitemap.json`，`declaration.ts`、`declaration-parser.ts` 页面声明，`route.ts` 路由推导，`generator.ts` 应用级生成，`project-merge.ts` 工程级合并。
- `src/menu/`：菜单模型与解析、校验、高亮关联。

## 约定

- 代码注释可以用中文，测试描述与消息用英文；示例与测试数据只用占位值。
- 版本与变更日志用 Changesets：用户可见的改动运行 `pnpm changeset`，不手改版本号与 `CHANGELOG.md`。
- 工作流只调用约定的脚本：`format:check`、`lint`、`check-types`、`test`、`release`。
- 不执行提交、推送、发布。

## 验证

- `pnpm check-types`、`pnpm lint`、`pnpm format:check`、`pnpm test`、`pnpm build`；发布前 `npm pack --dry-run` 确认只包含 `dist`、README、LICENSE 与 `package.json`。
- 核心的集成测试（`seed-fe-mfa/test/sitemap.test.ts` 等）覆盖生成与合并的端到端行为；改协议规则后在核心也跑一遍测试。
