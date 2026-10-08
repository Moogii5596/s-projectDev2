declare module 'autocannon' {
  const autocannon: (options: Record<string, unknown>) => Promise<{
    latency: { p99: number };
    errors: number;
    requests: { average: number };
  }>;

  export default autocannon;
}