/**
 * 应用 Sitemap 生成器，负责从页面路由生成节点、检测重复项并保留已有层级。
 */
import { hasErrorDiagnostics, type SitemapDiagnostic } from './diagnostic.js';
import {
  createApplicationSitemapNodeKey,
  createSitemapBaseKey,
  sitemapNodeFields,
  type SitemapGenerationSummary,
  type SitemapNode,
} from './node.js';
import type { RoutePage } from './route.js';
import { validateSitemapTree } from './tree.js';

/**
 * 应用级 Sitemap 生成输入：页面、既有树、包名和 key 分隔符。
 */
export interface ApplicationSitemapGenerationInput {
  applicationName: string;
  packageName: string;
  keySeparator: string;
  routePages: RoutePage[];
  existingNodes: SitemapNode[];
  pageRootCount: number;
}

/**
 * 应用级 Sitemap 生成结果，返回新树、诊断和节点统计摘要。
 */
export interface ApplicationSitemapGenerationResult {
  nodes: SitemapNode[];
  diagnostics: SitemapDiagnostic[];
  summary: SitemapGenerationSummary;
}

const buildNodeFromRoutePage = (routePage: RoutePage, packageName: string, keySeparator: string): SitemapNode => {
  const declarationKey = routePage.declaration?.key;
  // 声明 key 只作为页面基准 key，最终 key 仍强制携带 package name 前缀。
  const baseKey = declarationKey ?? createSitemapBaseKey(routePage.routePath, routePage.routeName);
  const key = createApplicationSitemapNodeKey(packageName, baseKey, keySeparator);
  const node: SitemapNode = {
    ...(routePage.declaration?.properties ?? {}),
    key,
    path: routePage.routePath,
    children: [],
  };
  return node;
};

const detectDuplicates = (nodes: readonly SitemapNode[], applicationName: string): SitemapDiagnostic[] => {
  const diagnostics: SitemapDiagnostic[] = [];
  const keySources = new Map<string, string>();
  const pathSources = new Map<string, string>();

  nodes.forEach((node) => {
    const duplicateKey = keySources.get(node.key);
    if (duplicateKey) {
      diagnostics.push({
        severity: 'error',
        code: 'sitemap.application.duplicateKey',
        message: `Duplicate sitemap key: ${node.key}`,
        values: { key: node.key },
        filePath: node.key,
        fieldPath: `${sitemapNodeFields.key}; first=${duplicateKey}`,
        applicationName,
      });
    } else {
      keySources.set(node.key, node.path);
    }

    const duplicatePath = pathSources.get(node.path);
    if (duplicatePath) {
      diagnostics.push({
        severity: 'error',
        code: 'sitemap.application.duplicatePath',
        message: `Duplicate sitemap path: ${node.path}`,
        values: { path: node.path },
        filePath: node.path,
        fieldPath: `${sitemapNodeFields.path}; first=${duplicatePath}`,
        applicationName,
      });
    } else {
      pathSources.set(node.path, node.key);
    }
  });
  return diagnostics;
};

const flattenedPathSegments = (path: string): string[] => path.split('/').filter((segment) => segment.length > 0);

const findParentPath = (path: string, availablePaths: ReadonlySet<string>): string | undefined => {
  const segments = flattenedPathSegments(path);
  for (let index = segments.length - 1; index > 0; index -= 1) {
    const parentPath = `/${segments.slice(0, index).join('/')}`;
    if (availablePaths.has(parentPath)) {
      return parentPath;
    }
  }
  return undefined;
};

const sortByRoutePath = (nodes: readonly SitemapNode[]): SitemapNode[] =>
  [...nodes].sort((left, right) => {
    const depthDelta = flattenedPathSegments(left.path).length - flattenedPathSegments(right.path).length;
    return depthDelta === 0 ? left.path.localeCompare(right.path, 'zh-CN') : depthDelta;
  });

const cloneNodeWithoutChildren = (node: SitemapNode): SitemapNode => ({
  ...node,
  children: [],
});

const insertByRoutePath = (
  roots: SitemapNode[],
  targetByKey: Map<string, SitemapNode>,
  pathToKey: ReadonlyMap<string, string>,
  node: SitemapNode
): void => {
  const nextNode = cloneNodeWithoutChildren(node);
  const parentPath = findParentPath(node.path, new Set(pathToKey.keys()));
  const parentKey = parentPath ? pathToKey.get(parentPath) : undefined;
  const parent = parentKey ? targetByKey.get(parentKey) : undefined;
  if (parent) {
    parent.children.push(nextNode);
  } else {
    roots.push(nextNode);
  }
  targetByKey.set(nextNode.key, nextNode);
};

const countNodes = (nodes: readonly SitemapNode[]): number =>
  nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);

const preserveHierarchy = (
  flatNodes: readonly SitemapNode[],
  existingNodes: readonly SitemapNode[]
): { nodes: SitemapNode[]; preservedCount: number; removedCount: number } => {
  const byKey = new Map(flatNodes.map((node) => [node.key, node]));
  const pathToKey = new Map(flatNodes.map((node) => [node.path, node.key]));
  const targetByKey = new Map<string, SitemapNode>();
  const used = new Set<string>();
  let preservedCount = 0;
  let removedCount = 0;

  const cloneExistingShape = (existingNode: SitemapNode): SitemapNode | undefined => {
    // 只保留仍能匹配当前页面的旧节点，避免删除页面后残留不可达节点。
    const current = byKey.get(existingNode.key);
    if (!current || used.has(existingNode.key)) {
      removedCount += 1;
      return undefined;
    }
    used.add(existingNode.key);
    const children = existingNode.children.map(cloneExistingShape).filter((node): node is SitemapNode => Boolean(node));
    if (children.length > 0) {
      preservedCount += children.length;
    }
    const clonedNode = {
      ...current,
      children,
    };
    targetByKey.set(clonedNode.key, clonedNode);
    return clonedNode;
  };

  const roots = existingNodes.map(cloneExistingShape).filter((node): node is SitemapNode => Boolean(node));
  sortByRoutePath(flatNodes.filter((node) => !used.has(node.key))).forEach((node) => {
    // 新增页面按路由父子关系自动挂载，已有人工层级不参与重新排序。
    insertByRoutePath(roots, targetByKey, pathToKey, node);
  });
  return {
    nodes: roots,
    preservedCount,
    removedCount,
  };
};

/**
 * 从页面扫描结果生成应用 Sitemap；已有树有效时保留人工调整的层级。
 */
export const generateApplicationSitemap = (
  input: ApplicationSitemapGenerationInput
): ApplicationSitemapGenerationResult => {
  const diagnostics: SitemapDiagnostic[] = [];
  const flatNodes: SitemapNode[] = [];
  input.routePages.forEach((routePage) => {
    flatNodes.push(buildNodeFromRoutePage(routePage, input.packageName, input.keySeparator));
  });

  diagnostics.push(...detectDuplicates(flatNodes, input.applicationName));
  const treeDiagnostics = validateSitemapTree(input.existingNodes, undefined, input.applicationName);
  diagnostics.push(...treeDiagnostics);

  // 旧树结构无效时不再信任其层级，只使用当前页面重新生成一棵干净的树。
  const preserved = hasErrorDiagnostics(treeDiagnostics)
    ? { ...preserveHierarchy(flatNodes, []), removedCount: input.existingNodes.length }
    : preserveHierarchy(flatNodes, input.existingNodes);

  return {
    nodes: preserved.nodes,
    diagnostics,
    summary: {
      pageCount: input.routePages.length,
      nodeCount: countNodes(preserved.nodes),
      preservedHierarchyCount: preserved.preservedCount,
      removedNodeCount: preserved.removedCount,
      skippedCount: 0,
      pageRootCount: input.pageRootCount,
    },
  };
};
