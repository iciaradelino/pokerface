import express from 'express';
import cors from 'cors';
import { isUuid, validatePlayerInput, validateResultInput } from './validation.js';

function sendError(response, status, code, message) {
  response.status(status).json({ message, code });
}

export function createApp({
  checkDatabase,
  players,
  version = 'local',
  uiOrigin,
  logger = console.log,
}) {
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
  app.use(cors({
    origin: (origin, callback) => callback(null, origin === uiOrigin),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  }));
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', async (_request, response) => {
    try {
      await checkDatabase();
      response.json({ status: 'ok', db: 'ok', version });
    } catch {
      response.status(503).json({ status: 'unavailable', db: 'error', version });
    }
  });

  // Wraps a route so a database failure becomes a clear 503 without exposing details.
  const route = (handler) => async (request, response) => {
    try {
      await handler(request, response);
    } catch {
      sendError(response, 503, 'UNAVAILABLE', 'Player service unavailable');
    }
  };

  // Rejects a malformed :id before touching the database.
  const withValidId = (handler) => (request, response) => {
    if (!isUuid(request.params.id)) {
      return sendError(response, 400, 'INVALID_INPUT', 'Player id must be a UUID');
    }
    return handler(request, response);
  };

  app.post('/players', route(async (request, response) => {
    const { value, error } = validatePlayerInput(request.body, { forCreate: true });
    if (error) return sendError(response, 400, 'INVALID_INPUT', error);
    response.status(201).json(await players.create(value));
  }));

  app.get('/players/:id', withValidId(route(async (request, response) => {
    const player = await players.get(request.params.id);
    if (!player) return sendError(response, 404, 'NOT_FOUND', 'Player not found');
    response.json(player);
  })));

  app.put('/players/:id', withValidId(route(async (request, response) => {
    const { value, error } = validatePlayerInput(request.body, { forCreate: false });
    if (error) return sendError(response, 400, 'INVALID_INPUT', error);
    const player = await players.update(request.params.id, value);
    if (!player) return sendError(response, 404, 'NOT_FOUND', 'Player not found');
    response.json(player);
  })));

  app.delete('/players/:id', withValidId(route(async (request, response) => {
    const removed = await players.remove(request.params.id);
    if (!removed) return sendError(response, 404, 'NOT_FOUND', 'Player not found');
    response.status(204).end();
  })));

  // Called by the game service after each hand. Repeating a handId is safe.
  app.post('/players/:id/results', withValidId(route(async (request, response) => {
    const { value, error } = validateResultInput(request.body);
    if (error) return sendError(response, 400, 'INVALID_INPUT', error);
    const player = await players.saveResult(request.params.id, value);
    if (!player) return sendError(response, 404, 'NOT_FOUND', 'Player not found');
    response.json(player);
  })));

  app.get('/leaderboard', route(async (_request, response) => {
    response.json(await players.leaderboard());
  }));

  app.use((_request, response) => sendError(response, 404, 'NOT_FOUND', 'Not found'));

  // Errors raised before a route runs. Anything the client got wrong (malformed JSON, a body
  // that is too large, a URL such as /players/%ZZ that cannot be decoded) is a 4xx, not an outage.
  app.use((error, _request, response, _next) => {
    const status = error.status ?? error.statusCode;
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
      return sendError(response, 400, 'INVALID_INPUT', 'Request body is not valid JSON or is too large');
    }
    if (status >= 400 && status < 500) {
      return sendError(response, 400, 'INVALID_INPUT', 'Invalid request');
    }
    return sendError(response, 503, 'UNAVAILABLE', 'Player service unavailable');
  });

  return app;
}
