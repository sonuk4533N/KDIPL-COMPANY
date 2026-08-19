# ADR-002: Opaque database sessions

**Decision:** Hash passwords with Argon2id and store opaque session-token hashes in PostgreSQL.

**Reason:** Database sessions support immediate revocation, role/auth-version invalidation, idle expiry, and audit evidence without exposing claims to the browser.

**Alternatives:** JWT access/refresh tokens; hosted identity provider.

**Consequences:** Authenticated requests require a database lookup. Caching must never make revocation or permission data stale.
