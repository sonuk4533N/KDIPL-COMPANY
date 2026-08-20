# Phase 1 — Identity & Access

Phase 1 implements authentication, employees, users, roles, permissions, and
organization administration without introducing ERP business workflows.

## Delivered scope

- Individual email/password login, logout, failed-login throttling, opaque
  database sessions, absolute/idle expiry, and login/logout audit evidence.
- Forced replacement of administrator-issued temporary passwords.
- Self-service password change with Argon2id hashing and revocation of other
  active sessions.
- Active-session review, individual session revocation, and sign-out from all
  other devices.
- Independent employee records with departments, positions, reporting lines,
  activation/deactivation, and optional login linkage.
- Department and position creation, editing, and activation lifecycle.
- Login-account creation for active employees, multi-role assignment,
  activation/deactivation, administrator password reset, and last-login
  visibility.
- Protected system roles, custom-role lifecycle, and configurable permission
  grants with session invalidation.
- Transactional audit records for identity, credential, organization, and RBAC
  mutations.

## Security invariants

- Every command validates request origin and performs server-side permission
  checks.
- Users cannot disable or reassign their own account from Administration.
- At least one active System Administrator must remain.
- The System Administrator role retains `app.access`, `user.manage`, and
  `role.manage`; its stable code and active status are protected.
- Deactivating an employee disables their linked account. Reactivation does not
  silently re-enable login access.
- Permission, role, status, and password-reset changes invalidate affected
  sessions through `authVersion` or explicit revocation.

## Deferred decisions

- Self-service forgotten-password recovery requires an approved email or
  identity-verification channel.
- Two-factor authentication remains optional pending KDIPL policy and provider
  selection.
- The non-administrator role-permission matrix, segregation-of-duty exceptions,
  and project/site assignment scope still require KDIPL approval.
- Employee/department archival and retention rules must be finalized before
  production data migration.
