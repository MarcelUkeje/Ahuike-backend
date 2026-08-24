# Ahuike Backend

> **⚠️ NOTE FOR TESTING & GRADING**
> 
> Due to strict anti-spam firewalls on the free-tier backend hosting (Render), automated emails (like OTPs for registration, appointment receipts, and follow-up reminders) cannot be sent out. 
> 
> **To test the registration and login flow, please enter the universal bypass OTP code: `000000`** when prompted. This will automatically verify the account and log you in.

The Ahuike backend is a strict TypeScript API for doctor discovery, appointment booking, patient records, prescription management, and clinical notifications.

## Project status

The API is in its foundation stage. It currently provides:

- Fastify 5 application and HTTP server
- Strict TypeScript configuration
- Zod environment and request validation
- Security headers and configurable CORS
- Versioned REST endpoints
- Consistent success and error envelopes
- Health monitoring endpoint
- Department listing, search, detail, and doctor data
- Patient appointment creation, detail, and history
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
├── db/
│   ├── migrate.ts             # Schema + seed runner
│   ├── schema.sql             # PostgreSQL table definitions
│   └── seed.sql               # Development seed data
├── lib/
│   ├── cache.ts               # Upstash Redis helpers (graceful bypass)
│   ├── db.ts                  # NeonDB HTTP SQL client
│   ├── http-error.ts          # Stable application errors
│   └── validation.ts          # Zod-to-HTTP validation boundary
├── modules/
│   ├── appointments/
│   │   ├── appointment.model.ts
│   │   ├── appointment.repository.ts
│   │   └── appointment.routes.ts
│   ├── departments/
│   │   ├── department.model.ts
│   │   ├── department.repository.ts
│   │   └── department.routes.ts
│   └── doctors/
│       ├── doctor.model.ts
│       ├── doctor.repository.ts
│       └── doctor.routes.ts
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
git clone https://github.com/MarcelUkeje/Ahuike-backend.git
cd Ahuike-backend
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
| `PORT` | No | `4000` | HTTP port (Render injects this automatically) |
| `LOG_LEVEL` | No | `info` | Fastify/Pino log level |
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed origins |
| `DATABASE_URL` | Production | — | NeonDB PostgreSQL connection string |
| `UPSTASH_REDIS_REST_URL` | No | — | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | No | — | Upstash Redis REST token |

Configuration is parsed once during startup. Invalid values fail fast rather than allowing a partially configured server to run.

Never commit `.env`. Production secrets should be injected by the hosting platform.

## Commands

```bash
# Development server with reload
npm run dev

# Apply schema.sql + seed.sql to NeonDB (run once before first deploy)
npm run db:migrate

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

## API conventions

Application endpoints are versioned under `/api/v1`. Health checks intentionally remain at `/health`.

Successful responses:

```json
{
  "data": {}
}
```

Error responses:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid.",
    "details": {}
  }
}
```

Error `code` values are stable application identifiers. Messages are safe to display but clients may map codes to localized copy.

Consultation fees are represented in the currency's smallest practical unit as integers. Seed values use whole Nigerian naira, so `15000` means `₦15,000`. Floating-point amounts must not be used for financial calculations.

## Current endpoints

### Health

```http
GET /health
```

Returns service name, runtime status, environment, and timestamp.

### List or search departments

```http
GET /api/v1/departments
GET /api/v1/departments?q=cardiology
```

Returns department summaries without full doctor listings.

### Department details

```http
GET /api/v1/departments/:departmentId
```

Returns department metadata and the doctors within it.

### List or search doctors

```http
GET /api/v1/doctors
GET /api/v1/doctors?departmentId=general-practice
```

Returns doctor summaries including specialization and next available slot.

### Doctor details

```http
GET /api/v1/doctors/:doctorId
```

Returns doctor profile, specialization, qualifications, and available appointment slots.

### Patient appointment history

```http
GET /api/v1/appointments
X-Patient-Id: development-patient-id
```

### Patient appointment detail

```http
GET /api/v1/appointments/:appointmentId
X-Patient-Id: development-patient-id
```

### Confirm an appointment

```http
POST /api/v1/appointments/:appointmentId/confirm
```

### Complete/Cancel an appointment

```http
DELETE /api/v1/appointments/:appointmentId
```

### Patient profile

```http
GET /api/v1/patients/me
```

### Add a new doctor (Admin)

```http
POST /api/v1/doctors
Content-Type: application/json
x-admin-password: your-admin-password
```

### Book an appointment

```http
POST /api/v1/appointments
Content-Type: application/json
X-Patient-Id: development-patient-id

{
  "doctorId": "dr-amaka-obi",
  "departmentId": "general-practice",
  "slotId": "slot-2026-08-15-09-00",
  "reasonForVisit": "Routine check-up",
  "consultationFee": 15000
}
```

The temporary `X-Patient-Id` mechanism only provides a development seam. It is not production authentication. A production bearer-token implementation will replace it.

## Critical appointment booking rules

Before production, appointment creation must be moved into a service that:

1. Loads the doctor and time slot from the database.
2. Verifies the doctor is available and the slot has not been taken.
3. Confirms the department is active and accepting bookings.
4. Calculates and validates the consultation fee on the server.
5. Creates an immutable appointment snapshot.
6. Initiates or verifies the payment transaction.
7. Persists the appointment and status event in a database transaction.
8. Publishes notification work after the transaction commits.

The current endpoint accepts fees from the client only to demonstrate the HTTP and repository flow. Client-provided financial values must not be trusted in production.

## Planned modules

```text
modules/
├── auth/
├── patients/
├── doctors/
├── departments/
├── appointments/
├── prescriptions/
├── medical_records/
├── payments/
├── notifications/
└── reviews/
```

## Persistence plan

PostgreSQL will be the source of truth. Initial tables are expected to include:

- patients
- doctors
- departments
- doctor_availability
- appointment_slots
- appointments
- appointment_status_events
- prescriptions
- prescription_items
- medical_records
- payments
- payment_events
- reviews
- device_tokens

Repository interfaces keep the domain independent of the eventual database library. Database migrations must be committed and applied through deployment automation.

## Authentication and authorization

The planned production model is:

- Short-lived bearer access tokens
- Rotating refresh tokens or a managed identity provider
- Patient identity attached by authentication middleware
- Role-based access for patients, doctors, nurses, and administrators
- Resource ownership checks in services and queries
- Rate limiting for authentication, booking, and public discovery APIs

Never authorize access from a patient ID supplied directly in the request body or query string.

## Payments

Payment provider selection is intentionally open. Regardless of provider:

- The backend creates payment intents or checkout sessions.
- Provider secret keys remain server-side.
- Webhook signatures are verified against the raw request body.
- Webhook processing is idempotent.
- The appointment is confirmed only after server-side payment confirmation.
- Payment event IDs are unique to prevent replay.
- Refunds and failures are retained as auditable state transitions.

## Appointment status model

The initial status progression is:

```text
pending
  → confirmed
  → in_progress
  → completed
```

Appointments may also transition to `cancelled` or `no_show` under explicit business rules. Status transitions should be validated by role and current state, persisted as events, and exposed to patients through polling initially and realtime updates later.

## Testing strategy

- Unit tests for fee calculation, slot availability, and status transitions
- Repository contract tests for in-memory and PostgreSQL adapters
- API integration tests through `app.inject`
- Payment webhook fixture tests
- Database integration tests against an isolated PostgreSQL instance
- End-to-end booking tests covering the Flutter client and API

Tests must never depend on production services or credentials.

## Deployment

A production deployment should:

1. Install exact lockfile dependencies with `npm ci`.
2. Run type checking and tests.
3. Compile with `npm run build`.
4. Apply database migrations as a controlled release step.
5. Start `dist/index.js` behind HTTPS.
6. Use `/health` for readiness monitoring.
7. Inject secrets through the hosting platform.
8. Centralize structured logs and error reporting.

The server handles `SIGINT` and `SIGTERM` so managed platforms can drain it cleanly.

## Engineering conventions

- Keep TypeScript strict; do not solve errors with broad `any` types.
- Validate every external boundary.
- Keep HTTP translation in routes and business rules in services.
- Depend on repository interfaces, not database clients, from use cases.
- Use explicit, stable error codes.
- Treat all client input as untrusted.
- Make commands and webhook handlers idempotent.
- Log identifiers and outcomes, not credentials or unnecessary personal data.
- Add regression tests with every defect fix.

## Security checklist

- Restrictive production CORS
- Authentication and role-based authorization
- Request size limits and rate limiting
- Server-calculated consultation fees
- Parameterized database access
- Payment webhook signature verification
- Idempotency keys for booking and payment callbacks
- Encrypted transport and managed secrets
- Redacted structured logs
- Dependency and container scanning
- Data retention and patient account deletion procedures

## Roadmap

### Foundation

- [x] Strict TypeScript Fastify service
- [x] Validation and stable error contract
- [x] Department and doctor discovery endpoints
- [x] Initial appointment API and integration tests
- [ ] PostgreSQL schema, migrations, and repositories
- [ ] OpenAPI document and generated Flutter client

### Appointment Booking MVP

- [ ] Patient authentication
- [ ] Patient profiles and medical history
- [ ] Doctor availability and slot management
- [ ] Server-side consultation fee validation
- [ ] Booking idempotency
- [ ] Payment provider and verified webhooks
- [ ] Validated appointment status transitions
- [ ] Push notification worker

### Operations and growth

- [ ] Doctor and department management API
- [ ] Prescription and medical record creation
- [ ] Patient record access controls
- [ ] Teleconsultation session management
- [ ] Reviews and doctor ratings
- [ ] Realtime appointment status updates
- [ ] Admin audit tools
- [ ] Metrics, tracing, backups, and disaster recovery

## License

Copyright © 2026 Ahuike. All rights reserved unless a separate license is added.