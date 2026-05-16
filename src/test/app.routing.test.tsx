import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./renderApp.js";

describe("App routing", () => {
  it("redirects from / to /companies", async () => {
    // Sprint 2.8.C: companies became the default landing page; / now
    // redirects there instead of /calculator.
    await renderApp("/");

    await waitFor(() => {
      expect(window.location.pathname).toBe("/companies");
    });
  });

  it("renders CalculatorPage at /calculator", async () => {
    await renderApp("/calculator");

    expect(screen.getByRole("heading", { name: "Zone 0: Calculator Type" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Calculator" }).getAttribute("aria-current")
    ).toBe("page");
  });

  it("renders WizardPage at /wizard with default scope = offer", async () => {
    await renderApp("/wizard");

    expect(screen.getByRole("heading", { name: "Contract Wizard" })).toBeInTheDocument();
    expect(screen.getByLabelText("Document Type")).toHaveValue("offer");
    expect(
      screen.getByRole("link", { name: "Contract Wizard & PDF" }).getAttribute("aria-current")
    ).toBe("page");
  });

  it("seeds WizardPage state from URL params (source, scope, step)", async () => {
    await renderApp("/wizard?source=manualBlank&scope=offerAndAgreement&step=7");

    expect(
      screen.getByRole("heading", { name: /Parties & Signatures/ })
    ).toBeInTheDocument();
    const manualBlankBtn = screen.getByRole("button", { name: "Manual (blank)" });
    expect(manualBlankBtn.className).toMatch(/bg-blue-50/);
    expect(window.location.search).toContain("scope=offerAndAgreement");
  });

  it("ignores invalid URL params and falls back to defaults", async () => {
    await renderApp("/wizard?source=bogus&scope=invalid&step=99");

    expect(screen.getByLabelText("Document Type")).toHaveValue("offer");
    expect(screen.getByRole("heading", { name: "Step 1. Header / Meta" })).toBeInTheDocument();
  });

  it("renders 404 page for unknown route", async () => {
    await renderApp("/totally-unknown-route");

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Calculator" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Contract Wizard" })).toBeInTheDocument();
  });

  it("changing Document Type updates URL scope param", async () => {
    const { user } = await renderApp("/wizard");

    expect(window.location.search).toContain("scope=offer");

    await user.selectOptions(screen.getByLabelText("Document Type"), "offerAndAgreement");

    await waitFor(() => {
      expect(window.location.search).toContain("scope=offerAndAgreement");
    });
  });
});
