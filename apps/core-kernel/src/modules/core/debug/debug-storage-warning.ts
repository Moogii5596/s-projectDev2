export interface DebugStorageWarning {
  thresholdGb: number | null;
  combinedBytes: number | null;
  overThreshold: boolean | null;
  configValid: boolean;
}

export function evaluateDebugStorageWarning(
  databaseBytes: number | undefined,
  storageBytes: number | undefined,
  configuredThreshold?: string,
): DebugStorageWarning {
  const rawThreshold = configuredThreshold === undefined ? '10' : configuredThreshold.trim();
  const thresholdGb = Number(rawThreshold);
  if (!rawThreshold || !Number.isFinite(thresholdGb) || thresholdGb <= 0) {
    return { thresholdGb: null, combinedBytes: null, overThreshold: null, configValid: false };
  }
  if (databaseBytes === undefined || storageBytes === undefined) {
    return { thresholdGb, combinedBytes: null, overThreshold: null, configValid: true };
  }
  const combinedBytes = databaseBytes + storageBytes;
  return {
    thresholdGb,
    combinedBytes,
    overThreshold: combinedBytes > thresholdGb * 1024 ** 3,
    configValid: true,
  };
}
