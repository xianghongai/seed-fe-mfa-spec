/**
 * Sitemap 诊断：严重级别、诊断编码、英文消息与定位信息。
 */

/** 严重级别，决定是否阻断以及展示方式。 */
export type SitemapDiagnosticSeverity = 'info' | 'warning' | 'error';

/** 诊断编码，覆盖声明解析、应用生成和工程合并三类问题。 */
export type SitemapDiagnosticCode =
  | 'sitemap.declaration.invalidJson'
  | 'sitemap.declaration.invalidYaml'
  | 'sitemap.declaration.invalidShape'
  | 'sitemap.declaration.keyMissing'
  | 'sitemap.declaration.duplicate'
  | 'sitemap.declaration.unsupportedPlacement'
  | 'sitemap.application.pagesMissing'
  | 'sitemap.application.invalidPageRoot'
  | 'sitemap.application.packageNameMissing'
  | 'sitemap.application.duplicatePath'
  | 'sitemap.application.duplicateKey'
  | 'sitemap.application.invalidTree'
  | 'sitemap.application.invalidSitemap'
  | 'sitemap.project.applicationMissing'
  | 'sitemap.project.applicationSkipped'
  | 'sitemap.project.applicationPreserved'
  | 'sitemap.project.invalidApplicationSitemap'
  | 'sitemap.project.unattributedExistingNode'
  | 'sitemap.project.duplicatePath'
  | 'sitemap.project.duplicateKey';

/**
 * Sitemap 诊断。message 为英文；values 是消息中的参数，需要翻译的界面可以按 code 与 values 重组文案。
 */
export interface SitemapDiagnostic {
  severity: SitemapDiagnosticSeverity;
  code: SitemapDiagnosticCode;
  message: string;
  values?: Record<string, string>;
  filePath?: string;
  fieldPath?: string;
  applicationName?: string;
}

/** 诊断集合中是否有阻断级错误。 */
export const hasErrorDiagnostics = (diagnostics: readonly { severity: SitemapDiagnosticSeverity }[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.severity === 'error');
