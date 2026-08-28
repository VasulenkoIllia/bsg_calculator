/**
 * monday.com GraphQL client.
 *
 * Counterpart of `hubspot.client.ts`, but the failure model is different
 * enough that none of it could be ported verbatim:
 *
 *   - monday answers **HTTP 200 with an `errors[]` array** for most
 *     failures. A status-code-only check sees success and hands the
 *     caller `undefined` data.
 *   - Rate limiting arrives either as a JSON 429 or, from the Cloudflare
 *     edge in front of the API, as an **HTML** 429 body that `JSON.parse`
 *     throws on. Observed during discovery on a burst of three queries.
 *   - An unrecognised `API-Version` is **silently downgraded** instead of
 *     rejected, so the pinned version is asserted against what the server
 *     echoes back rather than assumed.
 *   - `items(ids:)` returns rows OUT OF ORDER and silently DROPS unknown
 *     ids (verified live: 3 requested, 2 returned, reversed). Callers must
 *     map by id — `assertNoIndexZipping` below exists to make that
 *     impossible to forget.
 */

import type { ZodTypeAny } from "zod";
import { env } from "../../config/env";
import { logger } from "../../middleware/logger";
import { CrmUnreachableError } from "../../shared/errors";
import {
  COLUMN_VALUES_FRAGMENT,
  mondayItemSchema,
  mondayItemsPageSchema,
  type MondayColumn,
  type MondayItem,
  type MondayItemsPage
} from "./monday.types";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
/** Below this many complexity points left, pause until the window resets. */
const COMPLEXITY_FLOOR = 50_000;

interface RequestOptions {
  maxRetries?: number;
  timeoutMs?: number;
  /** Label used in logs so a failure names the operation, not just a URL. */
  label?: string;
}

interface GqlEnvelope<T> {
  data?: T & { complexity?: { after?: number; reset_in_x_seconds?: number } };
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
  error_message?: string;
  error_code?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Splice `complexity { … }` into the top level of an outgoing query so
 * every response reports what the call cost and how much budget is left.
 * Without this the self-throttle below would never have data to act on.
 * The field itself costs nothing measurable (a probe measured the whole
 * query at 10 points).
 */
function withComplexity(query: string): string {
  if (query.includes("complexity")) return query;
  const open = query.indexOf("{");
  if (open < 0) return query;
  return `${query.slice(0, open + 1)} complexity { after reset_in_x_seconds }${query.slice(open + 1)}`;
}

class MondayClient {
  private readonly endpoint: string;
  private readonly token: string;
  private readonly apiVersion: string;
  /** Set once the first response echoes the version back. */
  private versionAsserted = false;

  constructor() {
    this.endpoint = env.MONDAY_API_BASE_URL;
    this.token = env.MONDAY_API_TOKEN ?? "";
    this.apiVersion = env.MONDAY_API_VERSION;
  }

  isConfigured(): boolean {
    return this.token.length > 0;
  }

  /**
   * Confirm the API is actually serving the version we pinned. monday
   * DOWNGRADES silently on an unrecognised header, which would otherwise
   * surface months later as a field quietly changing shape.
   */
  async assertApiVersion(): Promise<void> {
    const data = await this.query<{ version: { kind: string; value: string } }>(
      `query { version { kind value } }`,
      { label: "version" }
    );
    const served = data.version?.value;
    if (served !== this.apiVersion) {
      throw new CrmUnreachableError(
        `monday served API version "${served}" but we pinned "${this.apiVersion}". ` +
          "An unrecognised version is downgraded silently — fix MONDAY_API_VERSION before continuing.",
        { requested: this.apiVersion, served }
      );
    }
    this.versionAsserted = true;
    logger.info({ apiVersion: served, kind: data.version.kind }, "[monday] API version confirmed");
  }

  // ─── Reads ───────────────────────────────────────────────────────

  /** Column DEFINITIONS for a board — the input to the column resolver. */
  async listBoardColumns(boardId: string): Promise<MondayColumn[]> {
    const data = await this.query<{ boards: Array<{ columns: MondayColumn[] }> }>(
      `query { boards (ids: [${Number(boardId)}]) { columns { id title type settings_str } } }`,
      { label: `columns:${boardId}` }
    );
    return data.boards?.[0]?.columns ?? [];
  }

  /** One page of items. `cursor` continues a previous page. */
  async listBoardItems(
    boardId: string,
    cursor: string | null = null,
    limit = 100
  ): Promise<MondayItemsPage> {
    const selection = `id name state created_at updated_at group { id title } ${COLUMN_VALUES_FRAGMENT}`;
    const query = cursor
      ? `query { next_items_page (limit: ${limit}, cursor: ${JSON.stringify(cursor)}) { cursor items { ${selection} } } }`
      : `query { boards (ids: [${Number(boardId)}]) { items_page (limit: ${limit}) { cursor items { ${selection} } } } }`;

    const data = await this.query<Record<string, unknown>>(query, {
      label: `items:${boardId}${cursor ? ":next" : ""}`
    });
    const raw = cursor
      ? data.next_items_page
      : (data.boards as Array<{ items_page: unknown }> | undefined)?.[0]?.items_page;
    if (raw === undefined || raw === null) {
      // Same explicit guard `listBoardColumns` already has: an unknown
      // board, or one this token cannot see, comes back as an empty
      // `boards` array rather than an error.
      throw new CrmUnreachableError(
        `monday board ${boardId} returned no items_page — the board id is wrong, or the token cannot see it.`,
        { boardId }
      );
    }
    return softValidate<MondayItemsPage>(raw, mondayItemsPageSchema, `items:${boardId}`);
  }

  /**
   * Fetch items by id.
   *
   * Returns a MAP, never an array, precisely because monday reorders the
   * response and omits ids it does not know. Callers look each requested
   * id up by key and treat a miss as `gone` — index-zipping the response
   * against the request would cross-assign one company's data onto
   * another.
   */
  async getItemsById(ids: string[]): Promise<Map<string, MondayItem>> {
    if (ids.length === 0) return new Map();
    const numeric = ids.map(id => Number(id)).filter(n => Number.isFinite(n));
    const selection = `id name state created_at updated_at board { id } group { id title } ${COLUMN_VALUES_FRAGMENT}`;
    const data = await this.query<{ items: unknown[] }>(
      `query { items (ids: [${numeric.join(",")}]) { ${selection} } }`,
      { label: `items:by-id:${ids.length}` }
    );
    const map = new Map<string, MondayItem>();
    for (const raw of data.items ?? []) {
      const item = softValidate<MondayItem>(raw, mondayItemSchema, "items:by-id");
      map.set(item.id, item);
    }
    if (map.size !== ids.length) {
      logger.warn(
        { requested: ids.length, returned: map.size, missing: ids.filter(id => !map.has(id)) },
        "[monday] some requested item ids were not returned — treating them as gone (this is how monday reports a missing id)"
      );
    }
    return map;
  }

  // ─── Writes ──────────────────────────────────────────────────────

  /**
   * Post an update ("note") on an item.
   *
   * This single call replaces HubSpot's TWO-step createNote +
   * associateNoteWith: in monday the item id IS the association, so the
   * "note created but association failed" half-state — and the whole
   * `stage: 'associate'` error branch it required — simply cannot happen.
   *
   * NO RETRIES, deliberately. `create_update` is not idempotent: every
   * successful call mints a new update id, so retrying after a lost
   * response would leave a duplicate note on a customer's card with
   * nothing recording it. A transient failure instead lands the row in
   * `failed` and the operator clicks Retry — visible, and recoverable.
   * (Same reasoning as `hubspot.createNote`, which carries maxRetries: 0
   * for exactly this reason.)
   *
   * The body is HTML: verified on a live probe that `<a href>` survives
   * intact and renders as a link on the card.
   */
  async createUpdate(input: { itemId: string; body: string }): Promise<{ id: string }> {
    const data = await this.query<{ create_update: { id: string } }>(
      `mutation { create_update (item_id: ${Number(input.itemId)}, body: ${JSON.stringify(
        input.body
      )}) { id } }`,
      { label: "create_update", maxRetries: 0 }
    );
    return { id: data.create_update.id };
  }

  /**
   * Remove an update. Treated as idempotent by the caller: monday reports
   * an already-deleted update as a GraphQL error, and an operator who
   * deleted the note by hand in the UI must still be able to delete the
   * document here — so `crm-notes.service` maps that specific case to
   * success rather than failing the whole delete.
   */
  async deleteUpdate(updateId: string): Promise<void> {
    await this.query<{ delete_update: { id: string } }>(
      `mutation { delete_update (id: ${Number(updateId)}) { id } }`,
      { label: "delete_update" }
    );
  }

  // ─── Transport ───────────────────────────────────────────────────

  async query<T>(query: string, options: RequestOptions = {}): Promise<T> {
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const label = options.label ?? "query";

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            // NOTE: a raw token, NOT `Bearer <token>` — monday rejects the
            // Bearer form that HubSpot requires.
            Authorization: this.token,
            "Content-Type": "application/json",
            "API-Version": this.apiVersion
          },
          body: JSON.stringify({ query: withComplexity(query) }),
          signal: controller.signal
        });
        // NB: the timer is cleared only AFTER the body is read. Clearing
        // it at the headers means a server that sends headers and then
        // stalls mid-body leaves us hanging with no timeout at all.
        const bodyText = await response.text();
        clearTimeout(timer);

        // 429 arrives as JSON from monday and as HTML from the edge.
        if (response.status === 429) {
          // A non-numeric Retry-After (monday's edge sometimes sends an
          // HTTP-date) would make this NaN, and `Math.max(NaN, x)` is NaN
          // — collapsing the whole backoff into an immediate retry storm.
          const parsed = Number(response.headers.get("retry-after"));
          const retryAfter = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
          const wait = Math.max(retryAfter * 1000, 8000 * (attempt + 1));
          if (attempt < maxRetries) {
            logger.warn({ label, attempt, wait }, "[monday] 429 — backing off");
            await sleep(wait);
            continue;
          }
          throw new CrmUnreachableError("monday rate-limited and the retry budget is exhausted.", {
            status: 429,
            label
          });
        }

        if (response.status === 401 || response.status === 403) {
          logger.error(
            { label, code: "MONDAY_TOKEN_INVALID", status: response.status },
            "[monday] MONDAY_TOKEN_INVALID — the API token was rejected. Rotate MONDAY_API_TOKEN and restart."
          );
          throw new CrmUnreachableError(
            "monday rejected our API token. Operator action required: rotate MONDAY_API_TOKEN.",
            { status: response.status, label }
          );
        }

        // A 5xx is transient whatever the body looks like. Before this,
        // an upstream blip that happened to return JSON fell through to
        // the GraphQL-error branch and was thrown immediately, while the
        // SAME blip with an HTML body got three retries — the retry
        // behaviour depended on the content type of the failure.
        if (response.status >= 500) {
          if (attempt < maxRetries) {
            const wait = 1000 * 2 ** attempt;
            logger.warn(
              { label, attempt, status: response.status, wait },
              "[monday] 5xx — backing off"
            );
            await sleep(wait);
            continue;
          }
          throw new CrmUnreachableError(`monday returned ${response.status}.`, {
            status: response.status,
            label
          });
        }

        let envelope: GqlEnvelope<T>;
        try {
          envelope = JSON.parse(bodyText) as GqlEnvelope<T>;
        } catch {
          // Non-JSON body: an edge error page. Retry-able.
          if (attempt < maxRetries) {
            const wait = 1000 * 2 ** attempt;
            logger.warn(
              { label, attempt, status: response.status, sample: bodyText.slice(0, 120) },
              "[monday] non-JSON response — backing off"
            );
            await sleep(wait);
            continue;
          }
          throw new CrmUnreachableError(
            `monday returned a non-JSON body (HTTP ${response.status}).`,
            { status: response.status, label }
          );
        }

        // GraphQL-level failure. This is the branch a status-code-only
        // client misses entirely, because the HTTP status is 200.
        if (envelope.errors?.length || envelope.error_message) {
          const message =
            envelope.errors?.map(e => e.message).join(" | ") ??
            envelope.error_message ??
            "unknown monday error";
          const code = envelope.error_code ?? envelope.errors?.[0]?.extensions?.code ?? "";

          // monday signals throttling INSIDE a 200 response as well as by
          // status code. These classes are transient and worth retrying;
          // everything else (validation, bad cursor, bad argument) is a
          // bug in our query and must surface immediately rather than be
          // retried three times.
          const transient = /ComplexityException|RateLimit|Concurrency|Timeout/i.test(
            `${code} ${message}`
          );
          if (transient && attempt < maxRetries) {
            const wait = 8000 * (attempt + 1);
            logger.warn({ label, attempt, code, wait }, "[monday] transient GraphQL error — backing off");
            await sleep(wait);
            continue;
          }
          throw new CrmUnreachableError(`monday GraphQL error: ${message}`, { label, code });
        }

        if (!envelope.data) {
          throw new CrmUnreachableError("monday returned no data and no error.", { label });
        }

        await this.throttleOnComplexity(envelope.data.complexity, label);
        return envelope.data as T;
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof CrmUnreachableError) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          const wait = 1000 * 2 ** attempt;
          logger.warn({ label, attempt, err: lastError.message, wait }, "[monday] network error — backing off");
          await sleep(wait);
          continue;
        }
        break;
      }
    }

    throw new CrmUnreachableError(
      `monday request failed after ${maxRetries + 1} attempts: ${lastError?.message ?? "unknown"}`,
      { label }
    );
  }

  /**
   * Self-throttle before the budget runs out, rather than after. The
   * account's ceiling is 1M complexity per minute (a trial-tier figure —
   * a paid plan raises it), and a full three-board backfill costs ~3k, so
   * this should never fire in normal operation. It exists so a runaway
   * loop degrades into slowness instead of a wall of 429s.
   */
  private async throttleOnComplexity(
    complexity: { after?: number; reset_in_x_seconds?: number } | undefined,
    label: string
  ): Promise<void> {
    // Test PRESENCE, not truthiness: `after === 0` means the budget is
    // fully spent — the one moment the pause is most needed — and a
    // falsy check would skip it precisely then.
    if (typeof complexity?.after !== "number" || complexity.after > COMPLEXITY_FLOOR) return;
    const wait = Math.min((complexity.reset_in_x_seconds ?? 60) * 1000, 60_000);
    logger.warn(
      { label, remaining: complexity.after, wait },
      "[monday] complexity budget nearly exhausted — pausing until the window resets"
    );
    await sleep(wait);
  }

  /** Whether `assertApiVersion()` has run and passed in this process. */
  get isVersionAsserted(): boolean {
    return this.versionAsserted;
  }
}

/**
 * Soft-validate like the HubSpot client does: log the drift, keep serving.
 * A monday schema change should surface as a visible warn, not a 500 in
 * the middle of an operator's day.
 */
function softValidate<T>(raw: unknown, schema: ZodTypeAny, label: string): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data as T;
  logger.warn(
    {
      label,
      issues: result.error.issues.slice(0, 5),
      // `JSON.stringify(undefined)` returns undefined, and `.slice` on it
      // throws a TypeError — inside the very function written to absorb
      // drift without breaking traffic.
      sample: String(JSON.stringify(raw) ?? raw).slice(0, 400)
    },
    "[monday] response shape drift — falling through to a cast"
  );
  return raw as T;
}

export const monday = new MondayClient();
export type { MondayClient };
