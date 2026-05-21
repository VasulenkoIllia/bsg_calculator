/**
 * Phase 8 Stage 3 — super_admin user-management page.
 *
 * Mounted at `/admin/users`, gated by `<RequireRole min="super_admin" />`.
 * Fed by `src/api/users.ts` (CRUD wrappers over the tightened
 * `/api/v1/users` router).
 *
 * The page owns three modal kinds:
 *   - CreateUser: invite a new operator with a super-admin-set
 *     initial password (we don't have SMTP — super_admin copies the
 *     password out of the form and forwards it manually).
 *   - EditUser: change displayName + role + isActive.
 *   - ResetPassword: issue a new password for an existing user (also
 *     hand-forwarded; this is the lost-password recovery path).
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
import type { PublicUser, UserRole } from "../api/types.js";
import { useAuth } from "../contexts/AuthContext.js";

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
        <button
          type="button"
          onClick={() => setModal({ kind: "create" })}
          className="rounded-lg border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          + Create user
        </button>
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

      {modal?.kind === "create" ? (
        <CreateUserModal
          onClose={() => setModal(null)}
          onSaved={async () => {
            await invalidate();
            setModal(null);
          }}
        />
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
// Badges
// ────────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: UserRole }) {
  const styles: Record<UserRole, string> = {
    user: "bg-slate-100 text-slate-700",
    admin: "bg-blue-100 text-blue-700",
    super_admin: "bg-purple-100 text-purple-700"
  };
  const labels: Record<UserRole, string> = {
    user: "user",
    admin: "admin",
    super_admin: "super-admin"
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[role]}`}>
      {labels[role]}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">
      active
    </span>
  ) : (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
      blocked
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────
// Modal shell
// ────────────────────────────────────────────────────────────────────

interface ModalShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}

function ModalShell({ title, subtitle, children, onClose }: ModalShellProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <header>
          <h2 id="admin-modal-title" className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </header>
        {children}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Create modal
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
    <ModalShell
      title="Create user"
      subtitle="Set an initial password and forward it to the new operator out-of-band."
      onClose={onClose}
    >
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
      if (err instanceof ApiError) {
        // Surface the Phase 8 Stage 3 lock-out guard codes as plain
        // operator-readable English. Keep their message body if the
        // server already returned one.
        switch (err.code) {
          case "USER_CANNOT_SELF_BLOCK":
          case "USER_CANNOT_SELF_DOWNGRADE":
          case "LAST_SUPER_ADMIN":
            setError(err.message);
            break;
          default:
            setError(err.message);
        }
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
// Reset-password modal
// ────────────────────────────────────────────────────────────────────

function ResetPasswordModal({ user, onClose }: { user: PublicUser; onClose: () => void }) {
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
    <ModalShell
      title={`Reset password for ${user.email}`}
      subtitle="The user's old password stops working immediately; existing sessions stay active until their access token expires (~15 min)."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
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
    </ModalShell>
  );
}

// ────────────────────────────────────────────────────────────────────
// Small UI primitives (kept inline — only used on this page)
// ────────────────────────────────────────────────────────────────────

function LabelledField({
  label,
  required = false,
  children
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function RoleSelect({ value, onChange }: { value: UserRole; onChange: (next: UserRole) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as UserRole)}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
    >
      <option value="user">user — read-only access</option>
      <option value="admin">admin — manage documents & calculators</option>
      <option value="super_admin">super_admin — full access incl. user management</option>
    </select>
  );
}

function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {children}
    </p>
  );
}

function ModalFooter({
  onCancel,
  cancelLabel = "Cancel",
  submitting,
  submitLabel,
  submitDisabled = false
}: {
  onCancel: () => void;
  cancelLabel?: string;
  submitting: boolean;
  submitLabel: string;
  submitDisabled?: boolean;
}) {
  return (
    <footer className="flex items-center justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        {cancelLabel}
      </button>
      <button
        type="submit"
        disabled={submitting || submitDisabled}
        className="rounded-lg border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Saving…" : submitLabel}
      </button>
    </footer>
  );
}
