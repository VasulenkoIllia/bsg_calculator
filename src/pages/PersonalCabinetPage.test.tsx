/**
 * PersonalCabinetPage — focused tests for the Phase 8 Stage 2 2FA section
 * (enable flow + enabled-state management surface).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import * as authApi from "../api/auth.js";
import { AuthProvider } from "../contexts/AuthContext.js";
import { PersonalCabinetPage } from "./PersonalCabinetPage.js";

const fixtureUser = {
  id: "u-1",
  email: "alice@bsg.test",
  login: "alice",
  displayName: "Alice",
  role: "user" as const,
  isActive: true,
  twoFactorEnabled: false
};

function renderCabinet() {
  vi.spyOn(authApi, "refresh").mockResolvedValue({ accessToken: "tok" });
  vi.spyOn(authApi, "me").mockResolvedValue(fixtureUser);
  return render(
    <MemoryRouter>
      <AuthProvider>
        <PersonalCabinetPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("PersonalCabinetPage — 2FA section", () => {
  it("walks the enable flow: Enable → QR → confirm → backup codes", async () => {
    vi.spyOn(authApi, "get2faStatus").mockResolvedValue({
      enabled: false,
      backupCodesRemaining: 0
    });
    const setupSpy = vi.spyOn(authApi, "setup2fa").mockResolvedValue({
      qrCode: "data:image/png;base64,AAAA",
      manualKey: "JBSWY3DPEHPK3PXP"
    });
    const confirmSpy = vi.spyOn(authApi, "confirm2fa").mockResolvedValue({
      backupCodes: Array.from({ length: 10 }, (_, i) => `code-${i}`)
    });

    renderCabinet();

    const enableBtn = await screen.findByRole("button", { name: /enable 2fa/i });
    // The button is disabled until get2faStatus resolves (the component
    // gates enrollment on a loaded status). Wait for it to enable before
    // clicking, otherwise the click is a no-op and setup2fa never fires.
    await waitFor(() => expect(enableBtn).toBeEnabled());
    fireEvent.click(enableBtn);

    await waitFor(() => expect(setupSpy).toHaveBeenCalled());
    expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(screen.getByAltText(/2fa qr code/i)).toBeInTheDocument();

    fireEvent.input(screen.getByPlaceholderText("123456"), {
      target: { value: "123456" }
    });
    fireEvent.click(screen.getByRole("button", { name: /confirm & enable/i }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledWith("123456"));
    expect(
      await screen.findByText(/save these backup codes/i)
    ).toBeInTheDocument();
    expect(screen.getByText("code-0")).toBeInTheDocument();
  });

  it("shows Disable + remaining count when 2FA is enabled", async () => {
    vi.spyOn(authApi, "get2faStatus").mockResolvedValue({
      enabled: true,
      backupCodesRemaining: 7
    });
    renderCabinet();

    expect(await screen.findByText(/^Enabled$/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /disable 2fa/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/7 backup codes remaining/i)).toBeInTheDocument();
  });
});
