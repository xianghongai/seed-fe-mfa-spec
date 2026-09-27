import { describe, expect, it } from 'vitest';
import { generateProjectRuntimeConfig, parseProjectMetadata } from '../src/index.js';

const metadata = () => ({
  name: 'sample-web',
  description: '',
  version: '1.0.0',
  release: { branch: 'main', version: '1.0.0-alpha.1' },
  container: {
    name: 'container-sample',
    repository: { type: 'git', url: '' },
    release: { branch: 'main', version: '1.0.0' },
  },
  microapps: [],
  preference: { default_microapp: '', default_path: '/home', layout: { mode: 'side' } },
});

describe('MFA configuration contract', () => {
  it('accepts a local conventional project without remotes or microapps', () => {
    const result = parseProjectMetadata(metadata(), 'meta.json');
    expect(result.ok).toBe(true);
  });

  it('preserves project preferences while omitting source repository details', () => {
    const source = metadata();
    source.container.repository.url = 'https://example.invalid/container.git';
    const result = parseProjectMetadata(source, 'meta.json');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const config = generateProjectRuntimeConfig(result.value);
    expect(config.preference).toEqual(source.preference);
    expect(config.release.version).toBe('1.0.0-alpha.1');
    expect(config.container).toEqual({ name: 'container-sample', version: '1.0.0' });
    expect(JSON.stringify(config)).not.toContain('repository');
  });

  it('reports the field of the first problem', () => {
    const source = { ...metadata(), microapps: [{ name: 'orders' }] };
    const result = parseProjectMetadata(source, 'meta.json');
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'invalid_field_type', relatedFile: 'meta.json', relatedField: 'microapps[0].repository' },
    });
  });
});
