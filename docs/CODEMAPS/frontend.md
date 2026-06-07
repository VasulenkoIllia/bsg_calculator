# Frontend (SPA) Codemap

**Last Updated:** 2026-06-07 (partial refresh — list pages + soft-delete surface; older tables below predate Phase 4+ and a full `/update-codemaps` regen is pending)
**Framework:** React 19 + Vite 6 + TypeScript (NodeNext modules)
**Entry Point:** `src/main.tsx` → `src/App.tsx`
**Router:** react-router-dom v7 (BrowserRouter)
**Server State:** TanStack Query v5 (useQuery / useInfiniteQuery)
**HTTP:** axios singleton with interceptors

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Browser (React 19 + StrictMode)              │
├─────────────────────────────────────────────────────────────────┤
│  Providers (main.tsx)                                            │
│  1. QueryClientProvider (TanStack Query)                         │
│  2. AuthProvider (cold-boot refresh, login/logout)               │
│  3. App / BrowserRouter                                          │
├─────────────────────────────────────────────────────────────────┤
│  Routes (App.tsx)                                                │
│  /login                          — public LoginPage              │
│  PrivateRoute gate ↓                                             │
│   CalculatorProvider + AppShell layout ↓                         │
│    /                → /companies redirect                        │
│    /companies       → CompaniesPage  (search + pagination)       │
│    /companies/:id   → CompanyDetailPage (header + deals tab)     │
│    /documents       → DocumentsListPage (company filter + search)│
│    /documents/:num  → DocumentViewPage (inline iframe preview)   │
│    /calculator      → CalculatorPage (+ SaveCalculatorModal)     │
│    /wizard          → WizardPage (+ WizardBackendBar + Save)     │
│    *                → NotFoundPage                               │
├─────────────────────────────────────────────────────────────────┤
│  API Layer (src/api/)                                            │
│  • client.ts — axios singleton, interceptors, ApiError           │
│  • auth.ts / companies.ts / deals.ts / hubspot.ts                │
│  • calculator-configs.ts / documents.ts                          │
│  • types.ts — mirror of backend Zod public schemas               │
│  • index.ts — barrel                                             │
├─────────────────────────────────────────────────────────────────┤
│  Hooks (src/hooks/) — React Query + utility                      │
│  • useCompanies — useInfiniteQuery + debounced q                 │
│  • useCompany / useCompanyDeals — single + paginated             │
│  • useDocuments — useInfiniteQuery + filters                     │
│  • useCompanySearch — typeahead (capped at 10 items)             │
│  • useDebouncedValue — generic debounce                          │
├─────────────────────────────────────────────────────────────────┤
│  Modals + bars (src/components/)                                 │
│  • SaveCalculatorModal — calc → calculator-configs POST          │
│  • SaveDocumentModal   — wizard → documents POST (addendum)      │
│  • WizardBackendBar    — Step 1 company/deal picker, peek-driven │
├─────────────────────────────────────────────────────────────────┤
│  UI primitives (src/components/)                                 │
│  • AppShell — main layout with IdentityStrip + workspace tabs    │
│  • PrivateRoute — auth gate (boot splash / redirect / outlet)    │
│  • LoadMoreButton — reusable pagination tail                     │
├─────────────────────────────────────────────────────────────────┤
│  Shared (src/shared/)                                            │
│  • format.ts — formatDate                                        │
│  • constants.ts — QUERY_*_MS, SEARCH_DEBOUNCE_MS                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Auth flow

```
Cold boot (every page load):
  AuthProvider.useEffect (StrictMode-safe via bootedRef latch)
   └─ POST /auth/refresh  (via httpOnly cookie)
        ├─ 200 OK  →  setAccessToken(token) → GET /auth/me → user state
        └─ 401     →  state = { user: null, isBooting: false }
                                ↓
                          PrivateRoute redirects → /login

Login (POST /auth/login):
  LoginPage submits → AuthContext.login()
   ├─ apiClient.post(/auth/login, { identifier, password })
   ├─ 200 OK   → setAccessToken + setState({ user, isBooting: false })
   │            → navigate(fromPath ?? "/companies")
   └─ 401/4xx  → form.setError("root", { message })

Per-request:
  axios request interceptor injects "Authorization: Bearer <token>"
  axios response interceptor:
    401 from any endpoint (NOT /auth/refresh):
      └─ refreshOnce() (single-flight via shared promise)
            ├─ success → replay original with new Bearer
            └─ fail    → onSessionLost() → AuthContext clears state
                          → PrivateRoute redirects → /login

Logout (POST /auth/logout):
  AppShell IdentityStrip → AuthContext.logout()
   ├─ apiClient.post(/auth/logout)   (best-effort)
   └─ always: setAccessToken(null) + setState({ user: null })
       → navigate("/login")
```

---

## File-by-file reference

### `src/api/`

| File | Purpose |
|---|---|
| `client.ts` | axios singleton, in-memory access-token store, refresh-on-401 single-flight, `ApiError` class, `setSessionLostHandler` |
| `types.ts` | Wire types mirroring backend Zod schemas — `PublicUser`, `PublicCompany`, `PublicDeal`, `CursorPage<T>`, `HubspotPipeline`, `ApiErrorEnvelope` |
| `auth.ts` | `login()`, `refresh()`, `logout()`, `me()` |
| `companies.ts` | `listCompanies(params)`, `getCompany(id)`, `listCompanyDeals(id, params)` |
| `deals.ts` | `listDeals(params)`, `getDeal(id)` (scaffolded, not wired to UI yet) |
| `hubspot.ts` | `getPipelines()` |
| `index.ts` | Barrel — exports `ApiError`, types, and `auth/companies/deals/hubspot` namespaces |

**Axios augmentation (in `client.ts`):**

```ts
declare module "axios" {
  export interface AxiosRequestConfig {
    _isRefresh?: boolean;   // marks the /auth/refresh call itself
    _retry?: boolean;       // marks a request already replayed once
  }
}
```

### `src/contexts/AuthContext.tsx`

Single AuthProvider per tab. Exposes `useAuth()`:

```ts
interface AuthContextValue {
  user: PublicUser | null;
  isBooting: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}
```

- `isBooting` is true while the cold-boot refresh is in flight.
  PrivateRoute renders "Loading session…" during this window.
- `login()` rejects with the backend's `ApiError` on failure;
  LoginPage maps known codes (`AUTH_INVALID_CREDENTIALS`,
  `RATE_LIMITED`, etc.) to human messages.
- `logout()` is best-effort: always clears local state even if the
  server call rejects.

### `src/hooks/`

| Hook | Backed by | Notes |
|---|---|---|
| `useCompanies({ q, limit })` | `useInfiniteQuery` | Debounced search via consumer; q < 2 chars → no filter (matches backend Zod min). `items` memoised. Error typed as `ApiError`. |
| `useCompany(id)` | `useQuery` | `enabled: false` when id is undefined. |
| `useCompanyDeals(id)` | `useInfiniteQuery` | Same pagination shape as useCompanies. |
| `useDebouncedValue(value, ms)` | `useState + useEffect` | Generic 300ms debounce default. |

Constants in `src/shared/constants.ts`:
- `SEARCH_DEBOUNCE_MS = 300`
- `COMPANIES_SEARCH_MIN_LENGTH = 2` (in `useCompanies.ts`)
- `QUERY_STALE_TIME_MS = 30_000`
- `QUERY_GC_TIME_MS = 5 * 60_000`

### `src/pages/`

| Page | Path | Purpose |
|---|---|---|
| `LoginPage.tsx` | `/login` | react-hook-form + zod, validates against backend `loginRequestSchema`. Renders splash during `isBooting`. Bounces logged-in users to `state.from` or `/companies`. |
| `CompaniesPage.tsx` | `/companies` | Search box + table (name → segment → lifecycle → updated). LoadMoreButton at tail. `isFetching && !isLoading` → "refreshing…" badge next to Search label. |
| `CompanyDetailPage.tsx` | `/companies/:id` | Company info header (dl with segment, lifecycle, HubSpot id, last synced) + deals table with LoadMoreButton. |
| `CalculatorPage.tsx` | `/calculator`, `/calc/:id` | Pre-2.8 calculator (frozen domain) + edit mode for a saved config (hydrate + auto-save + Sync-to-HubSpot button with re-sync confirm). |
| `WizardPage.tsx` | `/wizard` | Pre-2.8 contract wizard — same as above. |
| `NotFoundPage.tsx` | `*` | 404 with links to /calculator and /wizard. |
| `DocumentsListPage.tsx` | `/documents` | Offers/agreements list. Filters: Company + Number search + Scope + Status. Columns incl. `HubspotSyncBadge`, `DeletionStatusCell` (Active/Deleted + inline super_admin Restore), and an inline **Open → / Delete** (admin) actions column → `DeleteDocumentModal`. |
| `DocumentViewPage.tsx` | `/documents/:number` | Detail: preview + Download PDF + Use-as-Template + Sync + Delete (`DeleteDocumentModal`); soft-deleted banner with reason. |
| `CalculatorsListPage.tsx` | `/calculators` | Saved-calculator drafts. Filters: Company + Title search + **Deal** (`dealScope`) + Status. Columns incl. `HubspotSyncBadge`, `DeletionStatusCell`, inline Open → / Delete (`DeleteCalculatorModal`). "Document draft" rows route to the wizard. |
| `AdminUsersPage.tsx` | `/users` | super_admin user mgmt + `admin/InvitesPanel` (invite create / re-issue-&-copy-link / revoke). |
| `AuditLogPage.tsx` | `/audit-log` | super_admin admin-actions log with target/actor/company filters. |

### `src/components/`

| Component | Purpose |
|---|---|
| `AppShell.tsx` | Main layout: IdentityStrip (signed-in name + Sign out) → CalculatorHeader → WorkspaceTabs (Companies, Calculator, Wizard) → `<Outlet />`. |
| `PrivateRoute.tsx` | Auth gate: boot splash → redirect-to-/login → render outlet. State machine over `useAuth().isBooting` + `user`. |
| `LoadMoreButton.tsx` | Cursor-pagination tail. Renders nothing when `!hasNextPage`. |
| `HubspotSyncBadge.tsx` | Shared 5-state HubSpot-sync pill (Not synced / Synced / Deleting… / Delete failed / Failed). Used by both list pages. |
| `DeletionStatusCell.tsx` | Shared Active/Deleted status cell (badge + `humanReason` + optional inline Restore). Takes primitives; used by both list pages. |
| `DeleteDocumentModal.tsx` / `DeleteCalculatorModal.tsx` | Soft-delete modals (reason dropdown via shared `REASON_OPTIONS` + note; `other` requires a note). ~90% identical — full unification deliberately deferred (per-entity error map is the only real divergence). |
| `ConfirmDialog.tsx` | Reusable confirm modal (used for the "Sync again creates a NEW Note" re-sync guard). |
| `calculator/*` | Pre-2.8 calculator UI (Zones 0-6) — FROZEN domain, untouched. |
| `document-wizard/*` | Pre-2.8 wizard + PDF rendering — untouched. |

### `src/shared/`

| File | Purpose |
|---|---|
| `format.ts` | `formatDate(iso)` |
| `constants.ts` | `QUERY_*_MS`, `SEARCH_DEBOUNCE_MS` |
| `html.ts` | Pre-2.8 HTML helper |
| `deletionReason.ts` | Single source of truth for the soft-delete reason vocabulary: `DELETION_REASONS` tuple, `DeletionReason` type, `humanReason()`, `REASON_OPTIONS`. The two API enums alias `DeletionReason`. |

---

## Testing strategy

Total: 227 tests across 26 files (post-2.8.F).

### Coverage by layer

| Layer | Tests | Files |
|---|---:|---|
| API client | 8 | `src/api/client.test.ts` (interceptors, refresh single-flight, envelope mapping, session-lost callback) |
| AuthContext | 8 | `src/contexts/AuthContext.test.tsx` (cold-boot success/401/other, login/logout, sessionLost handler, wrong usage) |
| Routing & guards | 3 | `src/components/PrivateRoute.test.tsx` |
| Layout | 2 | `src/components/AppShell.test.tsx` (IdentityStrip + logout) |
| Pages | 16 | LoginPage (6), CompaniesPage (5), CompanyDetailPage (5) |
| Legacy calculator/wizard | 184 | `src/test/app.*.test.tsx` (calculator math + zones + URL params + wizard) |

### Test helpers

- `src/test/renderApp.tsx` — wraps full `<App />` with `QueryClientProvider + AuthProvider`. Mocks `authApi.refresh + me` to a fixture user so calculator/wizard tests skip the login screen. Accepts initialPath (default `/calculator`).
- `src/test/setup.ts` — vitest global setup; cleanup + `@testing-library/jest-dom`.

### Conventions

- `vi.restoreAllMocks()` in BOTH beforeEach AND afterEach (replaces the fragile `vi.spyOn().mockReset()` pattern).
- Test fixtures match backend wire shape exactly (`isAdmin/isActive/email`, NOT `role/active/createdAt`).
- `CursorPage` mocks include `limit` field (otherwise type-check fails).

---

## Wire-protocol contracts to keep in sync

If the backend Zod schemas change, update the corresponding `src/api/types.ts` interface in the same PR:

| Backend file | Frontend type |
|---|---|
| `server/modules/auth/auth.schemas.ts:userPublicSchema` | `PublicUser` |
| `server/modules/auth/auth.schemas.ts:loginRequestSchema` | `LoginRequest` + LoginPage `loginFormSchema` |
| `server/modules/companies/companies.schemas.ts:companyPublicSchema` | `PublicCompany` |
| `server/modules/deals/deals.schemas.ts:dealPublicSchema` | `PublicDeal` |
| `server/shared/build-page.ts:PageResult` | `CursorPage<T>` |
| `server/shared/errors.ts:errorEnvelope` | `ApiErrorEnvelope` |

A future "shared Zod schemas" refactor would eliminate this duplication, but is parked until the surface area justifies the build-config complexity.

---

## Configuration

`vite.config.ts`:
- Dev port 5173
- Proxy `/api/* → http://localhost:8080` with `changeOrigin: true`
- Vitest exclude: `server/**`, `.claude/**` (spawned worktrees)

`src/vite-env.d.ts`:
- `VITE_API_BASE_URL` — optional override of API base URL. ⚠ Cross-origin breaks dev auth (SameSite=Strict cookie).

---

## Future Sprint touchpoints

| Future feature | New files | Reuse from 2.8 |
|---|---|---|
| Sprint 3 — Calculator Configs CRUD | `src/api/calculator-configs.ts`, `src/hooks/useCalculatorConfigs.ts`, `<CalcConfigPage />` | `<LoadMoreButton />`, `formatDate`, `SEARCH_DEBOUNCE_MS`, `useDebouncedValue`, ApiError envelope |
| Sprint 4 — Documents listing | `src/api/documents.ts`, hooks, `<DocumentsPage />` + `<DocumentViewPage />` | Same |
| Sprint 5 — Webhooks (no UI) | — | — |
| Sprint 6 (continuation) — Calc page `/calc/:id` | hydrate wizard from `GET /calculator-configs/:id`, debounced PATCH | All API patterns |
