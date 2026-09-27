/**
 * 工程级 Sitemap 合并：读取各微应用已有的 Sitemap，为 path 加上挂载路径；
 * 应用 Sitemap 缺失或无效时保留既有工程级节点，否则跳过；最后检查跨应用的 key 与 path 冲突。
 */
import { workspaceDirectories } from '../project/metadata.js';
import type { SitemapDiagnostic } from './diagnostic.js';
import type { SitemapParseResult } from './file.js';
import {
  applicationSitemapRelativePath,
  hasSitemapNodeKeyPrefix,
  projectSitemapRelativePath,
  sitemapNodeFields,
  type SitemapNode,
} from './node.js';

/** 参与合并的微应用：包名与挂载路径（缺省为包名）。 */
export interface ProjectSitemapMicroapp {
  name: string;
  pathname?: string | undefined;
}

export interface ProjectSitemapMergeInput {
  microapps: readonly ProjectSitemapMicroapp[];
  /** 既有的工程级 Sitemap；它的诊断降级为警告后继续合并。 */
  existing: SitemapParseResult;
  /** 各微应用的应用级 Sitemap，按包名索引；没有文件时给空树或不提供。 */
  applications: ReadonlyMap<string, SitemapParseResult>;
  keySeparator: string;
}

/** 工程级合并摘要，区分更新、保留和跳过的微应用数量。 */
export interface ProjectSitemapGenerationSummary {
  updatedApplicationCount: number;
  preservedApplicationCount: number;
  nodeCount: number;
  skippedApplicationCount: number;
}

export interface ProjectSitemapMergeResult {
  nodes: SitemapNode[];
  diagnostics: SitemapDiagnostic[];
  summary: ProjectSitemapGenerationSummary;
}

type ApplicationMergeStatus = 'updated' | 'preserved' | 'skipped';

const joinRoutePath = (prefix: string, path: string): string => {
  const cleanPrefix = prefix.startsWith('/') ? prefix : `/${prefix}`;
  if (path === '/') {
    return cleanPrefix;
  }
  return `${cleanPrefix.replace(/\/$/u, '')}/${path.replace(/^\//u, '')}`;
};

const flattenNodes = (nodes: readonly SitemapNode[]): SitemapNode[] =>
  nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);

const applicationSitemapFilePath = (microapp: ProjectSitemapMicroapp): string =>
  `${workspaceDirectories.microapps}/${microapp.name}/${applicationSitemapRelativePath}`;

const applicationMountPrefix = (microapp: ProjectSitemapMicroapp): string => {
  const pathname = microapp.pathname?.trim();
  return pathname && pathname.length > 0 ? pathname : microapp.name;
};

const normalizeMountPath = (prefix: string): string => `/${prefix.replace(/^\/+/u, '').replace(/\/+$/u, '')}`;

const pathBelongsToApplication = (node: SitemapNode, microapp: ProjectSitemapMicroapp): boolean => {
  const mountPath = normalizeMountPath(applicationMountPrefix(microapp));
  return flattenNodes([node]).some((item) => item.path === mountPath || item.path.startsWith(`${mountPath}/`));
};

const keyLooksLikeApplication = (node: SitemapNode, microapp: ProjectSitemapMicroapp, keySeparator: string): boolean =>
  flattenNodes([node]).some((item) => hasSitemapNodeKeyPrefix(item.key, microapp.name, keySeparator));

const findExistingOwner = (
  node: SitemapNode,
  microapps: readonly ProjectSitemapMicroapp[],
  keySeparator: string
): ProjectSitemapMicroapp | undefined => {
  const keyOwner = microapps.find((microapp) => keyLooksLikeApplication(node, microapp, keySeparator));
  if (keyOwner) {
    return keyOwner;
  }
  // 历史工程树可能缺少可识别的 key 前缀，退而按挂载路径最长匹配寻找归属。
  return microapps
    .filter((microapp) => pathBelongsToApplication(node, microapp))
    .sort((left, right) => applicationMountPrefix(right).length - applicationMountPrefix(left).length)[0];
};

const groupExistingNodes = (
  microapps: readonly ProjectSitemapMicroapp[],
  existingNodes: readonly SitemapNode[],
  keySeparator: string
): { byApplicationName: Map<string, SitemapNode[]>; diagnostics: SitemapDiagnostic[] } => {
  const byApplicationName = new Map<string, SitemapNode[]>();
  const diagnostics: SitemapDiagnostic[] = [];
  existingNodes.forEach((node) => {
    const owner = findExistingOwner(node, microapps, keySeparator);
    if (!owner) {
      // 不能归属到任何微应用的旧节点不参与合并，避免误挂到其他应用。
      diagnostics.push({
        severity: 'warning',
        code: 'sitemap.project.unattributedExistingNode',
        message: `An existing project sitemap node belongs to no microapp: ${node.key}`,
        values: { key: node.key },
        filePath: projectSitemapRelativePath,
        fieldPath: node.key,
      });
      return;
    }
    byApplicationName.set(owner.name, [...(byApplicationName.get(owner.name) ?? []), node]);
  });
  return { byApplicationName, diagnostics };
};

const withMountPrefix = (node: SitemapNode, mountPrefix?: string): SitemapNode => ({
  ...node,
  path: mountPrefix ? joinRoutePath(mountPrefix, node.path) : node.path,
  children: node.children.map((child) => withMountPrefix(child, mountPrefix)),
});

/** 检查一组节点中重复的 key 与 path。 */
export const detectProjectSitemapDuplicates = (nodes: readonly SitemapNode[]): SitemapDiagnostic[] => {
  const diagnostics: SitemapDiagnostic[] = [];
  const keySources = new Map<string, string>();
  const pathSources = new Map<string, string>();
  flattenNodes(nodes).forEach((node) => {
    const keySource = keySources.get(node.key);
    if (keySource) {
      diagnostics.push({
        severity: 'error',
        code: 'sitemap.project.duplicateKey',
        message: `Duplicate project sitemap key: ${node.key}`,
        values: { key: node.key },
        fieldPath: `${sitemapNodeFields.key}; first=${keySource}`,
      });
    } else {
      keySources.set(node.key, node.path);
    }
    const pathSource = pathSources.get(node.path);
    if (pathSource) {
      diagnostics.push({
        severity: 'error',
        code: 'sitemap.project.duplicatePath',
        message: `Duplicate project sitemap path: ${node.path}`,
        values: { path: node.path },
        fieldPath: `${sitemapNodeFields.path}; first=${pathSource}`,
      });
    } else {
      pathSources.set(node.path, node.key);
    }
  });
  return diagnostics;
};

const preserveOrSkip = (
  microapp: ProjectSitemapMicroapp,
  existingNodes: readonly SitemapNode[] | undefined,
  diagnostics: SitemapDiagnostic[]
): { nodes: SitemapNode[]; diagnostics: SitemapDiagnostic[]; status: ApplicationMergeStatus } => {
  if (existingNodes && existingNodes.length > 0) {
    // 本地缺少某个微应用的 Sitemap 时，优先保留工程级 Sitemap 中的已有节点。
    diagnostics.push({
      severity: 'warning',
      code: 'sitemap.project.applicationPreserved',
      message: 'The microapp has no usable local sitemap; its nodes in the existing project sitemap are kept',
      filePath: projectSitemapRelativePath,
      applicationName: microapp.name,
    });
    return { nodes: existingNodes.map((node) => withMountPrefix(node)), diagnostics, status: 'preserved' };
  }
  diagnostics.push({
    severity: 'warning',
    code: 'sitemap.project.applicationSkipped',
    message: 'The microapp has no usable local sitemap and no existing project nodes; it is skipped',
    applicationName: microapp.name,
  });
  return { nodes: [], diagnostics, status: 'skipped' };
};

const mergeApplication = (
  microapp: ProjectSitemapMicroapp,
  sitemap: SitemapParseResult | undefined,
  existingNodes: readonly SitemapNode[] | undefined
): { nodes: SitemapNode[]; diagnostics: SitemapDiagnostic[]; status: ApplicationMergeStatus } => {
  const nodes = sitemap?.nodes ?? [];
  const problems = [...(sitemap?.diagnostics ?? []), ...detectProjectSitemapDuplicates(nodes)];
  if (problems.length > 0) {
    // 应用级 Sitemap 有问题时不阻断工程，转成警告后进入保留或跳过。
    return preserveOrSkip(
      microapp,
      existingNodes,
      problems.map((diagnostic) => ({
        ...diagnostic,
        severity: 'warning',
        code: 'sitemap.project.invalidApplicationSitemap',
        applicationName: microapp.name,
      }))
    );
  }
  if (nodes.length === 0) {
    return preserveOrSkip(microapp, existingNodes, [
      {
        severity: 'warning',
        code: 'sitemap.project.applicationMissing',
        message: 'The microapp has no public/sitemap.json, or the sitemap is empty',
        filePath: applicationSitemapFilePath(microapp),
        applicationName: microapp.name,
      },
    ]);
  }
  const mountPrefix = applicationMountPrefix(microapp);
  return { nodes: nodes.map((node) => withMountPrefix(node, mountPrefix)), diagnostics: [], status: 'updated' };
};

/**
 * 合并工程级 Sitemap。有 error 级诊断（跨应用的 key 或 path 冲突）时，调用方不应写出结果。
 */
export const mergeProjectSitemap = (input: ProjectSitemapMergeInput): ProjectSitemapMergeResult => {
  // 既有工程级 Sitemap 允许有问题，读取诊断统一降级为警告。
  const diagnostics: SitemapDiagnostic[] = input.existing.diagnostics.map((diagnostic) => ({
    ...diagnostic,
    severity: 'warning',
  }));
  const existing = groupExistingNodes(input.microapps, input.existing.nodes, input.keySeparator);
  diagnostics.push(...existing.diagnostics);

  const nodes: SitemapNode[] = [];
  const summary: ProjectSitemapGenerationSummary = {
    updatedApplicationCount: 0,
    preservedApplicationCount: 0,
    nodeCount: 0,
    skippedApplicationCount: 0,
  };
  input.microapps.forEach((microapp) => {
    // 每个微应用独立合并，单个应用缺失只影响自身统计和警告。
    const result = mergeApplication(
      microapp,
      input.applications.get(microapp.name),
      existing.byApplicationName.get(microapp.name)
    );
    nodes.push(...result.nodes);
    diagnostics.push(...result.diagnostics);
    if (result.status === 'updated') {
      summary.updatedApplicationCount += 1;
    } else if (result.status === 'preserved') {
      summary.preservedApplicationCount += 1;
    } else {
      summary.skippedApplicationCount += 1;
    }
  });

  diagnostics.push(...detectProjectSitemapDuplicates(nodes));
  summary.nodeCount = flattenNodes(nodes).length;
  return { nodes, diagnostics, summary };
};
