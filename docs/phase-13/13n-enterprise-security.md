# Phase 13N — Enterprise Security

## Overview
Phase 13N covers enterprise single sign-on (SSO), claim assertion mapping, and emergency Break-Glass access protocols.

Implemented in:
- Service: [`src/server/enterprise/enterprise-security-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/enterprise/enterprise-security-service.ts)

---

## 1. Enterprise SAML 2.0 / OIDC Readiness
- Validates trusted Identity Provider (IdP) issuers (e.g. Microsoft Entra ID / Okta).
- Verifies token expiration (`notOnOrAfter`).
- Dynamically maps enterprise Active Directory groups to KDIPL ERP roles (e.g. `KDIPL_Exec_Board` → `MANAGING_DIRECTOR`).

---

## 2. Break-Glass Emergency Access Management
- Provides emergency privileged access during critical system incidents.
- Strict requirements:
  - Mandatory detailed justification (>15 characters).
  - Explicit corporate approver authorization.
  - Hard expiry limit (maximum 4 hours).
  - Tamper-evident audit logging.
