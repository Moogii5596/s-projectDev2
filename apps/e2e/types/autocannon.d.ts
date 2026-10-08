declare module 'autocannon' {
  // autocannon@8 үр дүнгийн ашиглагддаг хэсэг (lib/aggregateResult.js)
  export interface AutocannonResult {
    latency: { p99: number; average: number };
    requests: { average: number };
    errors: number;
    timeouts: number;
    non2xx: number;
    '2xx': number;
    statusCodeStats?: Record<string, { count: number }>;
  }

  const autocannon: (options: Record<string, unknown>) => Promise<AutocannonResult>;

  export default autocannon;
}
