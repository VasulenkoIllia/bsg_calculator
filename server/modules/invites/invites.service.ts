/**
 * Sprint 9.O — invite-link service.
 *
 * Orchestrates the three operations:
 *   - `createInviteAndLink` (super_admin) — issues a token + returns
 *     the full `${APP_PUBLIC_URL}/accept-invite?token=<raw>` URL.
 *   - `previewInvite` (public) — token → role + expiresAt for the
 *     /accept-invite page header.
 *   - `acceptInvite` (public) — token + email/login/displayName/password
 *     → new `users` row + auto-login (access+refresh tokens).
 *   - `revokeInviteById` (super_admin) — soft-revoke a pending invite.
 *
 * The invite create + acceptance flows are atomic at the TX level:
 *   - acceptInvite wraps `INSERT users` + `UPDATE user_invites SET
 *     accepted_at, accepted_user_id` in one transaction so a
 *     concurrent /accept never produces two users from one token.
 *
 * Public endpoints return generic `404 INVITE_INVALID` for any
 * "not pending" reason (expired/revoked/used/unknown) — we don't
 * leak which state the token is in.
 */

import bcrypt from "bcrypt";
import { env } from "../../config/env";
import { db } from "../../db/client";
import {
  ConflictError,
  InternalError,
  NotFoundError
} from "../../shared/errors";
import { issueTokenPairForUser } from "../auth/auth.service";
import type { UserPublic } from "../auth/auth.schemas";
import { emailOrLoginExists, insertUser } from "../users/users.repository";
import {
  createInvite,
  findAliveInviteByRawToken,
  findInviteById,
  listInvites as listInvitesRepo,
  markInviteAccepted,
  revokeInvite
} from "./invites.repository";
import type {
  AcceptInviteRequest,
  CreateInviteRequest,
  CreateInviteResponse,
  InviteAdminRow,
  InvitePreview
} from "./invites.schemas";

/**
 * TTL for new invite links. 24 hours matches the original Phase 8
 * spec — long enough for ops to copy + forward via Telegram/Slack
 * + the invitee to act, but short enough that a leaked link rots
 * quickly.
 */
const INVITE_TTL_HOURS = 24;

function buildInviteLink(rawToken: string): string {
  const base = env.APP_PUBLIC_URL.replace(/\/$/, "");
  return `${base}/accept-invite?token=${encodeURIComponent(rawToken)}`;
}

export async function createInviteAndLink(
  body: CreateInviteRequest,
  createdByUserId: string
): Promise<CreateInviteResponse> {
  const { row, rawToken } = await createInvite({
    role: body.role,
    createdByUserId,
    ttlHours: INVITE_TTL_HOURS
  });
  return {
    id: row.id,
    role: row.role,
    expiresAt: row.expiresAt.toISOString(),
    link: buildInviteLink(rawToken)
  };
}

export async function previewInvite(rawToken: string): Promise<InvitePreview> {
  const invite = await findAliveInviteByRawToken(rawToken);
  // Generic 404 for ANY "not pending" reason — never tell the
  // caller whether the token existed but expired vs. never existed.
  if (!invite) throw new NotFoundError("Invite");
  return {
    role: invite.role,
    expiresAt: invite.expiresAt.toISOString()
  };
}

/**
 * Accept an invite + create the user atomically. Returns the same
 * shape as the inner `login` helper — controller will mount the
 * refreshTokenRaw on a cookie and forward accessToken+user in the
 * response body, matching the existing /auth/login behaviour.
 */
export async function acceptInvite(
  rawToken: string,
  body: AcceptInviteRequest
): Promise<{
  accessToken: string;
  refreshTokenRaw: string;
  user: UserPublic;
}> {
  const invite = await findAliveInviteByRawToken(rawToken);
  if (!invite) throw new NotFoundError("Invite");

  // Pre-flight uniqueness check so the duplicate case is a clean
  // 409 rather than a SQL constraint violation downstream.
  const login = body.login ?? null;
  if (await emailOrLoginExists(body.email, login)) {
    throw new ConflictError(
      "CONFLICT_USER_EXISTS",
      "A user with this email or login already exists."
    );
  }

  const passwordHash = await bcrypt.hash(body.password, env.BCRYPT_COST);

  // Sprint 9.O audit fix M2 — wrap user creation + invite consumption
  // in a single transaction. Without this, two concurrent /accept
  // calls with the same raw token could both pass the pre-flight,
  // both insert a user row, and only the first wins `markInviteAccepted`
  // — the loser would throw 409 but leave an orphan user row with
  // an active role and a usable password. Wrapping in `db.transaction`
  // means the orphan INSERT rolls back when `markInviteAccepted`
  // returns zero rows (which we now signal by throwing inside the tx).
  // The bcrypt hash is computed outside the tx (CPU work, not
  // DB-coupled).
  const userRow = await db.transaction(async tx => {
    const created = await insertUser(
      {
        email: body.email,
        login,
        passwordHash,
        displayName: body.displayName,
        role: invite.role
      },
      tx
    );
    const inviteRow = await markInviteAccepted(invite.id, created.id, tx);
    if (!inviteRow) {
      // Race-loser path. Throwing inside the tx triggers a rollback,
      // so the user INSERT above is undone. We catch outside the tx
      // and re-throw as the public 409 ConflictError.
      throw new InviteRaceLost();
    }
    return created;
  }).catch(err => {
    if (err instanceof InviteRaceLost) {
      throw new ConflictError(
        "INVITE_ALREADY_USED",
        "This invite has already been accepted. Ask for a new one."
      );
    }
    throw err;
  });

  // Issue the access+refresh token pair the same way the login
  // endpoint does — pasting straight into AuthContext on the FE.
  const tokens = await issueTokenPairForUser(userRow);
  return {
    accessToken: tokens.accessToken,
    refreshTokenRaw: tokens.refreshToken,
    user: {
      id: userRow.id,
      email: userRow.email,
      login: userRow.login,
      displayName: userRow.displayName,
      role: userRow.role,
      isActive: userRow.isActive
    }
  };
}

/**
 * Internal sentinel — thrown inside the acceptInvite transaction
 * when the optimistic invite UPDATE loses a race. Caught one level
 * up and re-thrown as a public-facing ConflictError. Using a custom
 * class (vs. just throwing the ConflictError directly inside the tx)
 * keeps the rollback-on-throw semantics clear at the call site.
 */
class InviteRaceLost extends Error {
  constructor() {
    super("[invites] race-loser rolling back user INSERT");
  }
}

export async function listInvites(): Promise<InviteAdminRow[]> {
  const rows = await listInvitesRepo();
  // Sprint 9.O — defensive `new Date(...)` wrap matches the
  // documents.service pattern: raw `db.execute` from the LATERAL
  // JOIN occasionally drops the node-pg timestamptz parser and
  // returns the value as a string. Wrapping accepts both Date and
  // string inputs.
  return rows.map(r => ({
    id: r.id,
    role: r.role,
    status: r.status,
    expiresAt: new Date(r.expiresAt).toISOString(),
    createdAt: new Date(r.createdAt).toISOString(),
    createdByDisplayName: r.createdByDisplayName,
    createdByEmail: r.createdByEmail,
    acceptedUserId: r.acceptedUserId,
    acceptedUserDisplayName: r.acceptedUserDisplayName,
    acceptedUserEmail: r.acceptedUserEmail
  }));
}

export async function revokeInviteById(id: string): Promise<void> {
  const existing = await findInviteById(id);
  if (!existing) throw new NotFoundError("Invite");
  if (existing.acceptedAt || existing.revokedAt) {
    // Operator clicked Revoke on a stale list — surface as 409
    // so the UI knows to refresh.
    throw new ConflictError(
      "INVITE_NOT_PENDING",
      "This invite is no longer pending."
    );
  }
  const result = await revokeInvite(id);
  if (!result) {
    throw new InternalError(
      `[invites:revoke] invite ${id} disappeared mid-revoke`
    );
  }
}

/**
 * Re-issue an invite: revoke the old token and mint a FRESH link with the
 * SAME role. Used by the "Re-issue & copy link" action when the operator
 * forgot to copy the link at creation — the raw token is never stored (only
 * hashed), so a brand-new token is the only way to produce a copyable link
 * later. Rejected only if the invite was already ACCEPTED (the user exists);
 * a pending/revoked/expired invite can always be re-issued.
 */
export async function reissueInviteAndLink(
  id: string,
  createdByUserId: string
): Promise<CreateInviteResponse> {
  const existing = await findInviteById(id);
  if (!existing) throw new NotFoundError("Invite");
  if (existing.acceptedAt) {
    throw new ConflictError(
      "INVITE_ALREADY_USED",
      "This invite was already accepted — the user exists. Nothing to re-issue."
    );
  }
  // Revoke the old token (skip if already revoked) so only the NEW link is
  // valid, then mint a fresh invite + link with the same role.
  if (!existing.revokedAt) {
    await revokeInvite(id);
  }
  return createInviteAndLink({ role: existing.role }, createdByUserId);
}
