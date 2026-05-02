# Integrations

Date: 2026-05-02
Status: Active. Section "HubSpot (planned)" is forward-looking and not implemented.

## Currently implemented

### Traefik Reverse Proxy

- Purpose: public routing and TLS termination for frontend container.
- Type: infrastructure integration (Docker network + labels).
- Auth: handled by Traefik / environment setup (outside this repository).
- Routing rule: `Host(${APP_DOMAIN})`.
- Container target port: `80`.
- Health dependency: `GET /health` endpoint served by nginx in container.
- Failure handling:
  - If router/network is misconfigured, domain will not resolve to app.
  - Validate labels, network attachment, and cert resolver config.
- Env vars used:
  - `APP_DOMAIN`
  - `TRAEFIK_NETWORK`
  - `TRAEFIK_ENTRYPOINT`
  - `TRAEFIK_TLS`
  - `TRAEFIK_CERTRESOLVER`

### Browser Clipboard API

- Purpose: Zone 6 "Copy to Clipboard" action.
- API: `navigator.clipboard.writeText`.
- Failure handling: UI falls back to "copy manually from preview" message.
- Security notes: depends on browser permission model and secure-context policy.

### Browser Print Dialog (PDF save path)

- Purpose: Zone 6 "Export to PDF" / "Print" and Wizard "Generate PDF".
- Mechanism: popup window with generated HTML + `window.print()`.
- Failure handling: UI shows popup-blocked message and asks user to allow popups.

## Planned integrations

### Backend API (Phase 8 — planned, not implemented)

- Purpose: persist immutable document versions, allocate document numbers, store calculator snapshots, render PDF server-side.
- Module boundaries are listed in `phase_07_unified_document_pipeline_plan.md`.
- The current `server/` directory is a minimal skeleton kept as a starting point; do not treat it as a working backend.

### HubSpot CRM (Phase 9 — planned, not implemented)

⚠ This section documents **the planned interaction model** so future implementation has a stable contract to build against. **No HubSpot API calls exist in the current codebase.** Implementation will start in a dedicated phase after backend foundation is stable. Logic details will be discussed before any code is written.

#### Touchpoints

The CGS will read three HubSpot entities:

| Entity | Why we read it | Used for |
|---|---|---|
| Deal | Identify the commercial opportunity | Pre-fill client context, source `XXXXX` of document number from last 5 digits of Deal ID |
| Company (Client) | Identify the customer | Pre-fill company name on document, alternative `XXXXX` source |
| Calculator (custom object) | Pull pre-configured pricing | Auto-fill wizard from saved calculator snapshot |

The CGS will also write to HubSpot:

| Entity | What we write | Why |
|---|---|---|
| Deal / Company | Document reference (number, link, status) | Make the contract visible inside HubSpot context |
| Custom object (TBD) | Document version metadata | Track lineage and history |

#### Data model assumptions (for backend design)

Each persisted document carries a `hubspot_links` record with:

- `objectType`: `deal` | `company` | `lead` (lead support optional, depending on product decision)
- `objectId`: numeric HubSpot ID
- `calculatorSnapshotId`: optional — only when wizard was seeded from a HubSpot calculator object

These references are stored even before HubSpot integration ships; the integration phase only populates and consumes them.

#### Auth (planned)

- OAuth 2.0 against HubSpot, scoped to the workspace.
- Tokens stored server-side, never exposed to the SPA.
- Per-user RBAC layered on top of HubSpot scopes.

#### Reliability rules (to be enforced when implemented)

- Treat HubSpot API as an unreliable boundary; idempotent writes.
- Retry with exponential backoff on 5xx; respect 429 rate limits.
- Webhook signature verification for any inbound HubSpot events.
- Normalize HubSpot payloads into internal DTOs before they touch domain logic.

#### Open product questions for the dedicated HubSpot phase

These will be answered during the HubSpot kickoff discussion:

1. Which HubSpot object holds the calculator snapshot — Deal property bag, Company property bag, or a dedicated custom object? (Spec mentions "Calculator (Custom Object)".)
2. Does the document number's `XXXXX` always come from the originating object (Deal vs Company), and what is the priority when both exist?
3. What happens to a generated document when the source Deal is deleted in HubSpot? (Likely: keep document immutable, mark link as orphan.)
4. Does HubSpot store the rendered PDF, a link, or both?
5. Two-way sync vs read-only seed?

### DOCX export (out of current scope)

Spec section 9.1 mentions DOCX. Not planned for the current phase.
