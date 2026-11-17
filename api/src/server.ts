import { buildApp } from './app.js';
import { createPool, migrate } from './db.js';

const db = createPool();
await migrate(db, (m) => console.log(m));
const app = await buildApp({
  db,
  logger: true,
  dailyReportLimit: Number(process.env.DAILY_REPORT_LIMIT ?? 10),
});
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    await db.end();
    process.exit(0);
  });
}
