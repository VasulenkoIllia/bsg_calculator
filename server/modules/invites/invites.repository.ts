/**
 * Sprint 9.O — `user_invites` data access.
 *
 * The repository hides the sha256-token-hash pattern from callers:
 *   - `create` accepts the role + creator + TTL, generates the
 *     raw token internally, returns `{ row, rawToken }`. Callers
 *     pass `rawToken` back to the super_admin via the create
 *     response and never persist it.
 *   - `findByRawToken(raw)` hashes + looks up in one round-trip;
 *     callers never see the hash directly.
 *
 * All "alive" lookups (`findByRawToken`, `listPending`) filter out
 * accepted + revoked + expired so a stale raw token can't accept
 * twice.
 */

import { randomBytes, createHash } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  userInvites,
  users,
  type InviteRole,
  type UserInvite
} from "../../db/schema";
import { expectSingle } from "../../shared/db-helpers";

/**
 * Generate a cryptographically random URL-safe token. 32 bytes of
 * entropy → 43 chars base64url — enough that a brute-force attack
 * is computationally infeasible.
 */
function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface CreatedInvite {
  row: UserInvite;
  /**
   * The raw token. Returned ONCE to the super_admin via the API
   * response — never re-fetchable. The DB stores only sha256(raw).
   */
  rawToken: string;
}

export async function createInvite(input: {
  role: InviteRole;
  createdByUserId: string;
  ttlHours: number;
}): Promise<CreatedInvite> {
  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + input.ttlHours * 60 * 60 * 1000);
  const rows = await db
    .insert(userInvites)
    .values({
      role: input.role,
      tokenHash: hashToken(rawToken),
      expiresAt,
      createdByUserId: input.createdByUserId
    })
    .returning();
  return { row: expectSingle(rows, "createInvite"), rawToken };
}

/**
 * Look up an invite by raw token AND verify it is pending.
 * Returns undefined for: unknown token, expired, revoked, accepted.
 * Callers should map undefined → `404 INVITE_INVALID` rather than
 * leaking why (don't tell attacker if the token existed at all).
 */
export async function findAliveInviteByRawToken(
  rawToken: string
): Promise<UserInvite | undefined> {
  const tokenHash = hashToken(rawToken);
  const rows = await db
    .select()
    .from(userInvites)
    .where(
      and(
        eq(userInvites.tokenHash, tokenHash),
        isNull(userInvites.acceptedAt),
        isNull(userInvites.revokedAt),
        gt(userInvites.expiresAt, new Date())
      )
    )
    .limit(1);
  return rows[0];
}

/**
 * Mark an invite as accepted by the just-created user. Run inside
 * the same transaction as the user INSERT so a failure to update
 * the invite row rolls back the user creation too.
 */
export async function markInviteAccepted(
  inviteId: string,
  acceptedUserId: string,
  tx = db
): Promise<UserInvite | undefined> {
  const rows = await tx
    .update(userInvites)
    .set({
      acceptedAt: new Date(),
      acceptedUserId
    })
    .where(
      and(
        eq(userInvites.id, inviteId),
        // Optimistic guard — only mark if STILL pending. Two
        // concurrent /accept requests with the same raw token
        // race on `findAliveInviteByRawToken`; the second
        // UPDATE returns zero rows and the caller throws 409.
        isNull(userInvites.acceptedAt),
        isNull(userInvites.revokedAt)
      )
    )
    .returning();
  return rows[0];
}

/**
 * Soft-revoke a pending invite. No-op when invite is already
 * accepted/revoked (returns undefined → 404 at the service).
 */
export async function revokeInvite(
  inviteId: string
): Promise<UserInvite | undefined> {
  const rows = await db
    .update(userInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(userInvites.id, inviteId),
        isNull(userInvites.acceptedAt),
        isNull(userInvites.revokedAt)
      )
    )
    .returning();
  return rows[0];
}

/**
 * Row shape for the super_admin "Pending invites" panel —
 * includes the inviter's display name so the FE can render
 * "invited by <name>" without an N+1.
 */
export interface InviteListRow {
  id: string;
  role: InviteRole;
  expiresAt: Date;
  createdAt: Date;
  createdByDisplayName: string;
  createdByEmail: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  acceptedUserId: string | null;
  acceptedUserDisplayName: string | null;
  acceptedUserEmail: string | null;
}

/**
 * List ALL invites (any status) for the super_admin admin panel,
 * newest first. The FE renders a status badge per row.
 *
 * Status is computed at SELECT time:
 *   - revoked_at NOT NULL  → 'revoked'
 *   - accepted_at NOT NULL → 'accepted'
 *   - expires_at <= now()  → 'expired'
 *   - else                 → 'pending'
 */
export async function listInvites(): Promise<InviteListRow[]> {
  const inviterUsers = users;
  const result = await db.execute<{
    id: string;
    role: InviteRole;
    expires_at: Date;
    created_at: Date;
    created_by_display_name: string;
    created_by_email: string;
    status: "pending" | "accepted" | "revoked" | "expired";
    accepted_user_id: string | null;
    accepted_user_display_name: string | null;
    accepted_user_email: string | null;
  }>(sql`
    SELECT
      ui.id,
      ui.role,
      ui.expires_at,
      ui.created_at,
      inviter.display_name AS created_by_display_name,
      inviter.email::text AS created_by_email,
      CASE
        WHEN ui.revoked_at IS NOT NULL THEN 'revoked'
        WHEN ui.accepted_at IS NOT NULL THEN 'accepted'
        WHEN ui.expires_at <= now() THEN 'expired'
        ELSE 'pending'
      END AS status,
      ui.accepted_user_id,
      accepter.display_name AS accepted_user_display_name,
      accepter.email::text AS accepted_user_email
    FROM ${userInvites} ui
    JOIN ${inviterUsers} inviter ON inviter.id = ui.created_by_user_id
    LEFT JOIN ${users} accepter ON accepter.id = ui.accepted_user_id
    ORDER BY ui.created_at DESC
    LIMIT 200
  `);
  return result.rows.map(r => ({
    id: r.id,
    role: r.role,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    createdByDisplayName: r.created_by_display_name,
    createdByEmail: r.created_by_email,
    status: r.status,
    acceptedUserId: r.accepted_user_id,
    acceptedUserDisplayName: r.accepted_user_display_name,
    acceptedUserEmail: r.accepted_user_email
  }));
}

export async function findInviteById(
  id: string
): Promise<UserInvite | undefined> {
  const rows = await db.select().from(userInvites).where(eq(userInvites.id, id)).limit(1);
  return rows[0];
}

// Export the helpers so the password-resets repo can reuse them
// without copying the implementation. Both modules share the
// raw→sha256 hashing pattern.
export { generateRawToken, hashToken };
