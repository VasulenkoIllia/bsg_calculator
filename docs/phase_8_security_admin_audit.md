# Phase 8 — Security, Admin Management, Document Audit & Deletion

**Status**: Stages 1 + 3 + 4 + 5 complete (2026-05-21). Stages 2 + 6 planned.
**Date created**: 2026-05-20
**Confirmed by**: operator brief 2026-05-20 (this conversation)

Four feature blocks raised after Sprint 7.2 acceptance. This document
captures the agreed-upon contract before implementation so the spec
doesn't drift across sprints.

## Stage progress

| Stage | Topic | Status |
|---|---|---|
| 1 | Roles foundation (`users.role` enum + `requireRole` middleware + bootstrap) | ✅ **DONE 2026-05-21** (Phase 8 Stage 1.A–D) |
| 2 | TOTP 2FA + `/me` personal cabinet | ⏳ planned |
| 3 | Super-admin user management (`/admin/users`, block, password reset) | ✅ **DONE 2026-05-21** (Phase 8 Stage 3.A–D; invite copy-link deferred — super_admin sets initial password directly and forwards it manually) |
| 4 | Per-document event log | ✅ **DONE 2026-05-21** (Phase 8 Stage 4.A–E; ALSO covers calculator_config_events since the operator brief asked for both surfaces) |
| 5 | Document soft-delete with HubSpot Note tear-down | ✅ **DONE 2026-05-21** (Phase 8 Stage 5.A–E; reason presets, super_admin restore, /admin/documents/deleted) |
| 6 | `admin_actions` audit log + admin sub-shell | ⏳ planned (needs Stages 1-5) |

### Adjacent Phase 9 shipped (2026-05-21)

**HubSpot Note write-back** — `POST /api/v1/documents/:number/sync`.
Not part of the Phase 8 stage progression but tightly related (Stage 5
will tear down the same Notes on document deletion). Pushes a
plain-text Note with BSG-XXXXX + key contract terms + clickable link
back to our SPA; associates with the document's pinned deal (preferred)
or the parent company (fallback). Each Sync click creates a fresh
Note (audit trail). See `docs/deployment.md §9` for the full flow
and `server/modules/documents/sync.service.ts` for the wiring.

### Stage 1 deliverables shipped

- Migration `0007_user_role_enum.sql` — added `role text` column with
  CHECK enum, backfilled existing `is_admin=true` rows to `role='admin'`,
  dropped `is_admin` column.
- JWT access-token claim swapped from `isAdmin: boolean` to `role:
  'user'|'admin'|'super_admin'`. Stale pre-migration tokens surface
  as `AccessTokenVerificationError("invalid")` → client re-refreshes
  within 15 min and picks up the new shape.
- New `server/middleware/require-role.ts` with hierarchical tier
  (user=0, admin=1, super_admin=2). `requireRole('admin')` accepts
  both admin and super_admin (admin ⊂ super_admin).
- `requireAdmin()` kept as a thin re-export for backward-compat.
- Bootstrap script `server/scripts/bootstrap-super-admin.ts` runs
  on every server boot: promotes the user whose email matches
  `BOOTSTRAP_SUPER_ADMIN_EMAIL` to super_admin. Idempotent, never
  demotes.
- `create-user.ts` accepts `--role=user|admin|super_admin` with
  backward-compat shortcuts `--admin` / `--super-admin`.
- Frontend: `PublicUser.role` (typed union) + new
  `useAuth().hasRole(min)` helper mirroring the backend tier table.

---

## 1. TOTP 2FA on login + personal cabinet

**Decision**: Opt-in 2FA with TOTP (Google Authenticator / 1Password /
Authy compatible — RFC 6238 standard). Trust-device option keeps the
operator UX friction low.

### User stories
- As a user, I open `/me` (new personal cabinet page) and click
  "Enable 2FA". I see a QR code + a manual setup key. I scan with
  Google Authenticator and enter the 6-digit code to confirm.
- Once enabled, I get **10 backup codes** I must store somewhere
  safe — each can be used ONCE to bypass 2FA if I lose the device.
- On every login I'm prompted for a TOTP code AFTER my password
  passes. I can tick **"Trust this browser for 30 days"** — the
  server stores a signed cookie tying my user-id + device fingerprint
  for 30 days; while it's valid the TOTP prompt is skipped.
- I can disable 2FA from `/me` — re-auth required (password + TOTP
  one more time before the secret is wiped).
- A super-admin can **force-disable** 2FA for a user as part of
  account recovery (e.g. lost phone + lost backup codes). The action
  is audit-logged.

### Backend
- DB schema additions on `users`:
  - `totp_secret_encrypted text` (NULL if not enabled). Encrypted
    with a server-side AES-256-GCM key (env var `TOTP_ENCRYPTION_KEY`).
  - `totp_enabled_at timestamptz` — null until confirmed.
  - `backup_codes_hashed text[]` — bcrypt(code) per slot; codes are
    removed (set NULL by index) once used.
- New table `trusted_devices`:
  - `id uuid PK`
  - `user_id uuid FK users`
  - `device_fingerprint_hash text` — sha256 of UA + IP (first 2
    octets only — survives mobile-IP changes)
  - `expires_at timestamptz` — created_at + 30 days
  - Index on `(user_id, device_fingerprint_hash)`.
- Auth flow:
  - `POST /auth/login` → if user has 2FA enabled AND trusted-device
    cookie missing/expired → response is `202 Accepted { challenge:
    'totp', tempToken }` (NOT a full session yet).
  - `POST /auth/2fa/verify { tempToken, code }` → checks TOTP OR
    backup-code → issues real access+refresh tokens.
- TOTP library: `otplib` (no native deps; widely audited).
- Rate limits:
  - `/auth/2fa/verify` — 10/min/IP (defends against TOTP brute-force).
  - `/auth/2fa/setup` — 3/min/IP.

### Frontend
- New page `/me` (PersonalCabinetPage):
  - Display name + email (read-only).
  - 2FA section: enable / disable button, current state badge,
    backup-codes list (one-time download button).
  - "Sign out everywhere" — invalidates all refresh tokens for
    the user.
- Login flow update: after password OK + 2FA required → second
  step shows TOTP input + "Use backup code" link + "Trust this
  browser 30 days" checkbox.

### Open follow-ups
- The trusted-device cookie is HTTP-only Secure + SameSite=Strict.
  Signed with the same `JWT_SECRET` as access tokens, so it
  invalidates on key rotation.

---

## 2. Role hierarchy + super-admin user management

**Decision**: hierarchical enum `user` ⊂ `admin` ⊂ `super_admin`.
Single `role` column replaces the current `is_admin boolean`. All
existing `is_admin=true` rows map to `admin` by default; one
designated bootstrap user gets `super_admin` via the migration
seed (env var `BOOTSTRAP_SUPER_ADMIN_EMAIL`).

### Capability matrix

| Capability | user | admin | super_admin |
|---|---|---|---|
| Read companies / deals / docs / calcs | ✓ | ✓ | ✓ |
| Create / edit calc-configs | ✓ | ✓ | ✓ |
| Save documents | ✓ | ✓ | ✓ |
| Sync to HubSpot | ✓ | ✓ | ✓ |
| Soft-delete documents | — | ✓ | ✓ |
| Restore soft-deleted documents | — | — | ✓ |
| List all users | — | — | ✓ |
| Invite new user | — | — | ✓ |
| Block / unblock user | — | — | ✓ |
| Reset another user's password | — | — | ✓ |
| Force-disable another user's 2FA | — | — | ✓ |

Today the codebase has no `user` role yet — every authenticated
account is implicitly an admin. Phase 8 introduces `user` as a
forward-compat layer for the future when sales reps get accounts
without document-editing rights. For now the migration treats
existing accounts as `admin`.

### Backend
- Migration: `ALTER TABLE users ADD COLUMN role text NOT NULL
  DEFAULT 'admin' CHECK (role IN ('user','admin','super_admin'))`,
  then `DROP COLUMN is_admin` once the JWT claim is migrated.
- New JWT claim `role: 'user'|'admin'|'super_admin'` replaces the
  current `isAdmin: boolean`. Frontend reads it via the existing
  `useAuth()` context.
- Authorization helper `requireRole(min: Role)` middleware — covers
  the "≥ admin" / "≥ super_admin" gates.

### Invite flow (copy-link, no SMTP per the operator brief)
- `POST /admin/users/invite { email, displayName, role }`
  (super_admin only) → creates a `user_invites` row:
  - `id uuid PK`, `email`, `display_name`, `role`,
    `token_hash` (sha256 of one-time token; raw token returned ONCE),
    `expires_at` (24h), `created_by_user_id`, `accepted_at` (nullable).
- Response includes the link
  `https://<frontend>/accept-invite?token=<raw>` — super-admin
  copies it from the UI and sends to the new user manually
  (Telegram / Slack / wherever).
- `/accept-invite` page: token-verify → set password (+ optional
  2FA setup) → auto-login.
- Invite tokens expire 24h; super-admin can re-issue.

### User-management UI (super_admin only)
- New page `/admin/users` with:
  - Table: email / display name / role / status (active|blocked) /
    last login / 2FA enabled / created at.
  - Per-row actions: change role (drop-down), block / unblock,
    reset password (issues a one-time reset link the super-admin
    copies and forwards), force-disable 2FA.
- New page `/admin/users/invite` — form to invite (above flow).

### Block semantics
- Blocked = `users.is_active=false`. Login is refused with a
  dedicated 403 (`AUTH_USER_BLOCKED`). Existing refresh tokens are
  invalidated at the next refresh call by checking the user's
  current `is_active`.
- Hard-delete is intentionally NOT supported in Phase 8 — block is
  the soft equivalent and preserves audit trail.

### Password reset (super_admin → another user)
- `POST /admin/users/:id/reset-password` (super_admin only) →
  creates a one-time reset link (same shape as invite tokens, 1h
  TTL). Response includes the URL; super-admin copies and forwards.
- The target user uses the link → enters a new password →
  auto-login. The user's existing refresh tokens are invalidated.

### Audit log (cross-cutting)
A new `admin_actions` table records every super-admin action:
- `id`, `actor_user_id`, `target_user_id` (nullable),
  `action enum ('invite','block','unblock','role_change',
  'password_reset','force_disable_2fa','restore_document', ...)`,
  `meta jsonb`, `created_at`.
Visible to super-admins via `/admin/audit-log`.

---

## 3. Document history (per-document audit trail)

**Decision**: small per-document event log surfaced on the document
detail page (`/documents/:number`).

### Events tracked
| Event | Actor | When |
|---|---|---|
| `created` | document creator | INSERT row |
| `pdf_downloaded` | who clicked Download | GET pdf endpoint |
| `pdf_regenerated` | who triggered re-render | future Phase |
| `synced_to_hubspot` | who triggered sync | sync controller |
| `sync_failed` | system (HubSpot error) | sync retry exhausted |
| `deleted` | who deleted | document delete |
| `restored` | super-admin | document restore |
| `deletion_reason_edited` | who edited | reason patch |

### Backend
- New table `document_events`:
  - `id uuid PK`
  - `document_id uuid FK documents ON DELETE RESTRICT` (we keep
    events even if the doc row is soft-deleted)
  - `event_type text` (enum-checked via CHECK)
  - `actor_user_id uuid FK users` (nullable for system events)
  - `meta jsonb` — event-specific fields (e.g.
    `{reason, note}` for delete, `{noteId}` for sync)
  - `created_at timestamptz default now()`
  - Index on `(document_id, created_at desc)`.
- Service layer: every controller that performs one of the tracked
  actions records an event in the SAME TX as the state change.

### Frontend
- On `/documents/:number` add a collapsible "History" panel below
  the doc body:
  - Reverse-chronological list
  - Format: `<actor.displayName>` · `<event label>` · `<time ago>`
    + optional one-line meta (`reason: client request`).

### Other entities
- Out of scope for this phase: deals / companies / calc-configs
  don't get an audit log yet. Easy to extend later by adding
  `<entity>_events` tables.

---

## 4. Document deletion with HubSpot Note tear-down

**Decision**: soft-delete in our DB (BSG-XXXXX number stays reserved),
hard-delete the HubSpot Note via API. On HubSpot failure we DO NOT
soft-delete locally — instead we mark the document with
`hubspot_sync_state='delete_failed'` and surface a retry button.

### Reason presets (in deletion modal)
1. **Client request** — client asked to retract the offer.
2. **Created in error** — mis-clicked or wrong company.
3. **Replaced by new version** — a newer BSG-XXXXX supersedes it.
4. **Duplicate** — same content already saved under another number.
5. **Other** — free-text note REQUIRED in this case.

For options 1-4 the free-text note is optional but recommended.

### Backend
- Migration adds to `documents`:
  - `deleted_at timestamptz` — null when alive.
  - `deleted_by_user_id uuid FK users` — null when alive.
  - `deletion_reason text` CHECK in the 5 enum values above.
  - `deletion_note text` (max 8_000 chars). Required when reason
    = 'other'.
- New states on `documents.hubspot_sync_state`:
  - `delete_pending` — soft-delete request received, HubSpot call
    in progress.
  - `delete_failed` — HubSpot API failed; doc remains "alive"
    locally so the operator sees a retry CTA.
- New endpoint `DELETE /documents/:number { reason, note? }`:
  - Requires `>= admin` role.
  - If the document was never synced (`hubspot_sync_state = 'not_synced'`):
    skip HubSpot, set `deleted_at = now()`, log event.
  - If synced: call HubSpot `DELETE /crm/v3/objects/notes/:noteId`;
    on success → soft-delete locally; on failure → set
    `hubspot_sync_state = 'delete_failed'` and surface in the UI.
  - All paths emit a `document_events` row with
    `meta: { reason, note }`.
- New endpoint `POST /documents/:number/restore`:
  - Requires `super_admin`.
  - Clears `deleted_at` + `deleted_by_user_id`.
  - HubSpot side: we DO NOT re-create the Note. Operator must
    manually re-sync via the existing flow if needed.
  - Logs a `restored` event.
- All listing endpoints filter out `deleted_at IS NOT NULL` by
  default. A `?includeDeleted=true` query param (super_admin only)
  surfaces soft-deleted rows for the audit view.

### Frontend
- On `/documents/:number` (single-doc view) add a "Delete document"
  button (visible to admin + super_admin):
  - Opens a modal with a **reason dropdown** (5 options) + a free-text
    "additional note" textarea. "Other" makes the note required.
  - Modal shows a clear warning: "BSG-XXXXX will remain reserved.
    The HubSpot Note will be permanently deleted."
  - Confirm → DELETE request → on success navigate back to /documents
    with a toast.
- New page `/admin/documents/deleted` (super_admin only):
  - Lists soft-deleted documents with reason + note + actor.
  - Per-row "Restore" button.
- The "Documents from this calculator" section on /calc/:id excludes
  soft-deleted rows by default.

### Edge cases (as shipped — Sprint 9.M reconciled with implementation)
- A document is soft-deleted; later a different operator tries to
  "Use as template" → **404 unconditionally**. The implementation
  does NOT honour `?includeDeleted=true` on the use-as-template
  path because templating from a retracted artefact is a product
  smell even for super_admin. A super_admin who really wants to
  template can Restore the doc first.
- `GET /documents/:number` returns **404** to non-super_admin
  callers for soft-deleted docs (Sprint 9.M B5 fix). super_admin
  still sees the full DTO including `deletionReason` + `deletionNote`.
- `GET /documents/:number/events` mirrors the same gate
  (Sprint 9.M B5/B6). The `deleted` event row carries `reason` +
  `hasNote` breadcrumb in `meta`; the raw `deletion_note` content is
  NOT echoed into events to avoid leakage through the events list.
- `GET /documents/:number/pdf` is INTENTIONALLY allowed on
  soft-deleted documents — operators may need to fetch the
  rendered artefact for audit even after retraction. The
  `pdf_downloaded` event is still recorded.
- POST `/documents/:number/sync` on a soft-deleted doc → **404**.
- A soft-deleted document's `calculator_configs.id` FK reference
  is unaffected — the source calc draft can still be edited.

---

## Cross-cutting concerns

### Migration order
The migrations should land in this exact order:
1. `users.role` enum + drop `is_admin` (data migration: `is_admin=true → role='admin'`, bootstrap super_admin from env).
2. TOTP columns on `users` + `trusted_devices` table.
3. `user_invites` table.
4. `admin_actions` table.
5. `document_events` table.
6. `documents.deleted_*` columns + extended `hubspot_sync_state` enum.

### Frontend reorganisation
A new `/me` route + a new `/admin/*` route subtree appear in the
AppHeader for super_admins. Admins see the regular workspace tabs;
super_admins see one extra "Admin" tab that opens a sub-shell with
its own sidebar (Users / Audit log / Deleted documents).

### Test strategy
Each phase ships with:
- Backend integration tests covering happy path + the 403 / 401
  / 404 paths for each new endpoint.
- Frontend component tests for the new UIs (PersonalCabinet,
  AdminUsers, AcceptInvite, ResetPassword, DeleteDocumentModal).
- Manual smoke checklist (no E2E framework yet).

### Out of scope for Phase 8
- SMTP-driven email delivery for invites / resets.
- WebAuthn / passkeys / Microsoft Authenticator-only mode.
- IP whitelist on admin actions.
- SCIM provisioning.
