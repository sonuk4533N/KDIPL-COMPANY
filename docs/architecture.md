# Architecture

## System shape

KDIPL is one Next.js App Router application. React Server Components perform server-only reads; thin Server Actions handle browser commands; both call explicit application services. PostgreSQL is authoritative and Prisma provides typed access and migrations.

```text
Browser → App Router → query/command service → authorization + validation
                                              → Prisma transaction
                                              → domain write + audit/outbox
```

Business modules will live under `src/features` as they are approved. Cross-cutting infrastructure lives under `src/server`; reusable visual components stay under `src/components`.

## Security

Passwords use Argon2id. The browser receives only an opaque random session token in an HTTP-only, SameSite cookie; only its SHA-256 hash is stored. Sessions have idle and absolute expiry and are revoked on logout or authentication-version changes. Every protected page and command checks server-side identity and permission. Mutation origins are validated.

Secure headers, structured error responses, login throttling, parameterized Prisma access, upload validation, and redacted structured logs form the baseline. This is not a claim of completed production certification.

## Commands and transactions

Queries are side-effect-free server functions. Sensitive changes use named commands such as `approveMaterialRequirement`, never arbitrary status patches. Commands validate input, current state, permission, idempotency, and resource scope on the server.

All dependent writes, audit events, and future outbox events use one Prisma transaction. External side effects occur after commit or through a future outbox worker. Failures roll back the entire state change.

## Errors and observability

Public errors use stable codes and safe messages. Stack traces remain in restricted server diagnostics only. Logs include event names and future request correlation while redacting credentials, cookies, tokens, secrets, and document contents.

## Files

`FileStorageProvider` supports local development and S3-compatible production storage. PostgreSQL stores metadata; object bytes never become database blobs. Storage keys are opaque and download access must pass authorization.
