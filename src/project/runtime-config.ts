/**
 * 运行配置生成：把 meta.json 元数据转换为容器消费的 project.config.json。
 */
import type { ProjectMetadata, ProjectRuntimeConfig } from './metadata.js';

/**
 * 将 meta.json 领域模型转换为运行时 project.config.json 消费的字段命名。
 */
export const generateProjectRuntimeConfig = (metadata: ProjectMetadata): ProjectRuntimeConfig => {
  const { defaultMicroappName, ...preference } = metadata.preference;
  return {
    name: metadata.name,
    release: {
      version: metadata.release.version,
    },
    container: {
      name: metadata.container.name,
      version: metadata.container.release.version,
    },
    microapps: metadata.microapps.map((microapp) => ({
      name: microapp.name,
      pathname: microapp.pathname ?? microapp.name,
      version: microapp.release.version,
    })),
    preference: {
      ...preference,
      default_microapp: defaultMicroappName,
    },
  };
};
