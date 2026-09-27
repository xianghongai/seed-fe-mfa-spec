/**
 * JSON 值的收窄工具：把未知值收窄为对象、数组或字符串，失败时给出字段路径。
 */
import { fail, ok, type SpecResult } from './result.js';

export type JsonObject = Record<string, unknown>;

/** A plain JSON object: not null and not an array. */
export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fieldError = (code: string, message: string, fieldPath: string, relatedFile?: string) =>
  fail(code, message, { relatedFile, relatedField: fieldPath });

export const asObject = (value: unknown, fieldPath: string, relatedFile?: string): SpecResult<JsonObject> =>
  isJsonObject(value)
    ? ok(value)
    : fieldError('invalid_field_type', `${fieldPath} must be an object`, fieldPath, relatedFile);

export const asArray = (value: unknown, fieldPath: string, relatedFile?: string): SpecResult<unknown[]> =>
  Array.isArray(value)
    ? ok(value)
    : fieldError('invalid_field_type', `${fieldPath} must be an array`, fieldPath, relatedFile);

/** 必填字符串；默认不允许空白字符串。 */
export const asString = (
  value: unknown,
  fieldPath: string,
  relatedFile?: string,
  options: { allowEmpty?: boolean } = {}
): SpecResult<string> => {
  if (typeof value !== 'string') {
    return fieldError('invalid_field_type', `${fieldPath} must be a string`, fieldPath, relatedFile);
  }
  if (!options.allowEmpty && value.trim().length === 0) {
    return fieldError('invalid_field_value', `${fieldPath} must not be empty`, fieldPath, relatedFile);
  }
  return ok(value);
};

/** 可选字符串：缺省为 undefined，存在时仍校验类型。 */
export const optionalString = (
  value: unknown,
  fieldPath: string,
  relatedFile?: string
): SpecResult<string | undefined> =>
  value === undefined || value === null ? ok(undefined) : asString(value, fieldPath, relatedFile, { allowEmpty: true });
