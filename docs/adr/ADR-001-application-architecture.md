# ADR-001: Single Next.js application

**Decision:** Use one Next.js App Router application with server-side application services.

**Reason:** Phase 0 and expected KDIPL scale do not justify a separately deployed API. One boundary simplifies session security, transactions, deployment, and shared validation.

**Alternatives:** Next.js plus NestJS; independent SPA and API.

**Consequences:** Domain services must remain framework-light so a future API or worker can reuse them. Stronger separation requires an evidence-based ADR.
