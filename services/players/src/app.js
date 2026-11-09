import express from 'express';
import cors from 'cors';

export function createApp({ checkDatabase, version = 'local', uiOrigin, logger = console.log }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    const started = performance.now();
    response.on('finish', () => logger(JSON.stringify({
      level: 'info',
      event: 'request',
      method: request.method,
      path: request.path,
      status: response.statusCode,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
    })));
    next();
  });
  app.use(cors({ origin: (origin, callback) => callback(null, origin === uiOrigin) }));
  app.get('/health', async (_request, response) => {
    try {
      await checkDatabase();
      response.json({ status: 'ok', db: 'ok', version });
    } catch {
      response.status(503).json({ status: 'unavailable', db: 'error', version });
    }
  });
  app.use((_request, response) => response.status(404).json({ error: 'Not found' }));
  return app;
}
