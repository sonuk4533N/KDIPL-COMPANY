# ADR-004: Immutable inventory ledger authority

**Decision:** Future inventory balance is derived from stock transactions; mutable cached balances may exist only with reconciliation.

**Reason:** KDIPL requires traceability across receipts, issues, transfers, reversals, counts, and adjustments.

**Alternatives:** A directly editable current-stock field.

**Consequences:** Inventory commands must be atomic and concurrency-tested. The actual ledger schema is deferred to its approved phase.
