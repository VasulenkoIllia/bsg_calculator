import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./renderApp.js";

describe("Zone 5 and Zone 6", () => {
  it("renders zone 5 profitability and recalculates totals", async () => {
    const { user } = renderApp();

    await user.click(screen.getByRole("button", { name: "Show constants & formulas" }));

    expect(screen.getByText("Zone 5: Profitability Calculations")).toBeInTheDocument();
    expect(screen.getAllByText("TOTAL PROFITABILITY").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Payin Revenue & Costs").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.queryByRole("heading", { name: "Payout Revenue & Costs" })
    ).not.toBeInTheDocument();

    expect(screen.getByText(/3DS Revenue \(EU €0 \+ WW €0\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "3D Secure Fee" }));
    expect(screen.getByText(/3DS Revenue \(EU €400 \+ WW €100\)/)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Agent / Introducer" }));
    await user.click(screen.getByRole("button", { name: "Commission model: Rev Share" }));
    expect(
      screen.getAllByText(/Formula \(Unified\): Margin Before Split = Total Revenue/).length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Partner Share \(25%\)/).length).toBeGreaterThanOrEqual(1);
  });

  it("supports unified profitability controls (expand/collapse + show formulas)", async () => {
    const { user } = renderApp();

    await user.click(screen.getByRole("button", { name: "Show constants & formulas" }));

    expect(screen.getByRole("heading", { name: "Profitability Calculations" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand all unified profitability rows" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse all unified profitability rows" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Show Formulas" })).toBeChecked();

    expect(screen.getByText(/Formula \(Unified\): Our Margin =/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide constants & formulas" }));
    expect(screen.getByText(/Formula \(Unified\): Our Margin =/)).toBeInTheDocument();

    expect(
      screen.getByText(/Formula \(Unified\): Total Payin Costs = Provider MDR/)
    ).toBeInTheDocument();
    expect(screen.getByText("Provider TRX CC (EU)")).toBeInTheDocument();
    expect(screen.getByText("Provider TRX APM (EU)")).toBeInTheDocument();
    expect(screen.getByText("Provider TRX CC (WW)")).toBeInTheDocument();
    expect(screen.getByText("Provider TRX APM (WW)")).toBeInTheDocument();
    expect(screen.getByText("Scheme Fees (EU, Blended)")).toBeInTheDocument();
    expect(screen.queryByText(/Interchange \(/)).not.toBeInTheDocument();
    expect(screen.queryByText("Scheme Fees (WW, IC++ pass-through)")).not.toBeInTheDocument();
    expect(screen.queryByText("Interchange (WW, IC++ pass-through)")).not.toBeInTheDocument();
    expect(screen.queryByText("Payin 3DS Revenue & Costs")).not.toBeInTheDocument();
    expect(screen.getByText("3DS Revenue (EU)")).toBeInTheDocument();
    expect(screen.getByText("3DS Costs (EU)")).toBeInTheDocument();
    expect(screen.getByText("3DS Revenue (WW)")).toBeInTheDocument();
    expect(screen.getByText("3DS Costs (WW)")).toBeInTheDocument();
    expect(screen.queryByText("Other Revenue Net")).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/Formula \(Unified\): Other Revenue = Settlement Fee/).length
    ).toBeGreaterThanOrEqual(1);
    await user.click(screen.getByRole("checkbox", { name: "Settlement Included" }));
    expect(
      screen.getByText(
        /Formula \(Unified\): Settlement Fee = €0 because Settlement Included is ON in Zone 3/
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Chargeable Net")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Show Formulas" }));
    expect(screen.queryByText(/Formula \(Unified\): Our Margin =/)).not.toBeInTheDocument();

    expect(await screen.findByText("TRX Revenue CC (EU)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collapse all unified profitability rows" }));
    expect(screen.queryByText("TRX Revenue CC (EU)")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand all unified profitability rows" }));
    expect(screen.getByText("TRX Revenue CC (EU)")).toBeInTheDocument();
  });

  it("shows payout provider TRX tier formulas in unified breakdown", async () => {
    const { user } = renderApp();

    await user.click(screen.getByRole("button", { name: "Show constants & formulas" }));
    await user.click(screen.getByRole("checkbox", { name: "Payout" }));

    expect(screen.getByText("Provider TRX Tier 1 (€0-€10M) (Payout)")).toBeInTheDocument();
    expect(screen.getByText("Provider TRX Tier 2 (€10M-€25M) (Payout)")).toBeInTheDocument();
    expect(screen.getByText("Provider TRX Tier 3 (>€25M) (Payout)")).toBeInTheDocument();
    expect(screen.getByText(/Formula \(Unified\): Total Payout Costs = Provider MDR/)).toBeInTheDocument();
    expect(
      screen.getAllByText(/Formula \(Unified\): Payout Net Margin = Total Payout Revenue/).length
    ).toBeGreaterThanOrEqual(1);
  });

  it("renders zone 6 offer summary and updates preview", async () => {
    const { user } = renderApp();

    expect(screen.getByText("Zone 6: Offer Summary")).toBeInTheDocument();
    const summaryPreview = screen.getByLabelText("Offer Summary Preview");
    expect((summaryPreview as HTMLTextAreaElement).value).toContain(
      "BSG CALCULATOR - OFFER SUMMARY"
    );
    expect((summaryPreview as HTMLTextAreaElement).value).toContain("PAYIN:");
    expect((summaryPreview as HTMLTextAreaElement).value).not.toContain("PAYOUT:");
    expect((summaryPreview as HTMLTextAreaElement).value).toContain(
      "Payin Minimum Fee: <=€2.5M: €1 / >€2.5M: N/A"
    );

    const notesField = screen.getByLabelText("Client Notes");
    await user.type(notesField, "High-risk vertical review required.");
    expect((summaryPreview as HTMLTextAreaElement).value).toContain(
      "CLIENT NOTES: High-risk vertical review required."
    );

    await user.click(screen.getByRole("checkbox", { name: "Payout" }));
    expect((summaryPreview as HTMLTextAreaElement).value).toContain("PAYOUT:");

    expect((summaryPreview as HTMLTextAreaElement).value).toContain("Agent / Introducer: No");
    await user.click(screen.getByRole("checkbox", { name: "Agent / Introducer" }));
    await user.click(screen.getByRole("button", { name: "Commission model: Rev Share" }));
    expect((summaryPreview as HTMLTextAreaElement).value).toContain("Type: Rev Share");
  });
});
