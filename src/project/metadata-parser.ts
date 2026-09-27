/**
 * meta.json 解析：逐字段校验结构、必填项与唯一性。
 */
import { asArray, asObject, asString, optionalString, type JsonObject } from '../json.js';
import { fail, ok, type SpecResult } from '../result.js';
import type { ComponentMetadata, ProjectMetadata, ProjectRelease } from './metadata.js';

const getProperty = (objectValue: JsonObject, key: string): unknown => objectValue[key];

const readRelease = (value: unknown, fieldPath: string, relatedFile: string): SpecResult<ProjectRelease> => {
  const objectResult = asObject(value, fieldPath, relatedFile);
  if (!objectResult.ok) {
    return objectResult;
  }
  const branchResult = asString(getProperty(objectResult.value, 'branch'), `${fieldPath}.branch`, relatedFile);
  if (!branchResult.ok) {
    return branchResult;
  }
  const versionResult = asString(getProperty(objectResult.value, 'version'), `${fieldPath}.version`, relatedFile);
  if (!versionResult.ok) {
    return versionResult;
  }
  return ok({
    branch: branchResult.value,
    version: versionResult.value,
  });
};

const readRepository = (
  objectValue: JsonObject,
  fieldPath: string,
  relatedFile: string
): SpecResult<{ type: 'git'; url: string }> => {
  const repositoryResult = asObject(getProperty(objectValue, 'repository'), `${fieldPath}.repository`, relatedFile);
  if (!repositoryResult.ok) {
    return repositoryResult;
  }
  const typeResult = asString(getProperty(repositoryResult.value, 'type'), `${fieldPath}.repository.type`, relatedFile);
  if (!typeResult.ok) {
    return typeResult;
  }
  if (typeResult.value !== 'git') {
    return fail('invalid_project_metadata', `${fieldPath}.repository.type must be git`, {
      relatedFile,
      relatedField: `${fieldPath}.repository.type`,
    });
  }
  const urlResult = asString(getProperty(repositoryResult.value, 'url'), `${fieldPath}.repository.url`, relatedFile, {
    allowEmpty: true,
  });
  if (!urlResult.ok) {
    return urlResult;
  }
  return ok({
    type: 'git',
    url: urlResult.value,
  });
};

const readComponent = (
  value: unknown,
  fieldPath: string,
  relatedFile: string,
  requirePathname: boolean
): SpecResult<ComponentMetadata> => {
  const objectResult = asObject(value, fieldPath, relatedFile);
  if (!objectResult.ok) {
    return objectResult;
  }
  const nameResult = asString(getProperty(objectResult.value, 'name'), `${fieldPath}.name`, relatedFile);
  if (!nameResult.ok) {
    return nameResult;
  }
  const descriptionResult = optionalString(
    getProperty(objectResult.value, 'description'),
    `${fieldPath}.description`,
    relatedFile
  );
  if (!descriptionResult.ok) {
    return descriptionResult;
  }
  const repositoryResult = readRepository(objectResult.value, fieldPath, relatedFile);
  if (!repositoryResult.ok) {
    return repositoryResult;
  }
  const releaseResult = readRelease(getProperty(objectResult.value, 'release'), `${fieldPath}.release`, relatedFile);
  if (!releaseResult.ok) {
    return releaseResult;
  }
  const component: ComponentMetadata = {
    name: nameResult.value,
    repository: repositoryResult.value,
    release: releaseResult.value,
  };
  if (descriptionResult.value !== undefined) {
    component.description = descriptionResult.value;
  }
  if (requirePathname) {
    const pathnameResult = asString(getProperty(objectResult.value, 'pathname'), `${fieldPath}.pathname`, relatedFile);
    if (!pathnameResult.ok) {
      return pathnameResult;
    }
    component.pathname = pathnameResult.value;
  }
  return ok(component);
};

const ensureUnique = (values: string[], fieldPath: string, relatedFile: string): SpecResult<void> => {
  const seen = new Set<string>();
  const duplicate = values.find((value) => {
    if (seen.has(value)) {
      return true;
    }
    seen.add(value);
    return false;
  });
  if (duplicate) {
    return fail('invalid_project_metadata', `${fieldPath} has a duplicate value: ${duplicate}`, {
      relatedFile,
      relatedField: fieldPath,
    });
  }
  return ok(undefined);
};

/**
 * 从未知 JSON 值解析项目元数据，并逐字段校验必填项与唯一性。
 */
export const parseProjectMetadata = (value: unknown, relatedFile: string): SpecResult<ProjectMetadata> => {
  const objectResult = asObject(value, '$', relatedFile);
  if (!objectResult.ok) {
    return objectResult;
  }

  // meta.json 是外部配置仓库的信任边界；这里逐字段收窄，避免把未知 JSON 直接传入运行逻辑。
  const nameResult = asString(getProperty(objectResult.value, 'name'), 'name', relatedFile);
  if (!nameResult.ok) {
    return nameResult;
  }
  const descriptionResult = asString(getProperty(objectResult.value, 'description'), 'description', relatedFile, {
    allowEmpty: true,
  });
  if (!descriptionResult.ok) {
    return descriptionResult;
  }
  const versionResult = asString(getProperty(objectResult.value, 'version'), 'version', relatedFile);
  if (!versionResult.ok) {
    return versionResult;
  }
  const releaseResult = readRelease(getProperty(objectResult.value, 'release'), 'release', relatedFile);
  if (!releaseResult.ok) {
    return releaseResult;
  }
  const containerResult = readComponent(getProperty(objectResult.value, 'container'), 'container', relatedFile, false);
  if (!containerResult.ok) {
    return containerResult;
  }
  const microappsArrayResult = asArray(getProperty(objectResult.value, 'microapps'), 'microapps', relatedFile);
  if (!microappsArrayResult.ok) {
    return microappsArrayResult;
  }
  const microapps: ComponentMetadata[] = [];
  for (let index = 0; index < microappsArrayResult.value.length; index += 1) {
    const componentResult = readComponent(microappsArrayResult.value[index], `microapps[${index}]`, relatedFile, true);
    if (!componentResult.ok) {
      return componentResult;
    }
    microapps.push(componentResult.value);
  }
  const nameUniqueResult = ensureUnique(
    microapps.map((microapp) => microapp.name),
    'microapps[].name',
    relatedFile
  );
  if (!nameUniqueResult.ok) {
    return nameUniqueResult;
  }
  const pathnameUniqueResult = ensureUnique(
    microapps.map((microapp) => microapp.pathname ?? ''),
    'microapps[].pathname',
    relatedFile
  );
  if (!pathnameUniqueResult.ok) {
    return pathnameUniqueResult;
  }
  const preferenceResult = asObject(getProperty(objectResult.value, 'preference'), 'preference', relatedFile);
  if (!preferenceResult.ok) {
    return preferenceResult;
  }
  const defaultMicroappResult = asString(
    getProperty(preferenceResult.value, 'default_microapp'),
    'preference.default_microapp',
    relatedFile,
    { allowEmpty: microapps.length === 0 }
  );
  if (!defaultMicroappResult.ok) {
    return defaultMicroappResult;
  }
  const hasDefaultMicroapp = microapps.some((microapp) => microapp.name === defaultMicroappResult.value);
  if (!hasDefaultMicroapp && microapps.length > 0) {
    return fail('invalid_project_metadata', 'preference.default_microapp must name a declared microapp', {
      relatedFile,
      relatedField: 'preference.default_microapp',
    });
  }

  return ok({
    name: nameResult.value,
    description: descriptionResult.value,
    version: versionResult.value,
    release: releaseResult.value,
    container: containerResult.value,
    microapps,
    preference: {
      ...preferenceResult.value,
      defaultMicroappName: defaultMicroappResult.value,
    },
  });
};
