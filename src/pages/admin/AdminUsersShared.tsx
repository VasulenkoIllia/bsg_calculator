/**
 * Sprint 9.O audit fix M6 — shared primitives for the super_admin
 * user-management surface.
 *
 * Extracted from the monolithic `AdminUsersPage.tsx` (which had grown
 * past 1000 lines after the invite/reset additions). Both
 * `AdminUsersPage` (Create/Edit/Reset modals) and `InvitesPanel`
 * (Invite + Pending invites table) need these helpers; centralising
 * here avoids re-duplicating them and prevents a circular import
 * between the page and the panel.
 *
 * Nothing here is invite- or reset-specific — these are page-local
 * UI primitives. If a third admin surface ever shows up, it can
 * import the same set.
 */

import { useRef, useState } from "react";
import type { UserRole } from "../../api/types.js";
import { isUserRole } from "../../shared/roles.js";

// ────────────────────────────────────────────────────────────────────
// Modal scaffolding
// ────────────────────────────────────────────────────────────────────

interface ModalShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}

export function ModalShell({ title, subtitle, children, onClose }: ModalShellProps) {
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

export function LabelledField({
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

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {children}
    </p>
  );
}

export function ModalFooter({
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

// ────────────────────────────────────────────────────────────────────
// Role + status badges + select
// ────────────────────────────────────────────────────────────────────

export function RoleBadge({ role }: { role: UserRole }) {
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

export function StatusBadge({ active }: { active: boolean }) {
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

export function RoleSelect({
  value,
  onChange
}: {
  value: UserRole;
  onChange: (next: UserRole) => void;
}) {
  return (
    <select
      value={value}
      onChange={e => {
        // Sprint 9.O audit fix L3 — validate the DOM string against
        // the canonical role list before narrowing. Defence in depth
        // for the server's authoritative Zod gate.
        if (isUserRole(e.target.value)) onChange(e.target.value);
      }}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
    >
      <option value="user">user — read-only access</option>
      <option value="admin">admin — manage documents & calculators</option>
      <option value="super_admin">super_admin — full access incl. user management</option>
    </select>
  );
}

// ────────────────────────────────────────────────────────────────────
// CopyableField — readonly input + copy-to-clipboard button
//
// Used by the invite + reset-link surfaces to show the generated URL
// once. Clipboard write is fire-and-forget; we surface a "Copied!"
// label for 1.5s so the operator gets feedback. The per-instance ref
// (instead of `getElementById`) means two CopyableFields can coexist
// on screen without colliding.
// ────────────────────────────────────────────────────────────────────

export function CopyableField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select the text in the input so the user can copy
      // manually via Cmd/Ctrl+C. (Some browsers block writeText on
      // non-secure contexts, e.g. local IP over plain HTTP.)
      inputRef.current?.select();
    }
  }

  return (
    <div className="flex gap-2">
      <input
        ref={inputRef}
        type="text"
        readOnly
        value={value}
        onFocus={e => e.currentTarget.select()}
        className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
      />
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
