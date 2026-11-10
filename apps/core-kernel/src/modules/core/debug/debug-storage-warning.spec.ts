import { describe, expect, it } from 'vitest';
import { evaluateDebugStorageWarning } from './debug-storage-warning';

describe('evaluateDebugStorageWarning', () => {
  it('uses the 10 GB default and reports combined database and storage usage', () => {
    expect(evaluateDebugStorageWarning(4 * 1024 ** 3, 5 * 1024 ** 3)).toEqual({
      thresholdGb: 10,
      combinedBytes: 9 * 1024 ** 3,
      overThreshold: false,
      configValid: true,
    });
  });

  it('reports when the combined usage exceeds the configured threshold', () => {
    expect(evaluateDebugStorageWarning(6 * 1024 ** 3, 5 * 1024 ** 3, '10').overThreshold).toBe(true);
  });

  it('keeps threshold status unavailable when either size check fails', () => {
    expect(evaluateDebugStorageWarning(undefined, 2 * 1024 ** 3, '8')).toEqual({
      thresholdGb: 8,
      combinedBytes: null,
      overThreshold: null,
      configValid: true,
    });
  });

  it('marks invalid thresholds explicitly', () => {
    expect(evaluateDebugStorageWarning(1, 1, '0')).toEqual({
      thresholdGb: null,
      combinedBytes: null,
      overThreshold: null,
      configValid: false,
    });
  });
});
