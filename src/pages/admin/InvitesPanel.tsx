/**
 * Sprint 9.O audit fix M6 — pending-invites table + invite-user modal.
 *
 * Extracted from `AdminUsersPage.tsx` to keep that file under the
 * project's ~800-line ceiling. The panel is self-contained: it owns
 * its own TanStack Query keys (`["admin", "invites"]`), the invite
 * API surface (`listInvites` / `createInvite` / `revokeInvite`), and
 * the modal state for "Invite user".
 *
 * Composition contract:
 *   - `<PendingInvitesPanel />` — rendered below the users table.
 *     Reads + renders all invites with status badges + revoke
 *     buttons for pending ones.
 *   - `<InviteUserModal onClose />` — opened from the "+ Invite user"
 *     button at the page header. Owns its own state; AdminUsersPage
 *     just controls when it mounts.
 *
 * Both components share TanStack Query's `invalidateQueries` flow
 * via the `useQueryClient` hook; the parent does not need to wire
 * any cross-component refresh.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client.js";
import {
  createInvite,
  listInvites,
  revokeInvite,
  type CreateInviteResponse,
  type InviteAdminRow
} from "../../api/invites.js";
import type { UserRole } from "../../api/types.js";
import {
  CopyableField,
  FormError,
  LabelledField,
  ModalShell,
  RoleBadge,
  RoleSelect
} from "./AdminUsersShared.js";

// ────────────────────────────────────────────────────────────────────
// InviteUserModal — super-admin picks a role; server mints a one-time
// link; operator copies the link + forwards via Telegram / Slack.
// The invitee fills email/login/displayName/password themselves on
// /accept-invite. This is the whole point of the invite flow: the
// super-admin chooses ONLY the role.
// ────────────────────────────────────────────────────────────────────

export function InviteUserModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<UserRole>("user");
  const [link, setLink] = useState<CreateInviteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => createInvite({ role }),
    onSuccess: async data => {
      setLink(data);
      // Refresh the panel below so the newly-minted invite shows up
      // immediately. Don't close the modal — the operator still
      // needs to copy the link.
      await queryClient.invalidateQueries({ queryKey: ["admin", "invites"] });
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  });

  function handleGenerate(): void {
    setError(null);
    mutation.mutate();
  }

  return (
    <ModalShell
      title="Invite user"
      subtitle="Pick a role and forward the generated link to the new operator. They'll fill in their own email, login, display name, and password."
      onClose={onClose}
    >
      {link ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            Invite link generated. Copy it below and forward via Telegram / Slack.
            It expires {new Date(link.expiresAt).toLocaleString()}.
          </p>
          <LabelledField label="Invite link">
            <CopyableField value={link.link} />
          </LabelledField>
          <footer className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </footer>
        </div>
      ) : (
        <div className="space-y-3">
          <LabelledField label="Role" required>
            <RoleSelect value={role} onChange={setRole} />
          </LabelledField>

          {error ? <FormError>{error}</FormError> : null}

          <footer className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={mutation.isPending}
              className="rounded-lg border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mutation.isPending ? "Generating…" : "Generate invite link"}
            </button>
          </footer>
        </div>
      )}
    </ModalShell>
  );
}

// ────────────────────────────────────────────────────────────────────
// PendingInvitesPanel — lives below the users table. Lists pending
// invites with a Revoke button, plus the 10 most-recent
// accepted/revoked/expired rows for audit.
// ────────────────────────────────────────────────────────────────────

export function PendingInvitesPanel() {
  const queryClient = useQueryClient();
  const invitesQuery = useQuery({
    queryKey: ["admin", "invites"],
    queryFn: listInvites,
    staleTime: 30_000
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeInvite(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "invites"] });
    }
  });

  // Filter to pending vs finished. The "recent" cap (10) keeps the
  // table from drifting into a long history scroll; for older audit
  // needs the events table is the source of truth.
  const items = invitesQuery.data?.items ?? [];
  const pending = items.filter(i => i.status === "pending");
  const recent = items.filter(i => i.status !== "pending").slice(0, 10);

  return (
    <section className="space-y-2">
      <header>
        <h2 className="text-base font-semibold text-slate-900">Invites</h2>
        <p className="text-xs text-slate-500">
          Pending links that haven't been accepted yet, plus the 10 most-recent finished ones for audit.
        </p>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Created by</th>
              <th className="px-4 py-2 text-left">Expires</th>
              <th className="px-4 py-2 text-left">Accepted by</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {invitesQuery.isLoading ? (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={6}>
                  Loading invites…
                </td>
              </tr>
            ) : invitesQuery.isError ? (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-red-600" colSpan={6}>
                  Failed to load invites
                  {invitesQuery.error instanceof ApiError
                    ? `: ${invitesQuery.error.message}`
                    : "."}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={6}>
                  No invites yet — click "Invite user" above.
                </td>
              </tr>
            ) : (
              <>
                {pending.map(invite => (
                  <InviteRow
                    key={invite.id}
                    invite={invite}
                    onRevoke={() => revokeMutation.mutate(invite.id)}
                    revoking={
                      revokeMutation.isPending && revokeMutation.variables === invite.id
                    }
                  />
                ))}
                {recent.map(invite => (
                  <InviteRow key={invite.id} invite={invite} onRevoke={null} revoking={false} />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InviteRow({
  invite,
  onRevoke,
  revoking
}: {
  invite: InviteAdminRow;
  onRevoke: (() => void) | null;
  revoking: boolean;
}) {
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-2">
        <RoleBadge role={invite.role} />
      </td>
      <td className="px-4 py-2">
        <InviteStatusBadge status={invite.status} />
      </td>
      <td className="px-4 py-2 text-xs text-slate-600">
        {invite.createdByDisplayName}
        <br />
        <span className="text-slate-400">{invite.createdByEmail}</span>
      </td>
      <td className="px-4 py-2 text-xs text-slate-500">
        {new Date(invite.expiresAt).toLocaleString()}
      </td>
      <td className="px-4 py-2 text-xs text-slate-600">
        {invite.acceptedUserEmail ? (
          <>
            {invite.acceptedUserDisplayName}
            <br />
            <span className="text-slate-400">{invite.acceptedUserEmail}</span>
          </>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {onRevoke ? (
          <button
            type="button"
            onClick={onRevoke}
            disabled={revoking}
            className="rounded border border-red-300 bg-white px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {revoking ? "Revoking…" : "Revoke"}
          </button>
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </td>
    </tr>
  );
}

function InviteStatusBadge({ status }: { status: InviteAdminRow["status"] }) {
  const styles: Record<InviteAdminRow["status"], string> = {
    pending: "bg-yellow-100 text-yellow-800",
    accepted: "bg-green-100 text-green-700",
    revoked: "bg-slate-100 text-slate-600",
    expired: "bg-slate-100 text-slate-600"
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[status]}`}
    >
      {status}
    </span>
  );
}
