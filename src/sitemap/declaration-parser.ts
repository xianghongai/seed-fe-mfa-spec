/**
 * Sitemap 声明解析器，负责从 React 注释和 Vue 自定义块中提取 JSON/YAML 声明。
 */
import { getNodeValue, parseTree, printParseErrorCode, type Node as JsoncNode, type ParseError } from 'jsonc-parser';
import { load } from 'js-yaml';
import {
  parsePageSitemapDeclarationObject,
  type PageSitemapDeclarationResult,
  type SitemapDeclarationSource,
} from './declaration.js';
import type { SitemapDiagnostic } from './diagnostic.js';

interface RawDeclaration {
  source: SitemapDeclarationSource;
  parsed: unknown;
  diagnostics: SitemapDiagnostic[];
}

const invalidJson = (reason: string) => ({
  message: `Cannot parse the sitemap JSON; the page is generated without a declaration: ${reason}`,
  values: { reason },
});

const invalidYaml = (reason: string) => ({
  message: `Cannot parse the sitemap YAML; the page is generated without a declaration: ${reason}`,
  values: { reason },
});

const reactSitemapAnnotation = '@Sitemap';
const reactSitemapAnnotationPattern = /@Sitemap(?=\s|\(|$)/u;

const stripCommentDecorators = (comment: string): string =>
  comment
    .replace(/^\s*\{?\/\*+/u, '')
    .replace(/\*\/\}?\s*$/u, '')
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\s*\*\s?/u, '').trimEnd())
    .join('\n');

const parseJsonContent = (rawContent: string, source: SitemapDeclarationSource): RawDeclaration => {
  try {
    return {
      source,
      parsed: JSON.parse(rawContent) as unknown,
      diagnostics: [],
    };
  } catch (error) {
    return {
      source,
      parsed: undefined,
      diagnostics: [
        {
          severity: 'warning',
          code: 'sitemap.declaration.invalidJson',
          ...invalidJson(error instanceof Error ? error.message : String(error)),
          filePath: source.filePath,
        },
      ],
    };
  }
};

const findDuplicateJsoncProperty = (node: JsoncNode, path: string[] = []): string | undefined => {
  if (node.type === 'object') {
    const seen = new Set<string>();
    for (const propertyNode of node.children ?? []) {
      const keyValue: unknown = propertyNode.children?.[0]?.value;
      if (typeof keyValue !== 'string') {
        continue;
      }
      const propertyPath = [...path, keyValue];
      if (seen.has(keyValue)) {
        return `Duplicate property "${keyValue}" at ${propertyPath.join('.')}`;
      }
      seen.add(keyValue);
      const valueNode = propertyNode.children?.[1];
      const duplicate = valueNode ? findDuplicateJsoncProperty(valueNode, propertyPath) : undefined;
      if (duplicate) {
        return duplicate;
      }
    }
    return undefined;
  }
  if (node.type === 'array') {
    for (const [index, childNode] of (node.children ?? []).entries()) {
      const duplicate = findDuplicateJsoncProperty(childNode, [...path, String(index)]);
      if (duplicate) {
        return duplicate;
      }
    }
  }
  return undefined;
};

// JSONC 语法交给 jsonc-parser，这里额外拦截重复字段。
const parseJsoncContent = (rawContent: string, source: SitemapDeclarationSource): RawDeclaration => {
  const errors: ParseError[] = [];
  const root = parseTree(rawContent, errors, { allowTrailingComma: true });
  const reason =
    errors.length > 0
      ? errors.map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`).join('; ')
      : root && findDuplicateJsoncProperty(root);
  if (reason) {
    return {
      source,
      parsed: undefined,
      diagnostics: [
        {
          severity: 'warning',
          code: 'sitemap.declaration.invalidJson',
          ...invalidJson(reason),
          filePath: source.filePath,
        },
      ],
    };
  }
  return {
    source,
    parsed: root ? (getNodeValue(root) as unknown) : undefined,
    diagnostics: [],
  };
};

const parseYamlContent = (rawContent: string, source: SitemapDeclarationSource): RawDeclaration => {
  try {
    return {
      source,
      parsed: load(rawContent, { filename: source.filePath }),
      diagnostics: [],
    };
  } catch (error) {
    return {
      source,
      parsed: undefined,
      diagnostics: [
        {
          severity: 'warning',
          code: 'sitemap.declaration.invalidYaml',
          ...invalidYaml(error instanceof Error ? error.message : String(error)),
          filePath: source.filePath,
        },
      ],
    };
  }
};

const parseRawDeclaration = (
  rawContent: string,
  source: Omit<SitemapDeclarationSource, 'format' | 'rawContent'>
): RawDeclaration => {
  const trimmed = rawContent.trim();
  if (trimmed.startsWith('---')) {
    const lines = trimmed.split(/\r?\n/u);
    const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
    const yamlContent = closingIndex === -1 ? lines.slice(1).join('\n') : lines.slice(1, closingIndex).join('\n');
    const yamlSource: SitemapDeclarationSource = {
      ...source,
      format: 'yaml',
      rawContent: yamlContent,
    };
    return parseYamlContent(yamlContent, yamlSource);
  }
  const jsonSource: SitemapDeclarationSource = {
    ...source,
    format: 'json',
    rawContent: trimmed,
  };
  return parseJsoncContent(trimmed, jsonSource);
};

const extractMarkerContent = (commentContent: string): string | undefined => {
  const markerMatch = reactSitemapAnnotationPattern.exec(commentContent);
  if (!markerMatch) {
    return undefined;
  }
  // 这里只剥离 @Sitemap 注解外壳，JSONC/JSON/YAML 正文继续交给社区解析器处理。
  const rawContent = commentContent.slice(markerMatch.index + reactSitemapAnnotation.length).trim();
  if (rawContent.startsWith('(') && rawContent.endsWith(')')) {
    return rawContent.slice(1, -1).trim();
  }
  return rawContent;
};

const parseVueDeclaration = (filePath: string, content: string): PageSitemapDeclarationResult => {
  const matches = [...content.matchAll(/<sitemap\b(?=[^>]*\blang=["']json["'])[^>]*>([\s\S]*?)<\/sitemap>/giu)];
  if (matches.length > 1) {
    return {
      diagnostics: [
        {
          severity: 'warning',
          code: 'sitemap.declaration.duplicate',
          message: 'A page may declare only one sitemap block; the page is generated without a declaration',
          filePath,
        },
      ],
    };
  }
  const rawContent = matches[0]?.[1];
  if (!rawContent) {
    return { diagnostics: [] };
  }
  const rawDeclaration = parseJsonContent(rawContent.trim(), {
    filePath,
    sourceKind: 'vue-custom-block-json',
    rawContent: rawContent.trim(),
    format: 'json',
  });
  if (rawDeclaration.diagnostics.length > 0) {
    return { diagnostics: rawDeclaration.diagnostics };
  }
  return parsePageSitemapDeclarationObject(rawDeclaration.parsed, rawDeclaration.source);
};

const readHeaderComments = (content: string): string[] => {
  const comments: string[] = [];
  let index = 0;
  while (index < content.length) {
    const whitespace = /^\s*/u.exec(content.slice(index))?.[0] ?? '';
    index += whitespace.length;
    if (content.startsWith('/*', index)) {
      const end = content.indexOf('*/', index + 2);
      if (end === -1) {
        return comments;
      }
      comments.push(content.slice(index, end + 2));
      index = end + 2;
      continue;
    }
    if (content.startsWith('{/*', index)) {
      const end = content.indexOf('*/}', index + 3);
      if (end === -1) {
        return comments;
      }
      comments.push(content.slice(index, end + 3));
      index = end + 3;
      continue;
    }
    return comments;
  }
  return comments;
};

const parseReactDeclaration = (filePath: string, content: string): PageSitemapDeclarationResult => {
  const headerDeclarationContents = readHeaderComments(content)
    .map(stripCommentDecorators)
    .map(extractMarkerContent)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  if (headerDeclarationContents.length > 1) {
    return {
      diagnostics: [
        {
          severity: 'warning',
          code: 'sitemap.declaration.duplicate',
          message: 'A page may declare only one sitemap header comment; the page is generated without a declaration',
          filePath,
        },
      ],
    };
  }
  if (headerDeclarationContents.length === 0) {
    if (reactSitemapAnnotationPattern.test(content)) {
      return {
        diagnostics: [
          {
            severity: 'warning',
            code: 'sitemap.declaration.unsupportedPlacement',
            message:
              'A React sitemap declaration must be in the header comment; the page is generated without a declaration',
            filePath,
          },
        ],
      };
    }
    return { diagnostics: [] };
  }

  const rawDeclaration = parseRawDeclaration(headerDeclarationContents[0] ?? '', {
    filePath,
    sourceKind: headerDeclarationContents[0]?.trim().startsWith('---')
      ? 'react-header-comment-yaml'
      : 'react-header-comment-json',
  });
  if (rawDeclaration.diagnostics.length > 0) {
    return { diagnostics: rawDeclaration.diagnostics };
  }
  return parsePageSitemapDeclarationObject(rawDeclaration.parsed, rawDeclaration.source);
};

/**
 * 按文件类型解析页面 Sitemap 声明，Vue 读自定义块，React 读文件头注释。
 */
export const parsePageSitemapDeclaration = (filePath: string, content: string): PageSitemapDeclarationResult => {
  if (filePath.endsWith('.vue')) {
    return parseVueDeclaration(filePath, content);
  }
  // React/TSX 不支持裸 frontmatter，因此只读取文件头部注释中的 @Sitemap 契约。
  return parseReactDeclaration(filePath, content);
};
