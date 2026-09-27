/**
 * sitemap.json 解析：把公开 JSON 归一为内部树模型，缺省 children 补成空数组。
 */
import { isJsonObject } from '../json.js';
import type { SitemapDiagnostic } from './diagnostic.js';
import { sitemapNodeFields, type SitemapNode } from './node.js';

/**
 * 解析结果：节点与诊断；节点结构有误时跳过该节点并给出诊断。
 */
export interface SitemapParseResult {
  nodes: SitemapNode[];
  diagnostics: SitemapDiagnostic[];
}

/**
 * 将公开 sitemap JSON 归一为内部树模型，缺省 children 会补成空数组。
 */
export const parseSitemapNodes = (
  value: unknown,
  filePath: string,
  invalidCode: SitemapDiagnostic['code']
): SitemapParseResult => {
  if (!Array.isArray(value)) {
    return {
      nodes: [],
      diagnostics: [
        {
          severity: 'error',
          code: invalidCode,
          message: 'sitemap.json must be an array',
          filePath,
        },
      ],
    };
  }
  const diagnostics: SitemapDiagnostic[] = [];
  const nodes = value
    .map((item, index) => parseSitemapNode(item, `${index}`, filePath, invalidCode, diagnostics))
    .filter((node): node is SitemapNode => Boolean(node));
  return {
    nodes,
    diagnostics,
  };
};

const parseSitemapNode = (
  value: unknown,
  fieldPath: string,
  filePath: string,
  invalidCode: SitemapDiagnostic['code'],
  diagnostics: SitemapDiagnostic[]
): SitemapNode | undefined => {
  if (!isJsonObject(value)) {
    diagnostics.push({
      severity: 'error',
      code: invalidCode,
      message: 'A sitemap node must be an object',
      filePath,
      fieldPath,
    });
    return undefined;
  }
  const rawKey = value[sitemapNodeFields.key];
  if (typeof rawKey !== 'string' || rawKey.trim().length === 0) {
    diagnostics.push({
      severity: 'error',
      code: invalidCode,
      message: 'A sitemap node key must be a non-empty string',
      filePath,
      fieldPath: `${fieldPath}.${sitemapNodeFields.key}`,
    });
    return undefined;
  }
  const rawPath = value[sitemapNodeFields.path];
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    diagnostics.push({
      severity: 'error',
      code: invalidCode,
      message: 'A sitemap node path must be a non-empty string',
      filePath,
      fieldPath: `${fieldPath}.${sitemapNodeFields.path}`,
    });
    return undefined;
  }
  const rawChildrenValue = value[sitemapNodeFields.children];
  if (rawChildrenValue !== undefined && !Array.isArray(rawChildrenValue)) {
    // 显式 children 类型错误属于无效结构，不能按缺省空数组吞掉。
    diagnostics.push({
      severity: 'error',
      code: invalidCode,
      message: 'Sitemap node children must be an array',
      filePath,
      fieldPath: `${fieldPath}.${sitemapNodeFields.children}`,
    });
    return undefined;
  }
  const rawChildren = Array.isArray(rawChildrenValue) ? rawChildrenValue : [];
  const children = rawChildren
    .map((child, index) =>
      parseSitemapNode(child, `${fieldPath}.children.${index}`, filePath, invalidCode, diagnostics)
    )
    .filter((child): child is SitemapNode => Boolean(child));
  const node: SitemapNode = {
    ...value,
    key: rawKey,
    path: rawPath,
    children,
  };
  return node;
};
