# Architecture Codemaps Index

**Last Updated:** 2026-05-16

This directory contains architectural maps of the BSG Calculator codebase to help new developers onboard quickly.

## Available Codemaps

### 1. **server.md** — Backend API (Express.js + PostgreSQL)
- **Status:** Complete for Sprints 1–2.7 (feature-complete).
- **Coverage:** 6 modules (auth, users, companies, deals, hubspot, health), 10 shared helpers.
- **Key:** Details the vertical slice pattern, TTL-refresh scheduling, cursor pagination, and three reusable helpers for Phase 3+.
- **Entry Points:**
  - `server/index.ts` → process entrypoint (bind to PORT, graceful shutdown).
  - `server/app.ts` → Express app factory (middleware stack + route mounts).
  - `server/modules/*` → vertical slices (routes → controller → service → repo → schema).

---

## Quick Navigation

| Use Case | Codemap | Section |
|----------|---------|---------|
| I'm adding a new API route | server.md | "Module Structure" + "Key Entry Points" |
| I need to fetch from HubSpot with caching | server.md | "HubSpot" + "Sprint 2.7 Helpers" → ttl-refresh.ts |
| I'm building a listing endpoint | server.md | "Sprint 2.7 Helpers" → build-page.ts |
| I need to validate API response DTOs | server.md | "Sprint 2.7 Helpers" → dto-parse.ts |
| I'm debugging an auth flow | server.md | "Auth" module + "Error Handling Envelope" |
| I want to understand the error codes | server.md | "Error Handling Envelope" table |
| I'm setting up local dev / Docker | server.md | "Configuration & Constants" + "Deployment & Startup Sequence" |

---

## Sprint 2.7 Highlights

The backend completed the following in Sprints 1–2.7:

1. **Auth System** — JWT access tokens + opaque refresh tokens in HTTP-only cookies.
2. **Vertical Slice Modules** — auth, users, companies, deals, hubspot, health.
3. **HubSpot Integration** — Async TTL-driven refresh (serve stale, fetch in background).
4. **Three Reusable Helpers:**
   - `shared/ttl-refresh.ts` — Background sync scheduling (use for any external source sync).
   - `shared/dto-parse.ts` — Response DTO validation (catch server-side projection bugs).
   - `shared/build-page.ts` — Cursor pagination (use for all listing endpoints).
5. **Error Envelope** — Unified `{ error: { code, message, details } }` shape across all endpoints.
6. **Testing** — Integration tests + per-module unit tests (71 TS files, ~4825 LOC production, 1772 LOC tests).

---

## Future Phases Roadmap

| Phase | Focus | New Modules / Helpers | Codemaps to Add |
|-------|-------|----------------------|-----------------|
| **Phase 3** | Listings + Document Save | calculator-configs, documents | database.md, frontend.md |
| **Phase 5** | HubSpot Webhooks | webhook-handler | (update server.md) |
| **Phase 9** | Admin UI | admin gates, batch ops | (update server.md) |

---

## Key Principles

1. **Single Source of Truth** — Codemaps are generated from code, not manually maintained.
2. **Reusable Patterns** — The Sprint 2.7 helpers (`ttl-refresh`, `dto-parse`, `build-page`) are designed to scale.
3. **Error Clarity** — Every error code is documented; no surprise 500s.
4. **Test-Driven** — All public APIs have integration tests; edge cases have unit tests.
5. **Vertical Slices** — Each feature (auth, companies, deals) owns its routes → controller → service → repo → schema.

---

**Generated with:** TypeScript codebase analysis + JSDoc extraction  
**Last Sync:** Commit 127f8be (Sprint 2.7.I feature-complete)
