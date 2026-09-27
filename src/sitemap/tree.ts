/**
 * Sitemap 树结构工具：扁平化、重建与层级校验。
 */
import type { SitemapDiagnostic } from './diagnostic.js';
import type { SitemapNode } from './node.js';

/**
 * 扁平化后的 Sitemap 节点，depth 表示它在树中的缩进层级。
 */
export interface FlatSitemapNode {
  node: SitemapNode;
  depth: number;
}

/**
 * 将树按先序遍历展平成列表，供 Webview 树编辑和统计使用。
 */
export const flattenSitemapTree = (nodes: readonly SitemapNode[], depth = 0): FlatSitemapNode[] =>
  nodes.flatMap((node) => [{ node, depth }, ...flattenSitemapTree(node.children, depth + 1)]);

/**
 * 根据扁平节点和 depth 重建树结构，用于拖拽调整后的保存。
 */
export const rebuildTreeFromFlatNodes = (flatNodes: readonly FlatSitemapNode[]): SitemapNode[] => {
  const roots: SitemapNode[] = [];
  const stack: { depth: number; node: SitemapNode }[] = [];
  flatNodes.forEach((flatNode) => {
    const nextNode: SitemapNode = {
      ...flatNode.node,
      children: [],
    };
    while (stack.length > 0) {
      const last = stack[stack.length - 1];
      // 弹出不可能成为父节点的同级或更深节点，栈顶即为最近父节点。
      if (!last || last.depth < flatNode.depth) {
        break;
      }
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.node.children.push(nextNode);
    } else {
      roots.push(nextNode);
    }
    stack.push({ depth: flatNode.depth, node: nextNode });
  });
  return roots;
};

/**
 * 校验 Sitemap 树结构，拦截重复挂载和循环层级。
 */
export const validateSitemapTree = (
  nodes: readonly SitemapNode[],
  filePath?: string,
  applicationName?: string
): SitemapDiagnostic[] => {
  const diagnostics: SitemapDiagnostic[] = [];
  const seenKeys = new Set<string>();

  const pushInvalidTreeDiagnostic = (message: string, key: string): void => {
    const diagnostic: SitemapDiagnostic = {
      severity: 'error',
      code: 'sitemap.application.invalidTree',
      message,
      values: { key },
    };
    if (filePath) {
      diagnostic.filePath = filePath;
    }
    if (applicationName) {
      diagnostic.applicationName = applicationName;
    }
    diagnostics.push(diagnostic);
  };

  const visit = (node: SitemapNode, ancestors: readonly string[]): void => {
    if (ancestors.includes(node.key)) {
      pushInvalidTreeDiagnostic(`Node ${node.key} forms a cycle`, node.key);
      return;
    }
    if (seenKeys.has(node.key)) {
      pushInvalidTreeDiagnostic(`Node ${node.key} is mounted more than once`, node.key);
      return;
    }
    seenKeys.add(node.key);
    node.children.forEach((child) => {
      visit(child, [...ancestors, node.key]);
    });
  };

  nodes.forEach((node) => {
    visit(node, []);
  });
  return diagnostics;
};
