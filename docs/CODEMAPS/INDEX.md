# Architecture Codemaps Index

**Last Updated:** 2026-05-17 (post-Sprint 4.F)

This directory contains architectural maps of the BSG Calculator codebase to help new developers onboard quickly.

## Available Codemaps

### 1. **server.md** — Backend API (Express.js + PostgreSQL)
- **Status:** Feature-complete for Sprints 1–2.7. No changes in 2.8 (frontend-only sprint).
- **Coverage:** 6 modules (auth, users, companies, deals, hubspot, health), 10 shared helpers.
- **Key:** Details the vertical slice pattern, TTL-refresh scheduling, cursor pagination, and three reusable helpers for Phase 3+.
- **Entry Points:**
  - `server/index.ts` → process entrypoint (bind to PORT, graceful shutdown).
  - `server/app.ts` → Express app factory (middleware stack + route mounts).
  - `server/modules/*` → vertical slices (routes → controller → service → repo → schema).

### 2. **frontend.md** — SPA (React 19 + TanStack Query + axios) ⭐ NEW in 2.8
- **Status:** Auth + listings complete (Sprint 2.8.A → E + audit closure F.1 → F.5).
- **Coverage:** API client layer, AuthContext, route guards, listing pages (companies + company-detail), 6 hooks, reusable components.
- **Key:** Wire types mirror backend Zod schemas — `src/api/types.ts` keeps drift-tested.
- **Entry Points:**
  - `src/main.tsx` → QueryClient + AuthProvider + App.
  - `src/App.tsx` → BrowserRouter with PrivateRoute layout.
  - `src/api/*` → endpoint wrappers (auth/companies/deals/hubspot).

---

## Quick Navigation

| Use Case | Codemap | Section |
|----------|---------|---------|
| I'm adding a new API route | server.md | "Module Structure" + "Key Entry Points" |
| I need to fetch from HubSpot with caching | server.md | "HubSpot" + "Sprint 2.7 Helpers" → ttl-refresh.ts |
| I'm building a listing endpoint | server.md | "Sprint 2.7 Helpers" → build-page.ts |
| I need to validate API response DTOs | server.md | "Sprint 2.7 Helpers" → dto-parse.ts |
| I'm debugging an auth flow | server.md + frontend.md | "Auth" module + "Auth flow" diagram |
| I want to understand the error codes | server.md | "Error Handling Envelope" table |
| I'm setting up local dev / Docker | server.md | "Configuration & Constants" + "Deployment & Startup Sequence" |
| I'm adding a new SPA page | frontend.md | "File-by-file reference" + "Future Sprint touchpoints" |
| I'm building a listing UI | frontend.md | useCompanies pattern + `<LoadMoreButton />` reuse |
| I'm writing a form | frontend.md | LoginPage as reference (react-hook-form + zod mirroring backend schema) |
| I'm debugging a 401 / refresh issue | frontend.md | "Auth flow" diagram + `src/api/client.ts` interceptor |

---

## Sprint highlights so far

### Backend (Sprints 1 → 2.7)

1. **Auth System** — JWT access tokens + opaque refresh tokens in HTTP-only cookies (SameSite=Strict).
2. **Vertical Slice Modules** — auth, users, companies, deals, hubspot, health.
3. **HubSpot Integration** — Async TTL-driven refresh (serve stale, fetch in background).
4. **Three Reusable Helpers** for Sprint 3+:
   - `shared/ttl-refresh.ts` — Background sync scheduling (use for any external source sync).
   - `shared/dto-parse.ts` — Response DTO validation (catch server-side projection bugs).
   - `shared/build-page.ts` — Cursor pagination (use for all listing endpoints).
5. **Error Envelope** — Unified `{ error: { code, message, details } }` shape across all endpoints.
6. **Hardening** — 9 audit-driven sub-commits in 2.7 + 7 security findings closed in 2.7.I.

### Frontend (Sprint 2.8 + audit closure)

1. **Auth Layer** — Single axios singleton with refresh-on-401 single-flight, in-memory access token (no localStorage), httpOnly refresh cookie.
2. **Listings** — Companies + CompanyDetail pages with debounced search + cursor pagination via TanStack Query `useInfiniteQuery`.
3. **Type Safety** — `src/api/types.ts` mirrors backend `userPublicSchema/companyPublicSchema/dealPublicSchema` 1:1 (drift caught and fixed in audit closure F.1).
4. **Reusable Frontend Primitives** for Sprint 3+:
   - `<LoadMoreButton />` — pagination tail
   - `useDebouncedValue` — generic debounce
   - `formatDate` (src/shared/format.ts) — locale-aware
   - `SEARCH_DEBOUNCE_MS / QUERY_*_MS` constants
5. **Test Coverage** — 227 tests across 26 files. Patterns: `vi.restoreAllMocks()` in both before/after, full provider stack via `renderApp()`, fixtures matching backend wire shape.
6. **Audit Closure** — 34 findings closed across F.1-F.5 (1 CRITICAL contract drift + 6 HIGH + 11 MED + 16 LOW). Zero open findings.

---

## Sprints status

| Phase | State | Notes |
|-------|-------|-------|
| **Sprint 1** Foundation | ✅ DONE | auth, users, error envelope, base middleware |
| **Sprint 2** HubSpot reads | ✅ DONE | companies + deals + pipelines + backfill |
| **Sprint 2.7** Hardening cycle | ✅ DONE | 9 audit sub-commits A→I + 7 security findings |
| **Sprint 2.8** Frontend auth + listings | ✅ DONE | + F.1→F.5 audit closure (34 findings) |
| **Sprint 3** Calculator Configs CRUD | ✅ DONE | + SaveCalculatorModal flow |
| **Sprint 4** Documents + PDF render | ✅ DONE | + F.1→F.4 audit closure (28 findings) |
| **Sprint 4.E.2** Server-side PDF (shared template) | ✅ DONE | buildOfferPdfHtml shared via tsconfig.server.json glob |
| **Sprint 5** HubSpot webhooks (inbound) | ✅ DONE | `modules/hubspot/webhooks/*` — HMAC v3 + async processor + manual refresh |
| **Sprint 6** Frontend continuation | ⏳ Partial | `/calc/:id` hydration + wizard URL-driven seeding still needed |
| **Sprint 7** Docker + Coolify Deploy | ⏳ Pending | docker-compose + Dockerfile + Coolify config |
| **Sprint 8** Hardening (optional) | ⏳ Pending | E2E Playwright, CSP, observability |
| **Phase 9** HubSpot Note write-back | ⏳ Post-deploy | `POST /crm/v3/objects/notes` with APP_PUBLIC_URL link |

---

## Key Principles

1. **Single Source of Truth** — Backend Zod schemas; frontend types follow.
2. **Reusable Patterns** — Sprint 2.7 (backend helpers) + Sprint 2.8 (frontend helpers) form a baseline every future sprint piggybacks on.
3. **Error Clarity** — Every error code is documented; no surprise 500s.
4. **Test-Driven** — All public APIs have integration tests; edge cases have unit tests.
5. **Vertical Slices** (backend) — Each feature owns routes → controller → service → repo → schema.
6. **Memory-Only Tokens** (frontend) — Access token NEVER touches localStorage; refresh is httpOnly + SameSite=Strict.

---

**Generated with:** TypeScript codebase analysis + JSDoc extraction  
**Last Sync:** Commit 06810f8 (Sprint 2.8.F.5 audit closure complete)
