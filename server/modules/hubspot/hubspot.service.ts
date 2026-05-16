/**
 * HubSpot module-level service helpers.
 *
 * Currently exposes a cached pipelines list so the frontend can
 * resolve `dealstage` ids ↔ human labels without holding the
 * HubSpot token. Cache lifetime: 1 hour. Manual refresh available
 * via `refreshPipelinesCache()` (used by Sprint 5 webhook handler
 * when HubSpot pipeline config changes).
 */

import { hubspot } from "./hubspot.client";
import { logger } from "../../middleware/logger";
import type { HubspotPipelinesResponse } from "./hubspot.types";

interface PipelineStageDTO {
  id: string;
  label: string;
  displayOrder: number;
  /** Probability metadata, e.g. "0.5". */
  probability?: string;
  /** True if HubSpot marked the stage as closed-won / closed-lost. */
  isClosedWon: boolean;
  isClosedLost: boolean;
}

interface PipelineDTO {
  id: string;
  label: string;
  displayOrder: number;
  stages: PipelineStageDTO[];
}

interface PipelinesResponse {
  pipelines: PipelineDTO[];
  /** Flat dictionary stage_id → label for quick frontend lookups. */
  stageLabels: Record<string, string>;
  cachedAt: string;
}

// Cache lifetime: 1 hour. Pipelines change rarely (sales team
// editing in HubSpot UI is a periodic, not frequent, event).
const CACHE_TTL_MS = 60 * 60 * 1000;

interface PipelinesCacheEntry {
  data: PipelinesResponse;
  expiresAt: number;
}

let cache: PipelinesCacheEntry | null = null;
// In-flight refresh promise — guards against thundering herd when
// the cache expires and N concurrent requests would otherwise fire
// N parallel HubSpot calls. The second-through-Nth request awaits
// the first request's promise instead.
let inflight: Promise<PipelinesResponse> | null = null;

function projectToDto(raw: HubspotPipelinesResponse): PipelinesResponse {
  const pipelines: PipelineDTO[] = raw.results
    .filter(p => !p.archived)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map(p => ({
      id: p.id,
      label: p.label,
      displayOrder: p.displayOrder,
      stages: p.stages
        .filter(s => !s.archived)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(s => ({
          id: s.id,
          label: s.label,
          displayOrder: s.displayOrder,
          probability: s.metadata?.probability,
          isClosedWon: s.metadata?.dealClosedWon === "true",
          isClosedLost: s.metadata?.dealClosedLost === "true"
        }))
    }));

  const stageLabels: Record<string, string> = {};
  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages) {
      stageLabels[stage.id] = stage.label;
    }
  }

  return { pipelines, stageLabels, cachedAt: new Date().toISOString() };
}

/**
 * Returns the pipeline list. Hits HubSpot on first call + when the
 * cache TTL expires; otherwise serves from memory.
 *
 * Thundering-herd safe: if N concurrent requests arrive when the
 * cache is stale, only ONE HubSpot request fires. The rest await
 * the same in-flight promise.
 */
export async function getPipelines(): Promise<PipelinesResponse> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.data;
  }
  // Cache miss / expired. If a refresh is already in flight from a
  // concurrent request, ride along on the same promise.
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const raw = await hubspot.listPipelineStages();
      const data = projectToDto(raw);
      cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
      logger.info(
        {
          pipelineCount: data.pipelines.length,
          stageCount: Object.keys(data.stageLabels).length
        },
        "[hubspot] pipelines cache refreshed"
      );
      return data;
    } finally {
      // Release the in-flight slot whether we succeeded or threw —
      // a subsequent request after a failure should retry, not be
      // stuck waiting on a permanently-rejected promise.
      inflight = null;
    }
  })();

  return inflight;
}

/** Force-clear the cache. Phase 5+: called by webhook handler. */
export function refreshPipelinesCache(): void {
  cache = null;
  inflight = null;
}

export type { PipelineDTO, PipelineStageDTO, PipelinesResponse };
