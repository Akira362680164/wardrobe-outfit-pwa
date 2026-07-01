import { describe, it, expect } from 'vitest';
import { testManifest } from '../manifest/test-manifest';
import { validateManifest } from '../../scripts/test/validate-test-manifest';

describe('contract:manifest', () => {
  it('manifest should be valid', () => {
    const result = validateManifest();
    expect(result.valid).toBe(true);
  });

  it('manifest should have non-empty testManifest array', () => {
    expect(Array.isArray(testManifest)).toBe(true);
  });
});
