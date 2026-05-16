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

  /** Internal — used by get() and post(). Holds the retry/backoff logic. */
  private async request<T>(
    path: string,
    method: "GET" | "POST",
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
