import { createApp } from './app.js';

const app = createApp();
const port = await app.start(Number(process.env.HEAT_PORT ?? '8000'), process.env.HEAT_HOST ?? '127.0.0.1');
console.log(`heat listening on http://localhost:${port}`);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => app.close().then(() => process.exit(0)));
}
