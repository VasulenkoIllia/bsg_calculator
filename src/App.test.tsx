import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App.js";

describe("App UI", () => {
  it("shows auto average transaction fields in input blocks as readonly", async () => {
    const user = userEvent.setup();

    render(<App />);

    const payinAverage = screen.getByLabelText("Average Transaction (€) - Auto");
    expect(payinAverage).toHaveAttribute("readonly");

    await user.click(screen.getByRole("checkbox", { name: "Payout" }));

    const averageFields = screen.getAllByLabelText("Average Transaction (€) - Auto");
    expect(averageFields).toHaveLength(2);
    for (const field of averageFields) {
      expect(field).toHaveAttribute("readonly");
    }
  });

  it("formats number input with commas and decimal point on blur", async () => {
    const user = userEvent.setup();

    render(<App />);

    const payinVolumeInput = screen.getByLabelText("Monthly Payin Volume (€)");
    expect(payinVolumeInput).toHaveValue("1,000,000");

    await user.click(payinVolumeInput);
    await user.clear(payinVolumeInput);
    await user.type(payinVolumeInput, "1234567.89");
    await user.tab();

    expect(payinVolumeInput).toHaveValue("1,234,567.89");
  });

  it("applies zone defaults and resets editable values from the top controls", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getByRole("checkbox", { name: "Payin" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Payout" })).not.toBeChecked();
    expect(screen.getByLabelText("Monthly Payin Volume (€)")).toHaveValue("1,000,000");
    expect(screen.getByLabelText("Successful Payin Transactions")).toHaveValue("10,000");
    expect(screen.getByLabelText("Payin Approval Ratio (%)")).toHaveValue("80");
    expect(screen.getByLabelText("EU Split (%)")).toHaveValue("80");
    expect(screen.getByLabelText("WW Split (%)")).toHaveValue("20");
    expect(screen.getByLabelText("CC Split (%)")).toHaveValue("90");
    expect(screen.getByLabelText("APM Split (%)")).toHaveValue("10");

    await user.click(screen.getByRole("checkbox", { name: "Payout" }));
    expect(screen.getByLabelText("Monthly Payout Volume (€)")).toHaveValue("200,000");
    expect(screen.getByLabelText("Total Payout Transactions")).toHaveValue("2,000");

    await user.click(screen.getByRole("button", { name: "Reset all to 0" }));

    expect(screen.getByRole("checkbox", { name: "Payin" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Payout" })).not.toBeChecked();
    expect(screen.getByLabelText("Monthly Payin Volume (€)")).toHaveValue("0");
    expect(screen.getByLabelText("Successful Payin Transactions")).toHaveValue("0");
    expect(screen.getByLabelText("Payin Approval Ratio (%)")).toHaveValue("0");
    expect(screen.getByLabelText("EU Split (%)")).toHaveValue("0");
    expect(screen.getByLabelText("CC Split (%)")).toHaveValue("0");

    await user.click(screen.getByRole("checkbox", { name: "Payout" }));
    expect(screen.getByLabelText("Monthly Payout Volume (€)")).toHaveValue("0");
    expect(screen.getByLabelText("Total Payout Transactions")).toHaveValue("0");

    await user.click(screen.getByRole("button", { name: "Apply defaults" }));

    expect(screen.getByRole("checkbox", { name: "Payin" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Payout" })).not.toBeChecked();
    expect(screen.getByLabelText("Monthly Payin Volume (€)")).toHaveValue("1,000,000");
    expect(screen.getByLabelText("Successful Payin Transactions")).toHaveValue("10,000");
    expect(screen.getByLabelText("Payin Approval Ratio (%)")).toHaveValue("80");
    expect(screen.getByLabelText("EU Split (%)")).toHaveValue("80");
    expect(screen.getByLabelText("WW Split (%)")).toHaveValue("20");
    expect(screen.getByLabelText("CC Split (%)")).toHaveValue("90");
    expect(screen.getByLabelText("APM Split (%)")).toHaveValue("10");

    await user.click(screen.getByRole("checkbox", { name: "Payout" }));
    expect(screen.getByLabelText("Monthly Payout Volume (€)")).toHaveValue("200,000");
    expect(screen.getByLabelText("Total Payout Transactions")).toHaveValue("2,000");
  });

  it("shows split formulas under each split input and recalculates on split changes", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(
      screen.getByText(
        "EU Volume = Rounded Monthly Payin Volume (€1,000,000) × EU Split (80%) = €800,000"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "WW Volume = Rounded Monthly Payin Volume (€1,000,000) × WW Split (20%) = €200,000"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "CC Volume = Rounded Monthly Payin Volume (€1,000,000) × CC Split (90%) = €900,000"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "APM Volume = Rounded Monthly Payin Volume (€1,000,000) × APM Split (10%) = €100,000"
      )
    ).toBeInTheDocument();

    const euSplitInput = screen.getByLabelText("EU Split (%)");
    await user.click(euSplitInput);
    await user.clear(euSplitInput);
    await user.type(euSplitInput, "60");
    await user.tab();

    expect(
      screen.getByText(
        "EU Volume = Rounded Monthly Payin Volume (€1,000,000) × EU Split (60%) = €600,000"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "WW Volume = Rounded Monthly Payin Volume (€1,000,000) × WW Split (40%) = €400,000"
      )
    ).toBeInTheDocument();

    const ccSplitInput = screen.getByLabelText("CC Split (%)");
    await user.click(ccSplitInput);
    await user.clear(ccSplitInput);
    await user.type(ccSplitInput, "80");
    await user.tab();

    expect(
      screen.getByText(
        "CC Volume = Rounded Monthly Payin Volume (€1,000,000) × CC Split (80%) = €800,000"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "APM Volume = Rounded Monthly Payin Volume (€1,000,000) × APM Split (20%) = €200,000"
      )
    ).toBeInTheDocument();
  });

  it("renders zone 2 models and recalculates introducer commission", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getByText("Standard Tiers")).toBeInTheDocument();
    expect(screen.getAllByText("Tier 1 (€0-€10M)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Tier 2 (€10M-€25M)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Tier 3 (>€25M)")).toBeInTheDocument();

    expect(screen.getAllByText("€2,500").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: "Commission model: Custom" }));
    expect(screen.getAllByText("€2,500").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: "Commission model: Rev Share" }));
    expect(screen.getByText("Auto from Zone 5 (Payin only): Total Payin Revenue.")).toBeInTheDocument();
    expect(screen.getByLabelText("Total Revenue (€)")).toHaveAttribute("readonly");
    expect(screen.getAllByText(/Partner Share \(25%\)/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Formula: Payin Margin Before Split = Payin Revenue/).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/Formula: Partner Share = Payin Margin Before Split/).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/Formula: Our Margin After Share = Payin Margin Before Split/).length
    ).toBeGreaterThanOrEqual(1);

    const shareInput = screen.getByLabelText("Partner Share (%) [0-50]");
    await user.click(shareInput);
    await user.clear(shareInput);
    await user.type(shareInput, "30");
    await user.tab();

    expect(screen.getAllByText(/Partner Share \(30%\)/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders zone 3 pricing configuration with formula breakdowns", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getByText("Zone 3: Pricing Configuration")).toBeInTheDocument();
    expect(screen.getByText("Payin EU Pricing")).toBeInTheDocument();
    expect(screen.getByText("Payin WW Pricing")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Settlement Included" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Payin EU model Blended" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Payin WW model IC++" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getAllByRole("checkbox", { name: "TRX Fee Enabled" })).toHaveLength(2);
    expect(screen.getAllByRole("checkbox", { name: "TRX Fee Enabled" })[0]).toBeChecked();
    expect(screen.getAllByRole("checkbox", { name: "TRX Fee Enabled" })[1]).toBeChecked();
    expect(screen.getByText(/Formula: MDR Revenue = EU Volume/)).toBeInTheDocument();
    expect(screen.getAllByText(/Formula: Total Revenue = MDR Revenue/).length).toBeGreaterThanOrEqual(
      2
    );
    expect(screen.getAllByText("€0").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByLabelText("Scheme Fees (%)")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Interchange (%)")).toBeInTheDocument();
    expect(screen.queryByText(/Scheme Cost Impact/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Revenue After Scheme/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Payin EU tiered rates" }));
    expect(screen.getByText(/Tier 1 \(€0-€5M\): Volume/)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Payout" }));
    expect(screen.getByText("Payout Pricing")).toBeInTheDocument();
    expect(screen.getByText(/Formula: MDR Revenue = Monthly Payout Volume/)).toBeInTheDocument();
    const payoutTrxFeeInput = screen.getByLabelText("TRX Fee (€)");
    const payoutMdrInputs = screen.getAllByLabelText("MDR (%)");
    const payoutMdrInput = payoutMdrInputs[payoutMdrInputs.length - 1];
    await user.clear(payoutMdrInput);
    await user.type(payoutMdrInput, "1");
    await user.tab();
    await user.clear(payoutTrxFeeInput);
    await user.type(payoutTrxFeeInput, "0.15");
    await user.tab();
    expect(screen.getByText("Minimum floors applied in payout calculations:")).toBeInTheDocument();
    expect(screen.getByText(/Single Rate: MDR 1% -> 1.3% \| TRX/)).toBeInTheDocument();
    expect(
      screen.getByText(/Minimum MDR floor applied: configured 1% -> used in calculation 1.3%/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Minimum TRX floor applied: configured .* -> used in calculation .*/)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Payout tiered rates" }));
    expect(screen.getByText(/Tier 1 \(€0-€1M\): Volume/)).toBeInTheDocument();
  });

  it("renders zone 4 controls and recalculates fee impacts", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getByText("Zone 4: Other Fees & Limits")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Settlement Fee" })).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Payout" }));
    expect(screen.getByText("Payout Minimum Fee (Per Transaction)")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Payout Minimum Fee (Per Transaction)" }));
    expect(screen.queryByText(/Payout Minimum Fee Applied/)).not.toBeInTheDocument();
    const payoutMinimumInput = screen.getByRole("textbox", {
      name: "Minimum Fee per Transaction (€)"
    });
    await user.clear(payoutMinimumInput);
    await user.type(payoutMinimumInput, "3.5");
    await user.tab();
    expect(screen.getAllByText(/Payout Minimum Fee Applied/).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("checkbox", { name: "3D Secure Fee" }));
    expect(screen.getAllByText("€500").length).toBeGreaterThanOrEqual(1);
    const threeDsRevenueInput = screen.getByRole("textbox", {
      name: "3DS Revenue per Successful TRX (€)"
    });
    await user.clear(threeDsRevenueInput);
    await user.type(threeDsRevenueInput, "0.06");
    await user.tab();
    expect(screen.getByText(/Formula: 3DS Revenue = Successful Payin Transactions/)).toBeInTheDocument();
    expect(screen.getAllByText("€600").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("checkbox", { name: "Failed TRX Charging" }));
    await user.click(screen.getByRole("button", { name: "Failed TRX all failed volume" }));
    expect(screen.getAllByText("€875").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("checkbox", { name: "Settlement Included" }));
    expect(
      screen.getByText("Settlement Fee block is hidden because `Settlement Included` is ON in Zone 3.")
    ).toBeInTheDocument();
  });

  it("renders zone 5 profitability and recalculates totals", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getByText("Zone 5: Profitability Calculations")).toBeInTheDocument();
    expect(screen.getAllByText("TOTAL PROFITABILITY").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Payin Revenue & Costs").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: "Other Revenue" })).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "3D Secure Fee" }));
    expect(screen.getAllByText("€500").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: "Commission model: Rev Share" }));
    expect(screen.getAllByText(/Formula: Margin Before Split = Total Revenue/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Partner Share \(25%\)/).length).toBeGreaterThanOrEqual(1);
  });

  it("supports unified profitability controls (expand/collapse + show formulas)", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getByRole("heading", { name: "Profitability Calculations" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand all unified profitability rows" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse all unified profitability rows" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Show Formulas" })).toBeChecked();

    expect(screen.getByText(/Formula \(Unified\): Our Margin =/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Show Formulas" }));
    expect(screen.queryByText(/Formula \(Unified\): Our Margin =/)).not.toBeInTheDocument();

    expect(await screen.findByText("TRX Revenue CC (EU)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collapse all unified profitability rows" }));
    expect(screen.queryByText("TRX Revenue CC (EU)")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand all unified profitability rows" }));
    expect(screen.getByText("TRX Revenue CC (EU)")).toBeInTheDocument();
  });

  it("renders zone 6 offer summary and updates preview", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getByText("Zone 6: Offer Summary")).toBeInTheDocument();
    const summaryPreview = screen.getByLabelText("Offer Summary Preview");
    expect((summaryPreview as HTMLTextAreaElement).value).toContain(
      "BSG CALCULATOR - OFFER SUMMARY"
    );
    expect((summaryPreview as HTMLTextAreaElement).value).toContain("PAYIN:");
    expect((summaryPreview as HTMLTextAreaElement).value).not.toContain("PAYOUT:");

    const notesField = screen.getByLabelText("Client Notes");
    await user.type(notesField, "High-risk vertical review required.");
    expect((summaryPreview as HTMLTextAreaElement).value).toContain(
      "CLIENT NOTES: High-risk vertical review required."
    );

    await user.click(screen.getByRole("checkbox", { name: "Payout" }));
    expect((summaryPreview as HTMLTextAreaElement).value).toContain("PAYOUT:");

    await user.click(screen.getByRole("button", { name: "Commission model: Rev Share" }));
    expect((summaryPreview as HTMLTextAreaElement).value).toContain("Type: Rev Share");
  });

  it("does not show spec-ambiguity red markers after resolved decisions", () => {
    render(<App />);

    expect(screen.queryByText(/Питання по специфікації:/)).not.toBeInTheDocument();
  });

  it("shows formula traces in derived metrics blocks", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(
      screen.getByText(/Formula: Rounded Monthly Volume = roundUpToStep\(max\(0, Input Monthly Payin/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Formula: Total Attempts = ceil\(Successful Payin Transactions/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Formula: Failed Transactions = Total Attempts/)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Payout" }));

    expect(
      screen.getByText(
        /Formula: Rounded Monthly Volume = roundUpToStep\(max\(0, Input Monthly Payout/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Formula: Average Transaction = Rounded Monthly Payout Volume/)
    ).toBeInTheDocument();
  });

  it("adds end-of-zone navigation controls from zone 1 onward", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getAllByRole("button", { name: /Back to start/ })).toHaveLength(6);
    expect(
      screen.getByRole("button", {
        name: "Back to previous zone from Zone 1A: Payin Traffic Input: Zone 0: Calculator Type"
      })
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Collapse Zone 2: Introducer Commission" })
    );
    expect(
      screen.queryByRole("button", { name: "Commission model: Standard" })
    ).not.toBeInTheDocument();

    const zone2ScrollIntoView = vi.fn();
    Object.defineProperty(document.getElementById("zone2"), "scrollIntoView", {
      configurable: true,
      value: zone2ScrollIntoView
    });

    await user.click(
      screen.getByRole("button", {
        name: "Back to previous zone from Zone 3: Pricing Configuration: Zone 2: Introducer Commission"
      })
    );

    expect(screen.getByRole("button", { name: "Commission model: Standard" })).toBeInTheDocument();
    expect(zone2ScrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });

    const zone0ScrollIntoView = vi.fn();
    Object.defineProperty(document.getElementById("zone0"), "scrollIntoView", {
      configurable: true,
      value: zone0ScrollIntoView
    });

    await user.click(
      screen.getByRole("button", {
        name: "Back to start from Zone 3: Pricing Configuration"
      })
    );

    expect(zone0ScrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("allows collapsing and expanding zones for compact view", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Collapse Zone 0: Calculator Type" }));
    expect(screen.queryByRole("checkbox", { name: "Payin" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Zone 0: Calculator Type" }));
    expect(screen.getByRole("checkbox", { name: "Payin" })).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Collapse Zone 1A: Payin Traffic Input" })
    );
    expect(screen.queryByLabelText("EU Split (%)")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Expand Zone 1A: Payin Traffic Input" })
    );
    expect(screen.getByLabelText("EU Split (%)")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Payout" }));
    await user.click(
      screen.getByRole("button", { name: "Collapse Zone 1B: Payout Traffic Input" })
    );
    expect(screen.queryByLabelText("Monthly Payout Volume (€)")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Expand Zone 1B: Payout Traffic Input" })
    );
    expect(screen.getByLabelText("Monthly Payout Volume (€)")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Collapse Zone 2: Introducer Commission" })
    );
    expect(
      screen.queryByRole("button", { name: "Commission model: Standard" })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Expand Zone 2: Introducer Commission" })
    );
    expect(screen.getByRole("button", { name: "Commission model: Standard" })).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Collapse Zone 3: Pricing Configuration" })
    );
    expect(screen.queryByText("Payin EU Pricing")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Expand Zone 3: Pricing Configuration" })
    );
    expect(screen.getByText("Payin EU Pricing")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Collapse Zone 4: Other Fees & Limits" })
    );
    expect(screen.queryByText("Revenue-Affecting Fees")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Expand Zone 4: Other Fees & Limits" })
    );
    expect(screen.getByText("Revenue-Affecting Fees")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Collapse Zone 5: Profitability Calculations" })
    );
    expect(screen.queryByText("TOTAL PROFITABILITY")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Expand Zone 5: Profitability Calculations" })
    );
    expect(screen.getAllByText("TOTAL PROFITABILITY").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: "Collapse Zone 6: Offer Summary" }));
    expect(screen.queryByLabelText("Offer Summary Preview")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Zone 6: Offer Summary" }));
    expect(screen.getByLabelText("Offer Summary Preview")).toBeInTheDocument();
  });
});
