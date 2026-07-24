const base = process.env.API_BASE_URL ?? "http://localhost:3010/api";
const adminId = process.env.E2E_ADMIN_ID ?? "26000000-0000-4000-8000-000000000011";
const pin = process.env.E2E_PIN ?? "1234";

const login = await fetch(`${base}/auth/pin`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ employeeId: adminId, pin }),
});
if (!login.ok) throw new Error(`Performance login failed: ${login.status}`);
const { token } = await login.json() as { token: string };

interface Scenario {
  name: string;
  path: string;
  authenticated: boolean;
}
const scenarios: Scenario[] = [
  { name: "tpv-orders", path: "/zones", authenticated: true },
  { name: "qr-menu", path: "/public/menu", authenticated: false },
  { name: "reservations", path: "/reservations", authenticated: true },
  { name: "printing", path: "/admin/printers", authenticated: true },
  { name: "stock", path: "/admin/ingredients", authenticated: true },
];

const total = Number(process.env.PERF_REQUESTS ?? 50);
const concurrency = Number(process.env.PERF_CONCURRENCY ?? 10);
const p95Limit = Number(process.env.PERF_P95_LIMIT_MS ?? 1_000);
const report: Record<string, unknown>[] = [];

for (const scenario of scenarios) {
  const durations: number[] = [];
  let errors = 0;
  for (let offset = 0; offset < total; offset += concurrency) {
    await Promise.all(Array.from({ length: Math.min(concurrency, total - offset) }, async () => {
      const started = performance.now();
      const response = await fetch(`${base}${scenario.path}`, {
        headers: scenario.authenticated ? { authorization: `Bearer ${token}` } : undefined,
      });
      durations.push(performance.now() - started);
      if (!response.ok) errors += 1;
      await response.arrayBuffer();
    }));
  }
  durations.sort((a, b) => a - b);
  const percentile = (value: number) => durations[Math.min(durations.length - 1, Math.floor(durations.length * value))]!;
  const result = {
    module: scenario.name,
    requests: total,
    concurrency,
    errors,
    p50Ms: Number(percentile(0.50).toFixed(1)),
    p95Ms: Number(percentile(0.95).toFixed(1)),
    p99Ms: Number(percentile(0.99).toFixed(1)),
  };
  report.push(result);
  if (errors > 0 || result.p95Ms > p95Limit) process.exitCode = 1;
}
console.log(JSON.stringify({ p95LimitMs: p95Limit, report }, null, 2));
