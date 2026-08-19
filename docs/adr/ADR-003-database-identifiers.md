# ADR-003: PostgreSQL UUID identifiers

**Decision:** Use native UUID primary/foreign keys and separate human-readable transaction numbers.

**Reason:** UUIDs are safe for distributed creation and do not expose business volume. Human numbers serve operators without becoming relational keys.

**Alternatives:** Auto-increment integers; CUID strings.

**Consequences:** Indexes are larger than integer indexes, but the operational scale and safety tradeoff are acceptable.
