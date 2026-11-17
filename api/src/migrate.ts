import { createPool, migrate } from './db.js';

const db = createPool();
await migrate(db, console.log);
console.log('migrações em dia');
await db.end();
