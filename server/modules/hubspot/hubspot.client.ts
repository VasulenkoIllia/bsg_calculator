/**
 * HubSpot CRM v3 API client.
 *
 * Read-only wrapper around the endpoints we use during backfill and
 * pull-on-demand sync. Responsibilities:
 *   - Authenticate via Bearer token from env.
 *   - Request the FULL property set we care about (HubSpot returns a
 *     6-property default otherwise).
 *   - Pull deal→company associations on every deal fetch (we need
 *     `hs_primary_associated_company`).
 *   - Retry on 429 (rate-limited) honouring the `Retry-After` header.
 *   - Surface 5xx + network failures as `HubspotUnreachableError` so
 *     the error envelope renders cleanly.
 *
 * Phase 9 (write-back) will extend this with `createNote`,
 * `patchNote`, etc. — out of scope for Sprint 2.
 */

import type { ZodTypeAny } from "zod";
import { env } from "../../config/env";
import { HubspotUnreachableError } from "../../shared/errors";
import { logger } from "../../middleware/logger";
import {
  COMPANY_PROPERTIES,
  DEAL_PROPERTIES,
  hubspotListResponseSchema,
  hubspotObjectSchema,
  hubspotPipelinesResponseSchema,
  type HubspotListResponse,
  type HubspotObject,
  type HubspotPipelinesResponse
} from "./hubspot.types";

/**
 * Soft-validate a HubSpot response against a Zod schema.
 *
 * Failure mode: LOG a warn with the issues + the offending payload
 * snippet, then return the raw value cast as T. This gives us
 * visibility on HubSpot schema drift WITHOUT crashing live traffic.
 * Sprint 5+ can tighten to hard-fail once we have alerting.
 */
function softValidate<T>(raw: unknown, schema: ZodTypeAny, endpoint: string): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data as T;

  logger.warn(
    {
      endpoint,
      issues: result.error.issues.slice(0, 5), // truncate verbose errors
      sample: JSON.stringify(raw).slice(0, 500)
    },
    "[hubspot] response shape drift detected — falling through to cast"
  );
  return raw as T;
}

interface RequestOptions {
  /** Number of retry attempts on 429. Default 3. */
  maxRetries?: number;
  /** Override timeout in ms. Default 30s. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;

class HubspotClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor() {
    this.baseUrl = env.HUBSPOT_API_BASE_URL;
    this.token = env.HUBSPOT_API_TOKEN ?? "";
  }

  /** Whether the client is configured (token present). */
  isConfigured(): boolean {
    return this.token.length > 0;
  }

  // ─── Companies ───────────────────────────────────────────────────

  /** Paginated list of ALL companies (no filter). */
  async listCompanies(
    after?: string,
    limit: number = 100
  ): Promise<HubspotListResponse> {
    const raw = await this.get<unknown>(
      `/crm/v3/objects/companies?${this.buildListQuery(after, limit, COMPANY_PROPERTIES)}`
    );
    return softValidate<HubspotListResponse>(raw, hubspotListResponseSchema, "listCompanies");
  }

  /**
   * Filtered company search via HubSpot Search API.
   *
   * Used by backfill when HUBSPOT_COMPANY_TYPE_FILTER is set —
   * server-side filter is more efficient than pulling all then
   * dropping. See decisions.md → "Sprint 2 company-type filter".
   */
  async searchCompaniesByType(
    companyType: string,
    after?: string,
    limit: number = 100
  ): Promise<HubspotListResponse> {
    const raw = await this.post<unknown>("/crm/v3/objects/companies/search", {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "company_type",
              operator: "EQ",
              value: companyType
            }
          ]
        }
      ],
      properties: COMPANY_PROPERTIES,
      limit,
      after
    });
    return softValidate<HubspotListResponse>(
      raw,
      hubspotListResponseSchema,
      "searchCompaniesByType"
    );
  }

  async getCompany(id: string): Promise<HubspotObject> {
    const raw = await this.get<unknown>(
      `/crm/v3/objects/companies/${encodeURIComponent(id)}?properties=${encodeURIComponent(
        COMPANY_PROPERTIES.join(",")
      )}`
    );
    return softValidate<HubspotObject>(raw, hubspotObjectSchema, "getCompany");
  }

  // ─── Deals ───────────────────────────────────────────────────────

  async listDeals(after?: string, limit: number = 100): Promise<HubspotListResponse> {
    // associations=companies pulls hs_primary_associated_company info,
    // which deal.properties already returns — kept for the side effect
    // of giving us the typed `.associations.companies` array too.
    const raw = await this.get<unknown>(
      `/crm/v3/objects/deals?${this.buildListQuery(after, limit, DEAL_PROPERTIES)}&associations=companies`
    );
    return softValidate<HubspotListResponse>(raw, hubspotListResponseSchema, "listDeals");
  }

  async getDeal(id: string): Promise<HubspotObject> {
    const raw = await this.get<unknown>(
      `/crm/v3/objects/deals/${encodeURIComponent(id)}?properties=${encodeURIComponent(
        DEAL_PROPERTIES.join(",")
      )}&associations=companies`
    );
    return softValidate<HubspotObject>(raw, hubspotObjectSchema, "getDeal");
  }

  // ─── Pipelines ───────────────────────────────────────────────────

  async listPipelineStages(): Promise<HubspotPipelinesResponse> {
    const raw = await this.get<unknown>("/crm/v3/pipelines/deals");
    return softValidate<HubspotPipelinesResponse>(
      raw,
      hubspotPipelinesResponseSchema,
      "listPipelineStages"
    );
  }

  // ─── Internals ───────────────────────────────────────────────────

  private buildListQuery(
    after: string | undefined,
    limit: number,
    properties: readonly string[]
  ): string {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("properties", properties.join(","));
    if (after) params.set("after", after);
    return params.toString();
  }

  /**
   * POST wrapper — used by Search API endpoints. Same retry +
   * timeout policy as GET. Body is JSON-serialised; HubSpot expects
   * application/json content-type.
   */
  private async post<T>(
    path: string,
    body: unknown,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>(path, "POST", body, options);
  }

  private async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, "GET", undefined, options);
  }

  /**
   * Sprint 7.3.D — DELETE helper, used by the Phase 8 document
   * deletion flow that tears down the linked HubSpot Note. Returns
   * void because HubSpot Note delete responds with 204 No Content.
   */
  private async delete(path: string, options: RequestOptions = {}): Promise<void> {
    await this.request<void>(path, "DELETE", undefined, options);
  }

  /**
   * Sprint 7.3.D — DELETE /crm/v3/objects/notes/:id. Resolves on 204
   * (HubSpot's success response). On 404 we treat it as already-gone
   * and resolve (idempotent delete). All other failure modes
   * surface as `HubspotUnreachableError` via the standard retry
   * pipeline. Phase 8 deletion controller calls this AFTER
   * confirming `documents.hubspot_note_id` exists.
   */
  async deleteNote(noteId: string): Promise<void> {
    try {
      await this.delete(`/crm/v3/objects/notes/${encodeURIComponent(noteId)}`);
    } catch (err) {
      // 404 = note already gone in HubSpot. Treat the delete as
      // idempotent so a retry on `delete_failed` row doesn't fail
      // forever once HubSpot side has been cleaned up out-of-band.
      const status =
        err instanceof HubspotUnreachableError &&
        typeof err.details === "object" &&
        err.details !== null &&
        "status" in err.details
          ? (err.details as { status?: number }).status
          : undefined;
      if (status === 404) {
        logger.warn(
          { noteId },
          "[hubspot] deleteNote: HubSpot returned 404 — note already deleted upstream."
        );
        return;
      }
      throw err;
    }
  }

  /**
   * Phase 9 — POST /crm/v3/objects/notes.
   *
   * Creates a stand-alone Note in HubSpot. The Note is NOT associated
   * with any record yet — use `associateNoteWith()` immediately after
   * (or in the same flow) to link it to a deal or company. HubSpot's
   * API doesn't accept associations in the create payload via the
   * v3 single-object endpoint, so we do it as two calls.
   *
   * Required scope: `crm.objects.notes.write`. The Note body is
   * stored verbatim in HubSpot — keep it < 65k chars (HubSpot's
   * documented Note body cap).
   *
   * `body` is plain text by default. For richer formatting, set
   * `bodyContentType="HTML"` and pass HTML in `body` — we use plain
   * text in Phase 9 for fidelity across the HubSpot UI + email
   * digests + mobile app rendering.
   */
  async createNote(input: {
    body: string;
    /** Unix millis timestamp; defaults to now. */
    timestamp?: number;
  }): Promise<{ id: string }> {
    const raw = await this.post<{ id: string }>(`/crm/v3/objects/notes`, {
      properties: {
        hs_note_body: input.body,
        hs_timestamp: input.timestamp ?? Date.now()
      }
    });
    return { id: raw.id };
  }

  /**
   * Phase 9.K — PATCH /crm/v3/objects/notes/{id}. Updates an
   * existing Note's body in place.
   *
   * Used by the calculator sync flow (one Note per calc, refreshed
   * on each manual Sync click). Documents stay on the
   * create-new-each-time policy.
   *
   * If HubSpot returns 404 the caller should fall back to
   * `createNote()` — operator may have manually deleted the Note in
   * HubSpot UI, in which case we want to recover by minting a new
   * one rather than failing forever.
   */
  async updateNote(input: {
    noteId: string;
    body: string;
  }): Promise<{ id: string }> {
    const raw = await this.patch<{ id: string }>(
      `/crm/v3/objects/notes/${encodeURIComponent(input.noteId)}`,
      {
        properties: {
          hs_note_body: input.body
        }
      }
    );
    return { id: raw.id };
  }

  /**
   * Phase 9 — PUT /crm/v3/objects/notes/{id}/associations/{toType}/{toId}/{type}
   *
   * Links a Note to a deal or company. We use the v3 "default"
   * association type so HubSpot picks the predefined "Note → Deal"
   * or "Note → Company" association without us having to enumerate
   * the numeric type id.
   *
   * `toObjectType` is the HubSpot object type name (`deal`,
   * `company`, etc.).
   *
   * `toObjectId` is the HubSpot object id (the natural key, NOT our
   * UUID).
   *
   * Returns void — HubSpot returns the updated association list but
   * we don't consume it.
   */
  async associateNoteWith(input: {
    noteId: string;
    toObjectType: "deal" | "company";
    toObjectId: string;
  }): Promise<void> {
    // The v4 "default" association API lets us omit the numeric
    // association-type id and let HubSpot resolve the canonical one
    // (Note → Deal = 214, Note → Company = 190 in current API, but
    // those numbers are docs-only and can rotate per portal).
    await this.put<unknown>(
      `/crm/v4/objects/notes/${encodeURIComponent(input.noteId)}/associations/default/${encodeURIComponent(
        input.toObjectType
      )}/${encodeURIComponent(input.toObjectId)}`,
      // PUT body is empty for the default-association shortcut.
      undefined
    );
  }

  /**
   * Phase 9 — internal PUT helper. Returns the parsed JSON response
   * (or undefined if HubSpot responds 204). `post()` already exists
   * elsewhere in this class; we only need PUT for the v4 association
   * default-link endpoint.
   */
  private async put<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, "PUT", body, options);
  }

  /**
   * Phase 9.K — internal PATCH helper for partial-update endpoints
   * (HubSpot uses PATCH for `/crm/v3/objects/notes/:id` updates).
   */
  private async patch<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, "PATCH", body, options);
  }

  /** Internal — used by get() / delete() / post() / put() / patch(). Holds the retry/backoff logic. */
  private async request<T>(
    path: string,
    method: "GET" | "POST" | "DELETE" | "PUT" | "PATCH",
    body: unknown,
    options: RequestOptions = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json"
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal
        });
        clearTimeout(timer);

        // 429 — back off + retry.
        if (response.status === 429) {
          const retryAfter = Number.parseInt(
            response.headers.get("retry-after") ?? "1",
            10
          );
          if (attempt < maxRetries) {
            const wait = Math.max(1000, retryAfter * 1000);
            logger.warn(
              { url, attempt, retryAfter, wait },
              "[hubspot] 429 received, backing off"
            );
            await sleep(wait);
            continue;
          }
          throw new HubspotUnreachableError(
            "HubSpot rate-limited and retry budget exhausted.",
            { status: 429, url }
          );
        }

        // Sprint 7.3.D — 401 means our Private App token is invalid
        // or revoked. This is operationally distinct from "4xx — bad
        // request": every subsequent webhook event will fail in the
        // exact same way until the operator rotates the token. We
        // log at ERROR level with a stable `TOKEN_INVALID` tag so an
        // ops alerting rule can pattern-match on it.
        if (response.status === 401) {
          const body = await response.text();
          logger.error(
            { url, body: body.slice(0, 200), code: "HUBSPOT_TOKEN_INVALID" },
            "[hubspot] HUBSPOT_TOKEN_INVALID — Private App token rejected by HubSpot. Rotate the token and restart the app."
          );
          throw new HubspotUnreachableError(
            "HubSpot rejected our Private App token (401). Operator action required: rotate HUBSPOT_API_TOKEN.",
            { status: 401, url }
          );
        }

        // Any other 4xx — surface immediately, not retryable.
        if (response.status >= 400 && response.status < 500) {
          const body = await response.text();
          throw new HubspotUnreachableError(
            `HubSpot returned ${response.status}: ${body.slice(0, 200)}`,
            { status: response.status, url }
          );
        }

        // 5xx — retry-able.
        if (response.status >= 500) {
          if (attempt < maxRetries) {
            const wait = 1000 * 2 ** attempt;
            logger.warn(
              { url, attempt, status: response.status, wait },
              "[hubspot] 5xx received, backing off"
            );
            await sleep(wait);
            continue;
          }
          throw new HubspotUnreachableError(`HubSpot returned ${response.status}.`, {
            status: response.status,
            url
          });
        }

        // Sprint 7.3.D — handle 204 No Content (used by DELETE).
        // Returning undefined-as-T is safe because the typed
        // wrappers (`deleteNote`) declare the void return shape.
        if (response.status === 204) {
          return undefined as T;
        }
        return (await response.json()) as T;
      } catch (err) {
        clearTimeout(timer);
        // Network errors (DNS, connection refused, timeouts via abort)
        // → retry with backoff.
        if (err instanceof HubspotUnreachableError) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          const wait = 1000 * 2 ** attempt;
          logger.warn(
            { url, attempt, err: lastError.message, wait },
            "[hubspot] network error, backing off"
          );
          await sleep(wait);
          continue;
        }
        break;
      }
    }

    throw new HubspotUnreachableError(
      `HubSpot request failed after ${maxRetries + 1} attempts: ${lastError?.message ?? "unknown"}`,
      { url }
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Singleton — re-used across modules. Construction is cheap (just
// reads env); the actual HTTP client (fetch) is a global no-op until
// first call.
export const hubspot = new HubspotClient();

export type { HubspotClient };
