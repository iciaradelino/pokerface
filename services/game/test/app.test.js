import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const uiOrigin = 'http://localhost:5173';

describe('/health', () => {
  it('returns the deployed version only after a successful database check', async () => {
    const checkDatabase = vi.fn().mockResolvedValue(undefined);
    const app = createApp({ checkDatabase, version: 'test-sha', uiOrigin, logger: () => {} });
    const response = await request(app).get('/health');
    expect(checkDatabase).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', db: 'ok', version: 'test-sha' });
  });

  it('reports a database outage without exposing its error and recovers on the next request', async () => {
    const checkDatabase = vi.fn()
      .mockRejectedValueOnce(new Error('private connection details'))
      .mockResolvedValue(undefined);
    const app = createApp({ checkDatabase, uiOrigin, logger: () => {} });
    const failed = await request(app).get('/health');
    expect(failed.status).toBe(503);
    expect(failed.body).toEqual({ status: 'unavailable', db: 'error', version: 'local' });
    expect(failed.text).not.toContain('private');
    expect((await request(app).get('/health')).status).toBe(200);
  });

  it('permits the configured browser origin and excludes other origins', async () => {
    const app = createApp({ checkDatabase: async () => {}, uiOrigin, logger: () => {} });
    const allowed = await request(app).get('/health').set('Origin', uiOrigin);
    expect(allowed.headers['access-control-allow-origin']).toBe(uiOrigin);
    const denied = await request(app).get('/health').set('Origin', 'https://other.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('logs method, path, status and duration without query strings or bodies', async () => {
    const logger = vi.fn();
    const app = createApp({ checkDatabase: async () => {}, uiOrigin, logger });
    await request(app).post('/missing?token=private').send({ password: 'private' });
    const log = JSON.parse(logger.mock.calls[0][0]);
    expect(log).toMatchObject({ level: 'info', method: 'POST', path: '/missing', status: 404 });
    expect(log.durationMs).toBeGreaterThanOrEqual(0);
    expect(logger.mock.calls[0][0]).not.toContain('private');
  });
});
