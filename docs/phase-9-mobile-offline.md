# Phase 9 — Mobile, offline drafts and site capture

Status: implementation and local quality gates complete. Keep the pull request in draft until GitHub CI passes.

## Supported offline workflows

- Material Requirement draft — Site Supervisor and Project Manager.
- Site material issue request, site receipt acknowledgment, unused-material return and damage/loss draft — Site Supervisor.
- Direct-site GRN capture, damaged/rejected report, transfer receipt and physical stock-count draft — Store Keeper.

Purchase Managers use the responsive online procurement, approval, search and dashboard surfaces. Offline mode never adds a permission or role capability. Every synchronized package is retained as a server-side draft boundary and cannot post a ledger or finalize a workflow.

## Explicitly excluded offline actions

Approval/rejection, PO issue/amendment approval, GRN posting, material issue or transfer posting, stock adjustment approval/posting, invoice verification, MD approval, payments, tax changes, Tally export and administration require an online server transaction. QR and barcode features and dependencies are intentionally absent.

## Synchronization state machine

`LOCAL_DRAFT → QUEUED → SYNCING → SYNCED`

Alternatives are `SYNCING → CONFLICT`, `SYNCING → FAILED`, `FAILED → RETRY_QUEUED`, `CONFLICT → USER_ACTION_REQUIRED` and `LOCAL_DRAFT → DISCARDED`. Terminal synchronized records cannot be moved back to a local state. Retry uses bounded exponential backoff.

The server revalidates the authenticated user, role, permission, current project/site/location assignment, reference snapshot version/expiry, schema version, GPS, attachment scan status and idempotency. A unique user/draft pair and idempotency key prevent duplicate acceptance. A duplicate key with different content becomes a conflict. The synchronized record ID is stable; no force-overwrite route exists.

## Conflict resolution

The client displays the safe reason and offers reference refresh, revision, duplication, discard and corrected resubmission. Assignment removal, material/reference changes, stale schema/reference data, completed transactions, invalid quantities, duplicate content mismatch and failed evidence scans never overwrite current server state.

## Local-data security

- IndexedDB payloads, reference snapshots and attachment bytes use AES-GCM.
- The device key is a non-extractable Web Crypto key stored by structured clone in IndexedDB.
- Additional authenticated data binds ciphertext to its user, record and purpose.
- A per-tab `sessionStorage` unlock marker is created only after `/api/offline/session` confirms an online authenticated session.
- Browser closure removes the marker, leaving encrypted records locked.
- Explicit sign-out clears that user’s drafts, attachments, reference snapshot and unlock marker before revoking the server session.
- Queries are indexed and filtered by owner; a second signed-in user cannot enumerate or decrypt the previous user’s data through the application.
- Draft expiry defaults to seven days. Unsynchronized expired drafts require a visible warning and explicit discard to avoid silent field-data loss.
- Passwords, tokens, cookies and reusable credentials are never written to IndexedDB or the service-worker cache.

The service worker precaches only the public offline shell and KDIPL icons, plus immutable Next.js static assets as requested. Navigations are network-first and authenticated HTML is never cached. API requests, accounts, reports, signed URLs, payment information and supplier banking data are network-only.

## Capture security

Images are decoded with browser orientation handling, resized to a 2048-pixel long edge, re-encoded to JPEG (which strips unnecessary EXIF) and previewed before storage. Users can rotate, enhance grayscale/contrast, retake or remove. The 50 MB server limit, MIME/signature validation, checksum verification, malware scan, quarantine and eight-financial-year retention remain authoritative. A business draft cannot synchronize until mandatory evidence is clean.

GPS stores coordinates, accuracy, captured time and source only inside the encrypted draft and server payload. It is captured at the event, expires after ten minutes and is range/future-time checked again by the server. Normal logs and telemetry do not contain GPS, remarks or document contents. GPS is supporting evidence, not proof of identity or anti-spoofing.

Voice input is user-started/stopped, produces editable text and retains no raw audio. Unsupported browsers fall back to text. No external speech provider is configured.

## Device/browser test matrix

| Surface          | Viewport/device                 | Network cases                                  | Capture cases                                    |
| ---------------- | ------------------------------- | ---------------------------------------------- | ------------------------------------------------ |
| Desktop Chromium | Playwright desktop              | online, offline, reconnect, duplicate retry    | file fallback, GPS denied                        |
| Mobile Chromium  | representative Android viewport | online, offline shell, new-tab lock, reconnect | camera input fallback, GPS denied, 44 px actions |

Manual production measurements must record the real mid-range Android model, OS/browser version, connection profile and cold/warm state. Automated targets are: useful shell within three seconds on reasonable 4G, local response within 100 ms, route-level splitting, bounded/paginated reference lists and thumbnails rather than original images.

## Accessibility

Phase 9 controls are one-column on phones, use native labelled controls, 44 px minimum actions, decimal keyboards, announced status/alerts, visible focus, confirmation before discard and reduced-motion CSS. The document/file control remains keyboard accessible and all previews have names. Browser zoom to 200% must not create normal-workflow horizontal scrolling.

## Migration summary

Phase 9 adds device draft submissions, immutable synchronization audit events, attachment upload sessions and content-free mobile telemetry. UUID identifiers, unique idempotency indexes, server timestamps, bounded request sizes and transaction-safe acceptance are enforced in PostgreSQL.

## Residual risks and operational limitations

Browser encryption cannot protect a rooted/compromised device, malicious extension, screen capture, unlocked OS account, browser developer tools controlled by an attacker or device-level backup outside KDIPL control. Web Crypto key deletion is browser-managed and is not guaranteed physical media erasure. Speech recognition availability and processing behavior are browser/platform dependent; raw audio is not stored by KDIPL. Background sync and resumable chunk uploads depend on browser/storage-adapter support; the current adapter retries whole validated files. PWA installation requires HTTPS. Production object storage, malware scanning, retention jobs, WhatsApp delivery and mobile performance measurements remain deployment responsibilities.

## Verification totals

- Fresh PostgreSQL deployment: all 28 migrations applied, including the Phase 9 migration.
- Demo seed: passed with all nine business-role accounts and scoped site-store access.
- Formatting, ESLint and TypeScript: passed with zero warnings or errors.
- Unit: 105 passed across 16 files; Phase 9 contributes 9 focused cases.
- PostgreSQL integration: 56 passed across 12 files; Phase 9 contributes 8 focused synchronization/security cases.
- Playwright: 42 passed across desktop and Pixel 5 mobile Chromium; Phase 9 contributes 6 offline/mobile cases.
- Production build: passed on Next.js 16.3.1 with 39 generated application routes.
- Total automated assertions/scenarios: 203 passed locally.

Local performance evidence used a Windows development workstation, production Next.js build, localhost PostgreSQL, Chromium desktop at 1440Ã—900 and Playwright Pixel 5 at 390Ã—844 without network throttling. The complete 42-case browser suite finished in 1.8 minutes; focused Phase 9 desktop/mobile coverage finished in 13.3 seconds, with individual warm local Phase 9 scenarios between 0.9 and 3.1 seconds. These figures validate regressions and interaction responsiveness but do not substitute for the required production mid-range Android/4G measurement.

GitHub CI link and final production Android/4G measurements remain pending while the pull request is intentionally in draft.
