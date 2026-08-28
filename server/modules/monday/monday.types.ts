/**
 * monday.com GraphQL response types + the column-value fragment.
 *
 * Every shape here was verified against the live BlackStripeGroup account
 * on 2026-08-27 rather than taken from the docs — the boards had been
 * rebuilt four days earlier and four columns the plan mapped onto no
 * longer existed.
 */

import { z } from "zod";

/**
 * THE column-value selection. Read this before changing anything.
 *
 * monday returns column data in TYPE-SPECIFIC fields, not in the generic
 * ones, and the generic fields are `null` for several types:
 *
 *   board_relation -> `text` and `value` are BOTH null; the ids live only
 *                     in `linked_item_ids` / `linked_items`. Reading
 *                     `value` here is how a first attempt concluded the
 *                     boards had no relations at all when in fact 31/31
 *                     deals were linked.
 *   status         -> `label` + `index`. `index` is null on 20 of 103
 *                     items even though the label is set, so it must
 *                     never be treated as "not set".
 *   dropdown       -> `values[] { id label }`.
 *   mirror         -> `display_value` only.
 *
 * We also deliberately fetch ALL columns rather than `column_values(ids:)`:
 * monday silently OMITS unknown ids from that filtered form (HTTP 200, no
 * error), so a stale id would look exactly like an empty column and the
 * mapper would write NULL over good data while reporting success.
 */
export const COLUMN_VALUES_FRAGMENT = `
  column_values {
    id
    type
    text
    ... on StatusValue { label index }
    ... on DropdownValue { values { id label } }
    ... on BoardRelationValue { linked_item_ids linked_items { id name } }
    ... on MirrorValue { display_value }
  }
`;

/** One column value, after the fragment above. */
export const mondayColumnValueSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    text: z.string().nullable().optional(),
    label: z.string().nullable().optional(),
    index: z.number().nullable().optional(),
    values: z.array(z.object({ id: z.string(), label: z.string() })).nullable().optional(),
    linked_item_ids: z.array(z.string()).nullable().optional(),
    linked_items: z.array(z.object({ id: z.string(), name: z.string() })).nullable().optional(),
    display_value: z.string().nullable().optional()
  })
  .passthrough();

/**
 * `state` distinguishes a live item from one sitting in the recycle bin.
 * A deleted item is still returned IN FULL by `items(ids:)` — it does not
 * 404 and it does not come back null — so liveness must be read from this
 * field and never inferred from "the fetch succeeded".
 */
export const mondayItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    state: z.string().optional(),
    created_at: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
    board: z.object({ id: z.string() }).nullable().optional(),
    group: z.object({ id: z.string(), title: z.string() }).nullable().optional(),
    column_values: z.array(mondayColumnValueSchema).default([])
  })
  .passthrough();

export const mondayItemsPageSchema = z
  .object({
    cursor: z.string().nullable().optional(),
    items: z.array(mondayItemSchema).default([])
  })
  .passthrough();

export const mondayColumnSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    type: z.string(),
    settings_str: z.string().nullable().optional()
  })
  .passthrough();

export type MondayColumnValue = z.infer<typeof mondayColumnValueSchema>;
export type MondayItem = z.infer<typeof mondayItemSchema>;
export type MondayItemsPage = z.infer<typeof mondayItemsPageSchema>;
export type MondayColumn = z.infer<typeof mondayColumnSchema>;

/**
 * Three-way liveness classification.
 *
 * `gone` means "absent from the response array" — the ONLY way monday
 * signals that an id does not exist. It returns HTTP 200 with a shorter
 * array and no error and no null placeholder, so absence has to be
 * detected by the caller comparing what it asked for against what came
 * back. Verified live: 3 ids requested, 2 returned, shuffled.
 */
export type MondayItemLiveness = "active" | "recycled" | "gone";

export function classifyMondayItem(
  requestedId: string,
  items: MondayItem[]
): { liveness: MondayItemLiveness; item: MondayItem | null } {
  const item = items.find(i => i.id === requestedId) ?? null;
  if (!item) return { liveness: "gone", item: null };
  // Default a MISSING state to "active", matching both board loaders. The
  // opposite default is destructive: an API that stopped returning `state`
  // — or a field renamed in a version downgrade — would classify every
  // live item as recycled and flag the whole cache as deleted.
  const state = item.state ?? "active";
  return { liveness: state === "active" ? "active" : "recycled", item };
}
