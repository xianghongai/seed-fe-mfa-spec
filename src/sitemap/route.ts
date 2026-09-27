/**
 * 页面路由推导器，负责从页面文件路径生成路由路径、路由名和基础 sitemap key。
 */
import type { PageSitemapDeclaration } from './declaration.js';

/**
 * 页面文件推导后的路由信息，是 Sitemap 节点生成的输入。
 */
export interface RoutePage {
  applicationName: string;
  filePath: string;
  routePath: string;
  routeName: string;
  declaration?: PageSitemapDeclaration;
}

const supportedPageExtensions = new Set(['.vue', '.tsx', '.jsx', '.ts', '.js']);

/**
 * 判断扫描到的文件是否可作为页面处理，类型声明文件会被排除。
 */
export const isSupportedPageFile = (filePath: string): boolean => {
  if (filePath.endsWith('.d.ts')) {
    return false;
  }
  const extension = /\.[^./\\]+$/u.exec(filePath)?.[0] ?? '';
  return supportedPageExtensions.has(extension.toLowerCase());
};

const stripPageExtension = (relativePath: string): string => relativePath.replace(/\.(vue|tsx|jsx|ts|js)$/u, '');

const normalizeDynamicSegment = (segment: string): string => {
  // 文件式路由同时兼容 Nuxt 3+ 的 [id] 和 Nuxt 2 的 _id 动态片段。
  if (/^\[\.\.\.[A-Za-z0-9_$-]+\]$/u.test(segment)) {
    return `:${segment.slice(4, -1)}(.*)`;
  }
  if (/^\[[A-Za-z0-9_$-]+\]$/u.test(segment)) {
    return `:${segment.slice(1, -1)}`;
  }
  if (segment.startsWith('$') && segment.length > 1) {
    return `:${segment.slice(1)}`;
  }
  if (segment.startsWith('_') && segment.length > 1) {
    return `:${segment.slice(1)}`;
  }
  return segment;
};

const toRouteName = (segments: readonly string[]): string =>
  segments
    .filter((segment) => segment !== 'index')
    .map((segment) => segment.replace(/^\[|\]$/gu, '').replace(/^[$_]/u, ''))
    .filter((segment) => segment.length > 0)
    .join('-') || 'index';

/**
 * 根据页面根目录和文件路径推导路由路径、路由名和声明信息。
 */
export const deriveRoutePage = (
  applicationName: string,
  pagesRootRelativePath: string,
  filePath: string,
  declaration?: PageSitemapDeclaration
): RoutePage => {
  const normalizedFilePath = filePath.replace(/\\/gu, '/');
  const normalizedRoot = pagesRootRelativePath.replace(/\\/gu, '/').replace(/\/$/u, '');
  const relativePath = normalizedFilePath.startsWith(`${normalizedRoot}/`)
    ? normalizedFilePath.slice(normalizedRoot.length + 1)
    : normalizedFilePath;
  const segments = stripPageExtension(relativePath)
    .split('/')
    .filter((segment) => segment.length > 0);
  // 末尾 index 文件映射为父级路径，符合常见文件式路由约定。
  const routeSegments = segments[segments.length - 1] === 'index' ? segments.slice(0, -1) : segments;
  const routePath = `/${routeSegments.map(normalizeDynamicSegment).join('/')}`.replace(/\/$/u, '');
  const page: RoutePage = {
    applicationName,
    filePath: normalizedFilePath,
    routePath: routePath === '' ? '/' : routePath,
    routeName: toRouteName(segments),
  };
  if (declaration) {
    page.declaration = declaration;
  }
  return page;
};
