/**
 * 页面 Sitemap 声明解析契约，负责从页面源码声明中提取可消费的节点属性。
 */
import { isJsonObject, type JsonObject } from '../json.js';
import type { SitemapDiagnostic } from './diagnostic.js';
import { generatedSitemapOwnershipFields, sitemapNodeFields } from './node.js';

/**
 * 页面 Sitemap 声明来源，区分 Vue 自定义块和 React 文件头注释。
 */
export type SitemapDeclarationSourceKind =
  | 'vue-custom-block-json'
  | 'react-header-comment-json'
  | 'react-header-comment-yaml';

/**
 * 页面 Sitemap 声明的正文格式，目前支持 JSON/JSONC 和 YAML。
 */
export type SitemapDeclarationFormat = 'json' | 'yaml';

/**
 * 页面声明的源码定位信息，用于诊断和可视化 Tooltip 展示。
 */
export interface SitemapDeclarationSource {
  filePath: string;
  sourceKind: SitemapDeclarationSourceKind;
  rawContent: string;
  format: SitemapDeclarationFormat;
}

/**
 * 解析后的页面声明，只保留开发者配置的可透传属性和可选 key。
 */
export interface PageSitemapDeclaration extends SitemapDeclarationSource {
  key?: string;
  properties: JsonObject;
}

/**
 * 单个页面声明解析结果，允许缺省声明但保留 warning 诊断。
 */
export interface PageSitemapDeclarationResult {
  declaration?: PageSitemapDeclaration;
  diagnostics: SitemapDiagnostic[];
}

const generatedSitemapFields = new Set<string>([
  sitemapNodeFields.children,
  sitemapNodeFields.key,
  sitemapNodeFields.path,
  ...generatedSitemapOwnershipFields,
]);

const toDeclarationProperties = (value: JsonObject): JsonObject =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !generatedSitemapFields.has(key)));

/**
 * 将已解析的声明对象转换为页面声明，并剔除生成器负责维护的字段。
 */
export const parsePageSitemapDeclarationObject = (
  value: unknown,
  source: SitemapDeclarationSource
): PageSitemapDeclarationResult => {
  const diagnostics: SitemapDiagnostic[] = [];
  if (!isJsonObject(value)) {
    return {
      diagnostics: [
        {
          severity: 'warning',
          code: 'sitemap.declaration.invalidShape',
          message: 'The sitemap declaration is not an object; the page is generated without a declaration',
          filePath: source.filePath,
        },
      ],
    };
  }

  const rawKey = value[sitemapNodeFields.key];
  // key 是开发者可覆盖的基础 key；path、children 和归属字段始终由生成器负责。
  const declaration: PageSitemapDeclaration = {
    ...source,
    properties: toDeclarationProperties(value),
  };
  if (typeof rawKey === 'string' && rawKey.trim().length > 0) {
    declaration.key = rawKey.trim();
  } else if (rawKey !== undefined) {
    diagnostics.push({
      severity: 'warning',
      code: 'sitemap.declaration.keyMissing',
      message: 'The sitemap declaration key is not a non-empty string; the key is derived from the file path',
      filePath: source.filePath,
      fieldPath: sitemapNodeFields.key,
    });
  }
  return {
    declaration,
    diagnostics,
  };
};
