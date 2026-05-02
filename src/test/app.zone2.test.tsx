import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./renderApp.js";

describe("Zone 2: Introducer Commission", () => {
  it("renders models and recalculates introducer commission", async () => {
    const { user } = renderApp();

    await user.click(screen.getByRole("button", { name: "Show constants & formulas" }));

    expect(screen.getByText("Standard Tiers")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Agent / Introducer" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Commission model: Standard" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getAllByText("Tier 1 (€0-€10M)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Tier 2 (€10M-€25M)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Tier 3 (>€25M)")).toBeInTheDocument();
    expect(screen.getAllByText("€2,500").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: "Commission model: Custom" }));
    expect(screen.getByLabelText("Tier 1 Up To (M)")).toHaveValue("5");
    expect(screen.getByLabelText("Tier 2 Up To (M)")).toHaveValue("10");
    expect(screen.getByLabelText("Tier 1 Rate (%)")).toHaveValue("0.75");
    expect(screen.getByLabelText("Tier 2 Rate (%)")).toHaveValue("0.5");
    expect(screen.getByLabelText("Tier 3 Rate (%)")).toHaveValue("0.25");
    expect(screen.getAllByText("Tier 1 (€0-€5M)").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("checkbox", { name: "Agent / Introducer" }));
    await user.click(screen.getByRole("button", { name: "Commission model: Rev Share" }));
    expect(screen.getByText("Auto from Zone 5 (Payin only): Total Payin Revenue.")).toBeInTheDocument();
    expect(screen.getByLabelText("Total Revenue (€)")).toHaveAttribute("readonly");
    expect(screen.getAllByText(/Partner Share \(25%\)/).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/Formula: Payin Margin Before Split = Payin Revenue/).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/Formula: Partner Share = Payin Margin Before Split/).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/Formula: Our Margin After Share = Payin Margin Before Split/).length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Partner Share (%) [0-50]")).toHaveValue("25");
    expect(screen.getByRole("checkbox", { name: "Agent / Introducer" })).toBeChecked();

    const shareInput = screen.getByLabelText("Partner Share (%) [0-50]");
    await user.click(shareInput);
    await user.clear(shareInput);
    await user.type(shareInput, "30");
    await user.tab();

    expect(screen.getAllByText(/Partner Share \(30%\)/).length).toBeGreaterThanOrEqual(1);
  });
});
