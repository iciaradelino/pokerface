import express from 'express';
import cors from 'cors';
import { PlayersUnavailableError } from './playersClient.js';
import {
  generateTableId,
  isUuid,
  normalizeTableId,
  validateCreateTableInput,
  validateJoinInput,
} from './validation.js';

function sendError(response, status, code, message) {
  response.status(status).json({ message, code });
}

export function createApp({
  checkDatabase,
  tables,
  live,
  players,
  generateId = generateTableId,
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
    methods: ['GET', 'POST', 'DELETE'],
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

  // Wraps a route so a failure becomes a clear 503 without exposing details. A players
  // service outage gets its own code, so the UI can tell it apart from this service being down.
  const route = (handler) => async (request, response) => {
    try {
      await handler(request, response);
    } catch (error) {
      if (error instanceof PlayersUnavailableError) {
        return sendError(response, 503, 'PLAYERS_UNAVAILABLE', 'Player service unavailable');
      }
      sendError(response, 503, 'UNAVAILABLE', 'Tables unavailable');
    }
  };

  // Reads :id as a join code (case-insensitive) and rejects a malformed one before touching
  // the database.
  const withTableId = (handler) => (request, response) => {
    const id = normalizeTableId(request.params.id);
    if (!id) return sendError(response, 400, 'INVALID_INPUT', 'Table code must be 6 letters or digits');
    request.tableId = id;
    return handler(request, response);
  };

  app.post('/tables', route(async (request, response) => {
    const { value, error } = validateCreateTableInput(request.body);
    if (error) return sendError(response, 400, 'INVALID_INPUT', error);
    const player = await players.getPlayer(value.playerId);
    if (!player) return sendError(response, 404, 'NOT_FOUND', 'Player not found');
    const table = await tables.createTable({
      settings: value.settings,
      createdBy: value.playerId,
      creatorName: player.name,
      generateId,
    });
    response.status(201).json(table);
  }));

  app.get('/tables/:id', withTableId(route(async (request, response) => {
    const table = await tables.getTable(request.tableId);
    if (!table) return sendError(response, 404, 'NOT_FOUND', 'Table not found');
    response.json(table);
  })));

  // Joining twice (e.g. after a page reload) is not an error: the player gets their seat back.
  app.post('/tables/:id/join', withTableId(route(async (request, response) => {
    const { value, error } = validateJoinInput(request.body);
    if (error) return sendError(response, 400, 'INVALID_INPUT', error);
    const { playerId } = value;

    const table = await tables.getTable(request.tableId);
    if (!table) return sendError(response, 404, 'NOT_FOUND', 'Table not found');
    const mine = table.seats.find((seat) => seat.playerId === playerId);
    if (mine) {
      return response.json({
        table,
        seatIndex: mine.seatIndex,
        alreadySeated: true,
        message: 'You are already at this table',
      });
    }
    if (table.seats.length >= table.maxSeats) {
      return sendError(response, 409, 'TABLE_FULL', 'This table is full');
    }

    const player = await players.getPlayer(playerId);
    if (!player) return sendError(response, 404, 'NOT_FOUND', 'Player not found');

    const result = await live.join(request.tableId, { playerId, playerName: player.name });
    if (result.status === 'not_found') return sendError(response, 404, 'NOT_FOUND', 'Table not found');
    if (result.status === 'full') return sendError(response, 409, 'TABLE_FULL', 'This table is full');
    const alreadySeated = result.status === 'already_seated';
    response.json({
      table: await tables.getTable(request.tableId),
      seatIndex: result.seatIndex,
      alreadySeated,
      ...(alreadySeated && { message: 'You are already at this table' }),
    });
  })));

  // Leaving mid-hand folds the player; their seat is freed when the hand ends.
  app.post('/tables/:id/leave', withTableId(route(async (request, response) => {
    const { value, error } = validateJoinInput(request.body);
    if (error) return sendError(response, 400, 'INVALID_INPUT', error);
    const { status } = await live.leave(request.tableId, value.playerId);
    if (status === 'not_found') return sendError(response, 404, 'NOT_FOUND', 'Table not found');
    if (status === 'not_seated') {
      return sendError(response, 404, 'NOT_SEATED', 'You are not at this table');
    }
    if (status === 'leaving') {
      return response.json({
        leftNow: false,
        message: 'You folded and will leave the table when this hand ends',
      });
    }
    response.json({ leftNow: true });
  })));

  // Only the creator may pause, resume or delete a table. Returns the table, or null after
  // sending the error.
  async function creatorTable(request, response, playerId) {
    if (!isUuid(playerId)) {
      sendError(response, 400, 'INVALID_INPUT', 'playerId must be a UUID');
      return null;
    }
    const table = await tables.getTable(request.tableId);
    if (!table) {
      sendError(response, 404, 'NOT_FOUND', 'Table not found');
      return null;
    }
    if (table.createdBy !== playerId.toLowerCase()) {
      sendError(response, 403, 'FORBIDDEN', 'Only the player who created the table can do this');
      return null;
    }
    return table;
  }

  // Pausing lets the current hand finish but starts no new hand until the table is resumed.
  for (const [path, paused] of [['pause', true], ['resume', false]]) {
    app.post(`/tables/:id/${path}`, withTableId(route(async (request, response) => {
      if (!(await creatorTable(request, response, request.body?.playerId))) return;
      if (!(await live.setPaused(request.tableId, paused))) {
        return sendError(response, 404, 'NOT_FOUND', 'Table not found');
      }
      response.json(await tables.getTable(request.tableId));
    })));
  }

  // DELETE /tables/:id?playerId=... Not while a hand is being played: pause the table, let the
  // hand finish, then delete it.
  app.delete('/tables/:id', withTableId(route(async (request, response) => {
    if (!(await creatorTable(request, response, request.query.playerId))) return;
    const { status } = await live.remove(request.tableId);
    if (status === 'hand_in_progress') {
      return sendError(
        response,
        409,
        'HAND_IN_PROGRESS',
        'Pause the table and let the current hand finish before deleting it',
      );
    }
    if (status === 'not_found') return sendError(response, 404, 'NOT_FOUND', 'Table not found');
    response.status(204).end();
  })));

  app.use((_request, response) => sendError(response, 404, 'NOT_FOUND', 'Not found'));

  // Errors raised before a route runs. Anything the client got wrong (malformed JSON, a body
  // that is too large, a URL that cannot be decoded) is a 4xx, not an outage.
  app.use((error, _request, response, _next) => {
    const status = error.status ?? error.statusCode;
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
      return sendError(response, 400, 'INVALID_INPUT', 'Request body is not valid JSON or is too large');
    }
    if (status >= 400 && status < 500) {
      return sendError(response, 400, 'INVALID_INPUT', 'Invalid request');
    }
    return sendError(response, 503, 'UNAVAILABLE', 'Tables unavailable');
  });

  return app;
}