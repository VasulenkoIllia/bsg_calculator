import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "../App.js";

function renderAtPath(path: string) {
  window.history.pushState({}, "", path);
  const user = userEvent.setup();
  return { user, ...render(<App />) };
}

describe("App routing", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/calculator");
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/calculator");
  });

  it("redirects from / to /calculator", async () => {
    renderAtPath("/");

    await waitFor(() => {
      expect(window.location.pathname).toBe("/calculator");
    });
    expect(screen.getByRole("heading", { name: "Zone 0: Calculator Type" })).toBeInTheDocument();
  });

  it("renders CalculatorPage at /calculator", () => {
    renderAtPath("/calculator");

    expect(screen.getByRole("heading", { name: "Zone 0: Calculator Type" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Calculator" }).getAttribute("aria-current")
    ).toBe("page");
  });

  it("renders WizardPage at /wizard with default scope = offer", () => {
    renderAtPath("/wizard");

    expect(screen.getByRole("heading", { name: "Contract Wizard" })).toBeInTheDocument();
    expect(screen.getByLabelText("Document Type")).toHaveValue("offer");
    expect(
      screen.getByRole("link", { name: "Contract Wizard & PDF" }).getAttribute("aria-current")
    ).toBe("page");
  });

  it("seeds WizardPage state from URL params (source, scope, step)", () => {
    renderAtPath(
      "/wizard?source=manualBlank&scope=offerAndAgreement&step=7"
    );

    // Step 7 is rendered (Parties & Signatures heading visible).
    expect(
      screen.getByRole("heading", { name: /Parties & Signatures/ })
    ).toBeInTheDocument();
    // Manual (blank) source mode is the active tile.
    const manualBlankBtn = screen.getByRole("button", { name: "Manual (blank)" });
    expect(manualBlankBtn.className).toMatch(/bg-blue-50/);
    // URL itself confirms scope was kept after sync.
    expect(window.location.search).toContain("scope=offerAndAgreement");
  });

  it("ignores invalid URL params and falls back to defaults", () => {
    renderAtPath("/wizard?source=bogus&scope=invalid&step=99");

    // Defaults applied silently.
    expect(screen.getByLabelText("Document Type")).toHaveValue("offer");
    expect(screen.getByRole("heading", { name: "Step 1. Header / Meta" })).toBeInTheDocument();
  });

  it("renders 404 page for unknown route", () => {
    renderAtPath("/totally-unknown-route");

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Calculator" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Contract Wizard" })).toBeInTheDocument();
  });

  it("changing Document Type updates URL scope param", async () => {
    const { user } = renderAtPath("/wizard");

    expect(window.location.search).toContain("scope=offer");

    await user.selectOptions(screen.getByLabelText("Document Type"), "offerAndAgreement");

    await waitFor(() => {
      expect(window.location.search).toContain("scope=offerAndAgreement");
    });
  });
});
