# Ahuike Backend

The Ahuike backend is a strict TypeScript API for restaurant discovery, menus, carts, orders, payments, delivery status, and customer notifications.

## Project status

The API is in its foundation stage. It currently provides:

- Fastify 5 application and HTTP server
- Strict TypeScript configuration
- Zod environment and request validation
- Security headers and configurable CORS
- Versioned REST endpoints
- Consistent success and error envelopes
- Health monitoring endpoint
- Restaurant listing, search, detail, and menu data
- Customer order creation, detail, and history
- Repository interfaces with in-memory development adapters
- Dependency injection for isolated tests
- Integration tests using Fastify request injection
- Graceful process shutdown

The in-memory adapters make the service immediately runnable, but they are not durable. PostgreSQL persistence, production authentication, payment verification, and background jobs are the next major layers.

## Technology

- Node.js 22+
- TypeScript
- Fastify
- Zod
- Vitest
- PostgreSQL planned as the system of record

## Architecture

Ahuike starts as a modular monolith. This keeps deployment and transactions straightforward while preserving clear module boundaries.

```text
src/
├── config/
│   └── env.ts                 # Validated environment configuration
├── lib/
│   ├── http-error.ts          # Stable application errors
│   └── validation.ts          # Zod-to-HTTP validation boundary
├── modules/
│   ├── orders/
│   │   ├── order.model.ts
│   │   ├── order.repository.ts
│   │   └── order.routes.ts
│   └── restaurants/
│       ├── restaurant.model.ts
│       ├── restaurant.repository.ts
│       └── restaurant.routes.ts
├── app.ts                     # Application composition
└── index.ts                   # Process bootstrap and shutdown

test/
└── app.test.ts                # API integration coverage
```

Each domain module should eventually contain its model, schemas, service/use cases, repository contract, infrastructure adapter, and routes. Route handlers should validate and translate HTTP concerns; business rules belong in services.

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- PostgreSQL 16+ when the persistent adapter is introduced

## Local setup

Clone and enter the repository:

```bash
git clone https://github.com/thetruesammyjay/NdiChow-backend.git
cd NdiChow-backend
```

Install dependencies:

```bash
npm install
```

Create local configuration:

```bash
cp .env.example .env
```

Start the development server:

```bash
npm run dev
```

The service listens on `http://localhost:4000` by default.

Check it with:

```bash
curl http://localhost:4000/health
```

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | Runtime environment |
| `HOST` | No | `0.0.0.0` | HTTP bind address |
| `PORT` | No | `4000` | HTTP port |
| `LOG_LEVEL` | No | `info` | Fastify/Pino log level |
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed origins |
| `DATABASE_URL` | Production | — | PostgreSQL connection string |

Configuration is parsed once during startup. Invalid values fail fast rather than allowing a partially configured server to run.

Never commit `.env`. Production secrets should be injected by the hosting platform.

## Commands

```bash
# Development server with reload
npm run dev

# Static type checking
npm run typecheck

# Run tests once
npm test

# Run tests in watch mode
npm run test:watch

# Compile production JavaScript
npm run build

# Run the compiled server
npm start
```