import autocannon from 'autocannon';

async function runLoadTest() {
  const result = await autocannon({
    url: process.env.LOAD_TEST_URL ?? 'http://localhost:3000/api/v1/requisitions',
    connections: 100,
    duration: Number.parseInt(process.env.LOAD_TEST_DURATION ?? '30', 10),
    headers: {
      Authorization: `Bearer ${process.env.TEST_TOKEN ?? ''}`,
      'x-tenant-slug': process.env.TEST_TENANT_SLUG ?? 'test-tenant',
    },
  });

  console.log(`p99=${result.latency.p99}ms errors=${result.errors} throughput=${result.requests.average}/s`);

  if (result.latency.p99 >= 500 || result.errors > 0) {
    process.exitCode = 1;
  }
}

void runLoadTest();