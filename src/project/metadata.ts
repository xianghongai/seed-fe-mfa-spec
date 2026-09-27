/**
 * 工程元数据协议（project/meta.json）与工作区布局：目录名、配置文件名与数据结构。
 */

// 目录名属于工作区布局契约，工具、服务和文档共同引用。
export const workspaceDirectories = {
  project: 'project',
  container: 'container',
  microapps: 'microapps',
} as const;

/** 工程元数据文件名，由工程配置仓库提供。 */
export const projectMetadataFileName = 'meta.json';
/** 由元数据生成的运行配置文件名。 */
export const generatedProjectConfigFileName = 'project.config.json';
/** 预设菜单配置文件名。 */
export const menuConfigFileName = 'menu.config.json';
/** 本地开发菜单覆盖文件名，仅由开发者手动维护，不进入交付制品。 */
export const localMenuConfigFileName = 'menu.config.local.json';
/** 工程元数据在工作区内的相对路径。 */
export const projectMetadataRelativePath = `${workspaceDirectories.project}/${projectMetadataFileName}`;
/** 运行配置在工作区内的相对路径。 */
export const generatedProjectConfigRelativePath = `${workspaceDirectories.project}/${generatedProjectConfigFileName}`;

/** 应用源码仓库，目前只接受 Git。 */
export interface ComponentRepository {
  type: 'git';
  url: string;
}

/** 工程或应用的发布信息：迭代分支与版本号。 */
export interface ComponentRelease {
  branch: string;
  version: string;
}

export type ProjectRelease = ComponentRelease;

/** 元数据中的应用声明：源码仓库、挂载路径与版本。 */
export interface ComponentMetadata {
  name: string;
  description?: string;
  pathname?: string;
  repository: ComponentRepository;
  release: ComponentRelease;
}

/** 工程偏好，目前用于标记默认打开的微应用。 */
export interface ProjectPreference {
  defaultMicroappName: string;
  [key: string]: unknown;
}

/** meta.json 解析后的工程元数据。 */
export interface ProjectMetadata {
  name: string;
  description: string;
  version: string;
  release: ProjectRelease;
  container: ComponentMetadata;
  microapps: ComponentMetadata[];
  preference: ProjectPreference;
}

/** 写入 project.config.json 的运行配置，字段名按容器的消费约定保留。 */
export interface ProjectRuntimeConfig {
  name: string;
  release: {
    version: string;
  };
  container: {
    name: string;
    version: string;
  };
  microapps: {
    name: string;
    pathname: string;
    version: string;
  }[];
  preference: {
    default_microapp: string;
    [key: string]: unknown;
  };
}
