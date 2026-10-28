# Open Questions & Unresolved Ambiguities

This document tracks unresolved requirements, ambiguities, and questions requiring user or stakeholder input according to the AntiGravity Master Engineering Directive.

---

### Q-01: Scope of Staged Changes in `enterprise/page.tsx` and `notifications/page.tsx`
* **Category**: Code Review / Working Tree State
* **Observation**: In addition to `dashboard-service.ts`, the git index currently contains staged changes for:
  * `src/app/(app)/enterprise/page.tsx`
  * `src/app/(app)/notifications/page.tsx`
* **Question**: Were these staged changes intended as part of an in-progress feature (Phase 13 refinement), or should they be reviewed and kept/committed with the project records?

---

### Q-02: Integration Test Database Target
* **Category**: Testing & Database Provisioning
* **Observation**: In `.env.example`, `TEST_DATABASE_URL` targets port 5433 (`postgresql://kdipl:kdipl_test@localhost:5433/kdipl_test?schema=public`), while the active PostgreSQL server runs on port 5432.
* **Question**: Is it preferred to provision `kdipl_test` as a separate database on the existing port 5432 instance (`localhost:5432/kdipl_test`), or run a separate container/service on port 5433?
