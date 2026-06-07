/**
 * Phase 8 Stage 3 — super_admin user-management page.
 *
 * Mounted at `/admin/users`, gated by `<RequireRole min="super_admin" />`.
 * Fed by `src/api/users.ts` (CRUD wrappers over the tightened
 * `/api/v1/users` router).
 *
 * Sprint 9.O audit fix M6 — page was decomposed into three files
 * after invite/reset additions pushed it past the 800-line ceiling:
 *   - `AdminUsersPage.tsx` (this file) — users table + Create/Edit/
 *     Reset modals + "+ Invite user" button wiring.
 *   - `admin/InvitesPanel.tsx` — pending-invites table + InviteUserModal.
 *   - `admin/AdminUsersShared.tsx` — modal scaffolding + role/status
 *     badges + RoleSelect + CopyableField (used by both the legacy
 *     modals on this page AND the new InvitesPanel).
 *
 * Three modal kinds owned by this page:
 *   - CreateUser: legacy "create directly with a known password" flow.
 *     Kept as a secondary option for the no-SMTP case where the
 *     operator already has the password in hand. The primary flow is
 *     "+ Invite user" (handled by InvitesPanel.InviteUserModal).
 *   - EditUser: change displayName + role + isActive.
 *   - ResetPassword: 2-tab modal. "Send reset link" (default, new flow
 *     via /reset-password) and "Set immediately" (legacy direct reset).
 *
 * Lock-out guards: the server returns `422` with one of three stable
 * codes (USER_CANNOT_SELF_BLOCK, USER_CANNOT_SELF_DOWNGRADE,
 * LAST_SUPER_ADMIN) which the EditUser modal surfaces inline so the
 * super_admin keeps the form state and can correct the input.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client.js";
import {
  createUser,
  listUsers,
  patchUser,
  resetUserPassword,
  type CreateUserRequest,
  type UpdateUserRequest
} from "../api/users.js";
import {
  createPasswordResetLink,
  type CreateResetLinkResponse
} from "../api/password-resets.js";
import type { PublicUser, UserRole } from "../api/types.js";
import { useAuth } from "../contexts/AuthContext.js";
import {
  CopyableField,
  FormError,
  LabelledField,
  ModalFooter,
  ModalShell,
  RoleBadge,
  RoleSelect,
  StatusBadge
} from "./admin/AdminUsersShared.js";
import {
  InviteUserModal,
  PendingInvitesPanel
} from "./admin/InvitesPanel.js";

// ────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { user: actor } = useAuth();
  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: listUsers,
    staleTime: 30_000
  });

  type ModalState =
    | { kind: "create" }
    | { kind: "invite" }
    | { kind: "edit"; user: PublicUser }
    | { kind: "reset"; user: PublicUser }
    | null;
  const [modal, setModal] = useState<ModalState>(null);

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ["admin", "users"] }) as Promise<void>;

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">
            Manage operator accounts. Super-admin only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setModal({ kind: "invite" })}
            className="rounded-lg border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            + Invite user
          </button>
          <button
            type="button"
            onClick={() => setModal({ kind: "create" })}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            title="Create user directly with a known password (no link)"
          >
            + Create directly
          </button>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Login</th>
              <th className="px-4 py-2 text-left">Display name</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {usersQuery.isLoading ? (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={6}>
                  Loading users…
                </td>
              </tr>
            ) : usersQuery.isError ? (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-red-600" colSpan={6}>
                  Failed to load users
                  {usersQuery.error instanceof ApiError
                    ? `: ${usersQuery.error.message}`
                    : "."}
                </td>
              </tr>
            ) : usersQuery.data?.items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={6}>
                  No users — click "Create user" to add the first one.
                </td>
              </tr>
            ) : (
              usersQuery.data?.items.map(user => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    {user.email}
                    {actor?.id === user.id ? (
                      <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-700">
                        you
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{user.login ?? "—"}</td>
                  <td className="px-4 py-2">{user.displayName || <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-2"><RoleBadge role={user.role} /></td>
                  <td className="px-4 py-2"><StatusBadge active={user.isActive} /></td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setModal({ kind: "edit", user })}
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setModal({ kind: "reset", user })}
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Reset password
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PendingInvitesPanel />

      {modal?.kind === "create" ? (
        <CreateUserModal
          onClose={() => setModal(null)}
          onSaved={async () => {
            await invalidate();
            setModal(null);
          }}
        />
      ) : null}
      {modal?.kind === "invite" ? (
        <InviteUserModal onClose={() => setModal(null)} />
      ) : null}
      {modal?.kind === "edit" ? (
        <EditUserModal
          user={modal.user}
          onClose={() => setModal(null)}
          onSaved={async () => {
            await invalidate();
            setModal(null);
          }}
        />
      ) : null}
      {modal?.kind === "reset" ? (
        <ResetPasswordModal
          user={modal.user}
          onClose={() => setModal(null)}
        />
      ) : null}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// Create modal (legacy direct-create flow)
// ────────────────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [login, setLogin] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: CreateUserRequest) => createUser(body),
    onSuccess: async () => {
      await onSaved();
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setError(err.code === "CONFLICT_USER_EXISTS"
          ? "A user with this email or login already exists."
          : err.message);
      } else {
        setError("Something went wrong. Try again.");
      }
    }
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate({
      email,
      login: login.trim() === "" ? undefined : login.trim(),
      password,
      displayName,
      role
    });
  }

  return (
    <ModalShell title="Create user" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <LabelledField label="Email" required>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </LabelledField>
        <LabelledField label="Login (optional)">
          <input
            type="text"
            value={login}
            onChange={e => setLogin(e.target.value)}
            placeholder="short.handle"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </LabelledField>
        <LabelledField label="Display name">
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </LabelledField>
        <LabelledField label="Initial password" required>
          <input
            type="text"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </LabelledField>
        <LabelledField label="Role">
          <RoleSelect value={role} onChange={setRole} />
        </LabelledField>

        {error ? <FormError>{error}</FormError> : null}
        <ModalFooter
          onCancel={onClose}
          submitting={mutation.isPending}
          submitLabel="Create"
        />
      </form>
    </ModalShell>
  );
}

// ────────────────────────────────────────────────────────────────────
// Edit modal
// ────────────────────────────────────────────────────────────────────

function EditUserModal({
  user,
  onClose,
  onSaved
}: {
  user: PublicUser;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [role, setRole] = useState<UserRole>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (patch: UpdateUserRequest) => patchUser(user.id, patch),
    onSuccess: async () => {
      await onSaved();
    },
    onError: (err: unknown) => {
      // Sprint 9.M N1 — the previous switch/case over `err.code`
      // was dead code (every branch did `setError(err.message)`).
      // The server message is already operator-readable for all
      // three lock-out codes (USER_CANNOT_SELF_BLOCK,
      // USER_CANNOT_SELF_DOWNGRADE, LAST_SUPER_ADMIN) and any
      // future server-side error, so we just surface it directly.
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Try again.");
      }
    }
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Build a diff so we don't send unchanged values; the server
    // would accept them anyway but it keeps the request log tight.
    const patch: UpdateUserRequest = {};
    if (displayName !== user.displayName) patch.displayName = displayName;
    if (role !== user.role) patch.role = role;
    if (isActive !== user.isActive) patch.isActive = isActive;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    mutation.mutate(patch);
  }

  return (
    <ModalShell title={`Edit ${user.email}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <LabelledField label="Display name">
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </LabelledField>
        <LabelledField label="Role">
          <RoleSelect value={role} onChange={setRole} />
        </LabelledField>
        <LabelledField label="Status">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Active (uncheck to block login)
          </label>
        </LabelledField>

        {error ? <FormError>{error}</FormError> : null}
        <ModalFooter
          onCancel={onClose}
          submitting={mutation.isPending}
          submitLabel="Save changes"
        />
      </form>
    </ModalShell>
  );
}

// ────────────────────────────────────────────────────────────────────
// Reset-password modal (Sprint 9.O — 2-tab)
//
//  Tab 1: "Send reset link" (default) — server mints a one-time
//    sha256-hashed token (TTL 1h). Super-admin copies the link, the
//    user opens it, sets their own password. Consuming the link bulk-
//    revokes the user's refresh tokens (sessions die immediately).
//
//  Tab 2: "Set immediately" — legacy direct-set flow. Super-admin
//    types a password, copies it, forwards it via Telegram / Slack.
//    Kept as a fallback for when the operator already knows the value
//    or the link flow is unavailable.
// ────────────────────────────────────────────────────────────────────

function ResetPasswordModal({ user, onClose }: { user: PublicUser; onClose: () => void }) {
  type Tab = "immediate" | "link";
  const [tab, setTab] = useState<Tab>("link");

  return (
    <ModalShell
      title={`Reset password for ${user.email}`}
      onClose={onClose}
    >
      <div className="-mt-2 flex gap-1 rounded-lg bg-slate-100 p-1 text-xs font-semibold">
        <TabButton active={tab === "link"} onClick={() => setTab("link")}>
          Send reset link
        </TabButton>
        <TabButton active={tab === "immediate"} onClick={() => setTab("immediate")}>
          Set immediately
        </TabButton>
      </div>

      {tab === "link" ? (
        <ResetLinkTab user={user} onClose={onClose} />
      ) : (
        <ResetImmediateTab user={user} onClose={onClose} />
      )}
    </ModalShell>
  );
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "flex-1 rounded-md bg-white px-3 py-1.5 text-slate-900 shadow-sm"
          : "flex-1 rounded-md px-3 py-1.5 text-slate-600 transition hover:text-slate-900"
      }
    >
      {children}
    </button>
  );
}

function ResetImmediateTab({ user, onClose }: { user: PublicUser; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (pwd: string) => resetUserPassword(user.id, pwd),
    onSuccess: () => {
      setDoneMessage(
        "Password updated. Copy it from the field above and send it to the user via Telegram / Slack."
      );
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDoneMessage(null);
    mutation.mutate(newPassword);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs text-slate-500">
        The user's old password stops working immediately; existing
        sessions stay active until their access token expires (~15 min).
      </p>
      <LabelledField label="New password" required>
        <input
          type="text"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          required
          minLength={8}
          autoFocus
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </LabelledField>

      {error ? <FormError>{error}</FormError> : null}
      {doneMessage ? (
        <p
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
        >
          {doneMessage}
        </p>
      ) : null}

      <ModalFooter
        onCancel={onClose}
        cancelLabel={doneMessage ? "Close" : "Cancel"}
        submitting={mutation.isPending}
        submitLabel={doneMessage ? "Reset another" : "Reset password"}
        submitDisabled={doneMessage !== null && newPassword.trim() === ""}
      />
    </form>
  );
}

function ResetLinkTab({ user, onClose }: { user: PublicUser; onClose: () => void }) {
  const [link, setLink] = useState<CreateResetLinkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => createPasswordResetLink(user.id),
    onSuccess: data => {
      setLink(data);
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
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Generate a one-time link (valid for 1 hour). Forward it to the
        user via Telegram / Slack. When they open it they set their own
        password — that consumption also revokes every existing session
        for this user.
      </p>

      {link ? (
        <>
          <LabelledField label="Reset link (copy and forward)">
            <CopyableField value={link.link} />
          </LabelledField>
          <p className="text-xs text-slate-500">
            Expires {new Date(link.expiresAt).toLocaleString()}.
          </p>
        </>
      ) : null}

      {error ? <FormError>{error}</FormError> : null}

      <footer className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {link ? "Close" : "Cancel"}
        </button>
        {!link ? (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={mutation.isPending}
            className="rounded-lg border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? "Generating…" : "Generate link"}
          </button>
        ) : null}
      </footer>
    </div>
  );
}
