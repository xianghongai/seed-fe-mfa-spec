/**
 * 解析结果：成功值或失败原因。失败原因带错误编码、英文消息与可选的定位信息。
 */
export interface SpecError {
  code: string;
  message: string;
  relatedFile?: string;
  relatedField?: string;
}

export type SpecResult<TValue> = { ok: true; value: TValue } | { ok: false; error: SpecError };

export const ok = <TValue>(value: TValue): SpecResult<TValue> => ({ ok: true, value });

export const fail = (
  code: string,
  message: string,
  location: { relatedFile?: string | undefined; relatedField?: string | undefined } = {}
): SpecResult<never> => {
  const error: SpecError = { code, message };
  if (location.relatedFile) {
    error.relatedFile = location.relatedFile;
  }
  if (location.relatedField) {
    error.relatedField = location.relatedField;
  }
  return { ok: false, error };
};
