# shared

Cross-cutting code used by **both** modules, written once:

- `config.js`: reads and validates environment variables
- `logger.js`: JSON logs to stdout (INFO level, no request bodies)
- `requestLog.js`: one log line per request (method, path, status, durationMs)
- `errors.js`: error handler that returns `{ code, message }`, never a stack trace
- `cors.js`: allows only the UI origin
- `health.js`: `GET /health` router
- `httpClient.js`: fetch with a timeout (2 s), used by infrastructure to call the other service
- `migrate.js`: applies a module's `migrations/*.sql` on startup

Rule: shared never imports a module.
