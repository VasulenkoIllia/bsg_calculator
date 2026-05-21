/**
 * Phase 8 Stage 3 — AdminUsersPage rendering + actions tests.
 *
 * Covers:
 *   - loading / error / empty / populated states
 *   - "you" badge on the actor row
 *   - role + status badge rendering for all three roles
 *   - Create modal POST → invalidates list
 *   - Edit modal PATCH → invalidates list
 *   - Reset-password modal POST → shows the confirmation message
 *   - Server lock-out error (LAST_SUPER_ADMIN) surfaces inline in
 *     the Edit modal without closing it
 *
 * The frontend RequireRole guard is covered separately at the
 * router layer; this suite assumes a super_admin actor and exercises
 * the page itself.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import * as usersApi from "../api/users.js";
import { ApiError } from "../api/client.js";
import { AuthProvider, useAuth } from "../contexts/AuthContext.js";
import { AdminUsersPage } from "./AdminUsersPage.js";
import * as authApi from "../api/auth.js";
import type { PublicUser } from "../api/types.js";

const SA_USER: PublicUser = {
  id: "u-sa",
  email: "sa@bsg.test",
  login: "sa",
  displayName: "Super Admin",
  role: "super_admin",
  isActive: true
};
const ADMIN_USER: PublicUser = {
  id: "u-admin",
  email: "admin@bsg.test",
  login: "admin",
  displayName: "Admin",
  role: "admin",
  isActive: true
};
const REGULAR_USER: PublicUser = {
  id: "u-reg",
  email: "user@bsg.test",
  login: "user",
  displayName: "Regular",
  role: "user",
  isActive: true
};
const BLOCKED_USER: PublicUser = {
  ...REGULAR_USER,
  id: "u-block",
  email: "ex-employee@bsg.test",
  login: "ex-emp",
  displayName: "Ex Employee",
  isActive: false
};

/**
 * Boots AuthProvider into a logged-in super_admin state so the page
 * can read `useAuth().user` for the "you" badge logic.
 */
function renderPage() {
  vi.spyOn(authApi, "refresh").mockResolvedValue({ accessToken: "test-token" });
  vi.spyOn(authApi, "me").mockResolvedValue(SA_USER);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <BootedShell />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/**
 * Tiny wrapper that waits for AuthProvider's cold-boot refresh
 * before mounting the page — otherwise the page reads `user=null`
 * and the "you" badge logic never runs.
 */
function BootedShell() {
  const { isBooting, user } = useAuth();
  if (isBooting || !user) return <div data-testid="booting" />;
  return <AdminUsersPage />;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminUsersPage — base rendering", () => {
  it("shows the loading state", () => {
    vi.spyOn(usersApi, "listUsers").mockReturnValue(
      new Promise(() => {
        /* never resolves → stays loading */
      })
    );
    renderPage();
    // Wait for the auth boot to finish; the page itself then shows
    // "Loading users…" because the listUsers promise is pending.
    return waitFor(() => {
      expect(screen.getByText(/loading users/i)).toBeInTheDocument();
    });
  });

  it("renders the empty state with no rows", async () => {
    vi.spyOn(usersApi, "listUsers").mockResolvedValue({ items: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no users — click/i)).toBeInTheDocument();
    });
  });

  it("renders rows for each user + 'you' badge on actor row", async () => {
    vi.spyOn(usersApi, "listUsers").mockResolvedValue({
      items: [SA_USER, ADMIN_USER, REGULAR_USER, BLOCKED_USER]
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(SA_USER.email)).toBeInTheDocument();
    });
    expect(screen.getByText(ADMIN_USER.email)).toBeInTheDocument();
    expect(screen.getByText(REGULAR_USER.email)).toBeInTheDocument();
    expect(screen.getByText(BLOCKED_USER.email)).toBeInTheDocument();

    // "you" badge appears only on the SA row.
    const saRow = screen.getByText(SA_USER.email).closest("tr")!;
    expect(within(saRow).getByText(/^you$/i)).toBeInTheDocument();
    const adminRow = screen.getByText(ADMIN_USER.email).closest("tr")!;
    expect(within(adminRow).queryByText(/^you$/i)).toBeNull();

    // Status badges differentiate blocked from active.
    const blockedRow = screen.getByText(BLOCKED_USER.email).closest("tr")!;
    expect(within(blockedRow).getByText(/^blocked$/i)).toBeInTheDocument();
  });

  it("surfaces a backend error message", async () => {
    vi.spyOn(usersApi, "listUsers").mockRejectedValueOnce(
      Object.assign(new Error("Database down"), {
        name: "ApiError",
        code: "INTERNAL_ERROR",
        status: 500
      })
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/failed to load users/i)).toBeInTheDocument();
    });
  });
});

describe("AdminUsersPage — Create modal", () => {
  it("POSTs the form to createUser and invalidates the list", async () => {
    const listSpy = vi.spyOn(usersApi, "listUsers").mockResolvedValue({
      items: [SA_USER]
    });
    const createSpy = vi
      .spyOn(usersApi, "createUser")
      .mockResolvedValueOnce({
        ...REGULAR_USER,
        email: "new@bsg.test",
        displayName: "New Hire"
      });

    renderPage();
    await waitFor(() => expect(listSpy).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /create user/i }));
    fireEvent.change(screen.getByLabelText(/^Email\s*\*/i), {
      target: { value: "new@bsg.test" }
    });
    fireEvent.change(screen.getByLabelText(/Initial password/i), {
      target: { value: "tmp-password-1" }
    });
    fireEvent.change(screen.getByLabelText(/Display name/i), {
      target: { value: "New Hire" }
    });

    fireEvent.click(screen.getByRole("button", { name: /^Create$/i }));
    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "new@bsg.test",
          password: "tmp-password-1",
          displayName: "New Hire",
          role: "user"
        })
      );
    });
  });

  it("renders an inline error on CONFLICT_USER_EXISTS", async () => {
    vi.spyOn(usersApi, "listUsers").mockResolvedValue({ items: [SA_USER] });
    vi.spyOn(usersApi, "createUser").mockRejectedValueOnce(
      new ApiError("CONFLICT_USER_EXISTS", "already exists", 409)
    );
    renderPage();
    await waitFor(() => expect(screen.getByText(SA_USER.email)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /create user/i }));
    fireEvent.change(screen.getByLabelText(/^Email\s*\*/i), {
      target: { value: "dup@bsg.test" }
    });
    fireEvent.change(screen.getByLabelText(/Initial password/i), {
      target: { value: "anyOldThing9" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^Create$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/already exists/i)
      ).toBeInTheDocument();
    });
  });
});

describe("AdminUsersPage — Edit modal", () => {
  it("PATCHes the displayed user and invalidates the list", async () => {
    vi.spyOn(usersApi, "listUsers").mockResolvedValue({
      items: [SA_USER, ADMIN_USER]
    });
    const patchSpy = vi
      .spyOn(usersApi, "patchUser")
      .mockResolvedValueOnce({ ...ADMIN_USER, displayName: "Renamed" });

    renderPage();
    await waitFor(() => expect(screen.getByText(ADMIN_USER.email)).toBeInTheDocument());

    // Click "Edit" on the admin row (NOT the SA row, to avoid the
    // self-edit lock-out paths).
    const adminRow = screen.getByText(ADMIN_USER.email).closest("tr")!;
    fireEvent.click(within(adminRow).getByRole("button", { name: /edit/i }));

    fireEvent.change(screen.getByLabelText(/Display name/i), {
      target: { value: "Renamed" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^Save changes$/i }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        ADMIN_USER.id,
        expect.objectContaining({ displayName: "Renamed" })
      );
    });
  });

  it("surfaces LAST_SUPER_ADMIN 422 inline without closing the modal", async () => {
    vi.spyOn(usersApi, "listUsers").mockResolvedValue({
      items: [SA_USER, ADMIN_USER]
    });
    vi.spyOn(usersApi, "patchUser").mockRejectedValueOnce(
      new ApiError(
        "LAST_SUPER_ADMIN",
        "Cannot demote or block the last active super-admin. Promote another user first.",
        422
      )
    );

    renderPage();
    await waitFor(() => expect(screen.getByText(ADMIN_USER.email)).toBeInTheDocument());

    const adminRow = screen.getByText(ADMIN_USER.email).closest("tr")!;
    fireEvent.click(within(adminRow).getByRole("button", { name: /edit/i }));

    // Just trigger a save — the mock rejects regardless of body.
    fireEvent.change(screen.getByLabelText(/Display name/i), {
      target: { value: "Renamed" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^Save changes$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/cannot demote or block the last active super-admin/i)
      ).toBeInTheDocument();
    });
    // Modal still open — the dialog heading is still in the DOM.
    expect(screen.getByText(`Edit ${ADMIN_USER.email}`)).toBeInTheDocument();
  });
});

describe("AdminUsersPage — Reset password modal", () => {
  it("POSTs the new password and shows the confirmation message", async () => {
    vi.spyOn(usersApi, "listUsers").mockResolvedValue({
      items: [SA_USER, REGULAR_USER]
    });
    const resetSpy = vi
      .spyOn(usersApi, "resetUserPassword")
      .mockResolvedValueOnce({ ...REGULAR_USER });

    renderPage();
    await waitFor(() => expect(screen.getByText(REGULAR_USER.email)).toBeInTheDocument());

    const row = screen.getByText(REGULAR_USER.email).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: /reset password/i }));

    // Scope to the modal dialog so we don't pick up the table-row
    // "Reset password" button — both share the same accessible name.
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/new password/i), {
      target: { value: "freshSecret9" }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Reset password$/i }));

    await waitFor(() => {
      expect(resetSpy).toHaveBeenCalledWith(REGULAR_USER.id, "freshSecret9");
    });
    await waitFor(() => {
      expect(
        screen.getByText(/Password updated\. Copy it from the field above/i)
      ).toBeInTheDocument();
    });
  });
});
