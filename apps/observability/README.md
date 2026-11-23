# Pi Observability Server

Bun HTTP server that ingests agent events, stores them in SQLite, and serves a
live observability UI.

## Quick start

```bash
# Install deps (only @types/bun needed for TS)
bun install

# Start with auto-generated token
bun run start

# Or with explicit token
OBS_AUTH_TOKEN=my-secret-token bun run start
```

## Environment variables

| Var | Default | Description |
|-----|---------|-------------|
| `OBS_PORT` | `43190` | HTTP port |
| `OBS_HOST` | `127.0.0.1` | Bind address |
| `OBS_DB_PATH` | `db/obs.db` | SQLite database path |
| `OBS_AUTH_TOKEN` | auto-generated | Bearer token for auth |

## Smoke test

```bash
# Terminal 1: start server
OBS_AUTH_TOKEN=dev bun run start

# Terminal 2: run smoke tests
OBS_AUTH_TOKEN=dev bash ../../scripts/smoke-server.sh
```

## API

All endpoints except `/health` and `/` require `Authorization: Bearer <token>`.
The SSE endpoint also accepts `?token=<token>` (browsers can't set headers on EventSource).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth) |
| POST | `/events` | Ingest single event or array; also accepts durable-agent-core envelopes (see `envelope.ts`) |
| GET | `/sessions` | List sessions (pool/tag/since/limit) |
| GET | `/sessions/:id/events` | Replay events for a session |
| GET | `/events/stream` | SSE stream (pool/tag/session_id/?token=) |
| GET | `/` | Observability UI (no auth) |
