# URL Contract

Date: 2026-05-03
Status: Active. Defines current routes and the planned deep-link surface for documents and calculator snapshots.

## 1. Why this matters

Once the backend ships (Phase 8) we need shareable links:

- Open a saved calculator state by ID.
- Open a generated document version by ID.
- Pre-set wizard scope/source via URL when creating a new draft.

The contract below is what the SPA already supports today and what the backend phase will extend.

## 2. Current routes (frontend-only)

| Path | Handler | Description |
|---|---|---|
| `/` | redirect → `/calculator` | Root falls through to calculator. |
| `/calculator` | `CalculatorPage` | Live calculator workspace. |
| `/wizard` | `WizardPage` | Contract wizard with default seed (calculator source). |
| `*` | `NotFoundPage` | Fallback for unknown routes. |

`AppShell` wraps every page with the BSG header and the workspace tab strip (Calculator / Contract Wizard & PDF). Tabs use `<NavLink>` so the active tab reflects the current route.

## 3. Wizard query parameters

The wizard reads three optional query params on mount and writes them back as the user navigates. URL is the single source of truth for these three values.

| Param | Allowed values | Default | Effect |
|---|---|---|---|
| `source` | `calculator`, `manualBlank`, `manualDefaults` | `calculator` | Seeds the wizard draft from the chosen source. |
| `scope` | `offer`, `offerAndAgreement` | `offer` | Selects document type; `offerAndAgreement` adds Parties & Signatures step. |
| `step` | `1` … `7` | `1` | Active step (1=Header, 2=Payin, 3=Payout, 4=Fees, 5=Terms, 7=Parties, 6=Preview). |

Examples:

- `/wizard?source=manualDefaults&scope=offerAndAgreement` — open wizard for a full Offer + Terms of Agreement starting from manual defaults seed.
- `/wizard?source=manualBlank&scope=offerAndAgreement&step=7` — manual blank, full bundle, jumped to Parties & Signatures.
- `/wizard?source=calculator&step=6` — pull current calculator state, jump straight to Preview.

Invalid values are dropped and the default is applied; users get a working wizard regardless of malformed input.

## 4. Future deep-links (Phase 8 backend / Phase 9 HubSpot)

Not yet implemented in code; this section defines the contract so backend implementation can target it directly.

### Calculator snapshots

| Path | Effect |
|---|---|
| `/calculator/:snapshotId` | Loads an immutable calculator snapshot by ID. Read-only by default; "Edit (saves new snapshot)" CTA. |
| `/calculator?fromSnapshot=:id` | Forks a snapshot into a fresh, mutable calculator. |

### Documents

| Path | Effect |
|---|---|
| `/documents` | List of generated documents (paginated, search/filter). |
| `/documents/:documentId` | View a single immutable document version. Renders the PDF preview from stored payload. |
| `/wizard/:documentId/edit` | Loads an existing document into the wizard, allows edits, saves a NEW document version on submit (immutable lineage). |
| `/wizard?cloneOf=:documentId` | Same as `:id/edit` but explicitly marks intent as "clone". |

### HubSpot deep-links

| Path | Effect |
|---|---|
| `/wizard?dealId=:hsDealId` | Pre-fills wizard with HubSpot Deal context (client name, calculator snapshot reference, document number `XXXXX` suffix). |
| `/wizard?companyId=:hsCompanyId` | Same as above but sourced from HubSpot Company. |
| `/wizard?leadId=:hsLeadId` | Same for Lead, when product enables that flow. |

The HubSpot ID parameters are passed straight to the backend resolution endpoint; the SPA never calls HubSpot directly.

### Read-only public links

| Path | Effect |
|---|---|
| `/share/:linkToken` | Resolves a signed share token to a read-only document or calculator snapshot. Token carries scope (read-only), expiry, and target ID. |

## 5. Implementation notes

- Routing library: `react-router-dom` v7 (BrowserRouter).
- nginx already has `try_files $uri $uri/ /index.html` so client-side routing works on the deployed container.
- The wizard URL params are kept in sync via `useSearchParams` with `{ replace: true }` so step navigation does not bloat the browser history stack.
- Backend phase will introduce 404s for unknown `:snapshotId` / `:documentId`; the current `NotFoundPage` is the fallback today.

## 6. Versioning

Any breaking change to this contract (renamed param, removed route) requires:

1. A migration note in `docs/decisions.md`.
2. A backwards-compatibility window if external systems (HubSpot, sent emails) carry the old form.
