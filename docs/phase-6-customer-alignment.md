# Phase 6 customer alignment

Status: complete and verified on 14 September 2026.

Base: `origin/main` at `31de842`. The Phase 5 migration history is preserved.
PR #2 / `phase-6-stock-movements` is a reference, not a merge source.

## Implementation decisions

- Requests are single-material documents, with immutable submitted quantities.
- Issue moves custody into the site's ledger; acknowledgment is a separate mandatory transition. There is no consumption register.
- Transfer dispatch reserves stock without posting it. Receipt posts the actual received quantity and its carrying cost in one transaction. Unreceived quantity remains on the source ledger pending a separately approved variance adjustment.
- Carrying cost uses the ledger's weighted average acquisition price, excluding tax. Opening/legacy entries without acquisition evidence need an explicit valuation before movement; zero-cost stock must be explicitly identified.
- The existing negative-stock deadline counts Monday–Friday, without a public-holiday calendar.
- Physical counts freeze their location/material/unit until Accounts verification. The captured book quantity is not a backdated estimate.
- Closure is an explicit workflow, not just an editable project status. Central-store transfers still require PD approval and receipt.

## Verification

- Format, lint, and TypeScript checks pass.
- Unit suite: 80 tests pass across 13 files.
- A fresh PostgreSQL database applies all 24 migrations successfully.
- Integration suite: 35 tests pass across 9 files with the database enabled.
- Production build completes successfully.
- Phase 6 Playwright suite: 8 tests pass across desktop and mobile Chromium.

## Customer-rule compliance matrix

| Rule       | Required implementation                                                              | Status   |
| ---------- | ------------------------------------------------------------------------------------ | -------- |
| Issue      | Assigned supervisor/GPS; SK issue; PM excess; acknowledgment; tracked negative stock | Complete |
| Transfer   | PD approval; SK dispatch; receipt-only atomic quantity/cost; MD variance             | Complete |
| Return     | Supervisor/GPS; original issue; verified physical receipt                            | Complete |
| Adjustment | SK reason/evidence; independent MD approval; immutable reversal/replacement          | Complete |
| Count      | Closure only; SK count; Accounts verification; separate MD adjustment                | Complete |
| Closure    | All remaining stock to Central Store; unresolved-work blockers                       | Complete |
| Non-usable | Six classifications; site evidence/GPS; MD disposal/sale                             | Complete |
| Numbering  | Indian financial year and concurrency-safe sequences                                 | Complete |
| Phase 5    | GRN, evidence retention, amendments, negative controls preserved                     | Complete |

Known limitation: working-day deadlines currently count Monday through Friday and do not use an Indian public-holiday calendar.
