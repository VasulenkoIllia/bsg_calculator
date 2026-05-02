import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "./renderApp.js";

describe("App core flow", () => {
  it("hides hardcoded constants by default and toggles them from top control", async () => {
    const { user } = renderApp();

    expect(
      screen.queryByRole("heading", { name: "Hardcoded Calculation Constants" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Formula Breakdown")).not.toBeInTheDocument();
    expect(screen.queryByText("Formula Breakdown (EU)")).not.toBeInTheDocument();
    expect(screen.queryByText("Formula Breakdown (Zone 4)")).not.toBeInTheDocument();
    const showButton = screen.getByRole("button", { name: "Show constants & formulas" });
    expect(showButton).toBeInTheDocument();

    await user.click(showButton);
    expect(
      screen.getByRole("heading", { name: "Hardcoded Calculation Constants" })
    ).toBeInTheDocument();
    expect(screen.getByText("Provider Payin Costs (Zone 5)")).toBeInTheDocument();
    expect(screen.getByText("Provider TRX CC cost")).toBeInTheDocument();
    expect(screen.getByText("€0.22")).toBeInTheDocument();
    expect(screen.getByText("Formula Breakdown")).toBeInTheDocument();
    expect(screen.getByText("Formula Breakdown (EU)")).toBeInTheDocument();
    expect(screen.getByText("Formula Breakdown (Zone 4)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide constants & formulas" }));
    expect(
      screen.queryByRole("heading", { name: "Hardcoded Calculation Constants" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Formula Breakdown")).not.toBeInTheDocument();
    expect(screen.queryByText("Formula Breakdown (EU)")).not.toBeInTheDocument();
    expect(screen.queryByText("Formula Breakdown (Zone 4)")).not.toBeInTheDocument();
  });

  it("shows auto average transaction fields in input blocks as readonly", async () => {
    const { user } = renderApp();

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
    const { user } = renderApp();

    const payinVolumeInput = screen.getByLabelText("Monthly Payin Volume (€)");
    expect(payinVolumeInput).toHaveValue("1,000,000");

    await user.click(payinVolumeInput);
    await user.clear(payinVolumeInput);
    await user.type(payinVolumeInput, "1234567.89");
    await user.tab();

    expect(payinVolumeInput).toHaveValue("1,234,567.89");
  });

  it("normalizes decimal comma input across numeric fields", async () => {
    const { user } = renderApp();

    const payinVolumeInput = screen.getByLabelText("Monthly Payin Volume (€)");
    await user.click(payinVolumeInput);
    await user.clear(payinVolumeInput);
    await user.type(payinVolumeInput, "1,000");
    await user.tab();
    expect(payinVolumeInput).toHaveValue("1,000");

    await user.click(screen.getByRole("button", { name: "Commission model: Custom" }));
    const tier1RateInput = screen.getByLabelText("Tier 1 Rate (%)");
    await user.click(tier1RateInput);
    await user.clear(tier1RateInput);
    await user.type(tier1RateInput, "0,65");
    await user.tab();
    expect(tier1RateInput).toHaveValue("0.65");

    await user.click(screen.getByRole("checkbox", { name: "Payout" }));
    await user.click(screen.getByRole("checkbox", { name: "Payout Minimum Fee (Per Transaction)" }));

    const payoutMinimumInput = screen.getByLabelText("Minimum Fee per Transaction (€)");
    await user.click(payoutMinimumInput);
    await user.clear(payoutMinimumInput);
    await user.type(payoutMinimumInput, "0,2");
    await user.tab();
    expect(payoutMinimumInput).toHaveValue("0.2");

    await user.click(screen.getByRole("checkbox", { name: "3D Secure Fee" }));
    const threeDsRevenueInput = screen.getByRole("textbox", {
      name: "3DS Revenue per Successful TRX (€)"
    });
    await user.click(threeDsRevenueInput);
    await user.clear(threeDsRevenueInput);
    await user.type(threeDsRevenueInput, "0,07");
    await user.tab();
    expect(threeDsRevenueInput).toHaveValue("0.07");
  });

  it("applies zone defaults and resets editable values from the top controls", async () => {
    const { user } = renderApp();

    expect(screen.getByRole("checkbox", { name: "Payin" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Payout" })).not.toBeChecked();
    expect(screen.getByLabelText("Monthly Payin Volume (€)")).toHaveValue("1,000,000");
    expect(screen.getByLabelText("Successful Payin Transactions")).toHaveValue("10,000");
    expect(screen.getByLabelText("Payin Approval Ratio (%)")).toHaveValue("80");
    expect(screen.getByLabelText("EU Split (%)")).toHaveValue("80");
    expect(screen.getByLabelText("WW Split (%)")).toHaveValue("20");
    expect(screen.getByLabelText("CC Split (%)")).toHaveValue("90");
    expect(screen.getByLabelText("APM Split (%)")).toHaveValue("10");
    expect(screen.getByRole("checkbox", { name: "Agent / Introducer" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Commission model: Standard" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await user.click(screen.getByRole("checkbox", { name: "Payout" }));
    expect(screen.getByLabelText("Monthly Payout Volume (€)")).toHaveValue("200,000");
    expect(screen.getByLabelText("Total Payout Transactions")).toHaveValue("2,000");
    expect(screen.getByLabelText("Minimum Fee per Transaction (€)")).toHaveValue("2.5");
    expect(screen.getByLabelText("Volume Threshold (M)")).toHaveValue("2.5");
    expect(screen.getByLabelText("Minimum Transaction Fee (€)")).toHaveValue("1");

    await user.click(screen.getByRole("button", { name: "Reset all to 0" }));

    expect(screen.getByRole("checkbox", { name: "Payin" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Payout" })).not.toBeChecked();
    expect(screen.getByLabelText("Monthly Payin Volume (€)")).toHaveValue("0");
    expect(screen.getByLabelText("Successful Payin Transactions")).toHaveValue("0");
    expect(screen.getByLabelText("Payin Approval Ratio (%)")).toHaveValue("0");
    expect(screen.getByLabelText("EU Split (%)")).toHaveValue("0");
    expect(screen.getByLabelText("CC Split (%)")).toHaveValue("0");
    expect(screen.getByRole("checkbox", { name: "Agent / Introducer" })).not.toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: "Payout" }));
    expect(screen.getByLabelText("Monthly Payout Volume (€)")).toHaveValue("0");
    expect(screen.getByLabelText("Total Payout Transactions")).toHaveValue("0");
    expect(screen.getByLabelText("Minimum Fee per Transaction (€)")).toHaveValue("0");
    expect(screen.getByLabelText("Volume Threshold (M)")).toHaveValue("0");
    expect(screen.getByLabelText("Minimum Transaction Fee (€)")).toHaveValue("0");

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
    expect(screen.getByRole("checkbox", { name: "Agent / Introducer" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Commission model: Standard" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await user.click(screen.getByRole("checkbox", { name: "Payout" }));
    expect(screen.getByLabelText("Monthly Payout Volume (€)")).toHaveValue("200,000");
    expect(screen.getByLabelText("Total Payout Transactions")).toHaveValue("2,000");
    expect(screen.getByLabelText("Minimum Fee per Transaction (€)")).toHaveValue("2.5");
    expect(screen.getByLabelText("Volume Threshold (M)")).toHaveValue("2.5");
    expect(screen.getByLabelText("Minimum Transaction Fee (€)")).toHaveValue("1");
  });

  it("shows split formulas under each split input and recalculates on split changes", async () => {
    const { user } = renderApp();

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

  it("does not show spec-ambiguity red markers after resolved decisions", () => {
    renderApp();
    expect(screen.queryByText(/Питання по специфікації:/)).not.toBeInTheDocument();
  });

  it("does not render derived metrics sections", async () => {
    const { user } = renderApp();

    expect(screen.queryByText("Derived Metrics: Payin")).not.toBeInTheDocument();
    expect(screen.queryByText("Calculation Details")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Payout" }));

    expect(screen.queryByText("Derived Metrics: Payout")).not.toBeInTheDocument();
    expect(screen.queryByText("Calculation Details")).not.toBeInTheDocument();
  });

  it("adds end-of-zone navigation controls from zone 1 onward", async () => {
    const { user } = renderApp();

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
    const { user } = renderApp();

    await user.click(screen.getByRole("button", { name: "Collapse Zone 0: Calculator Type" }));
    expect(screen.queryByRole("checkbox", { name: "Payin" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Zone 0: Calculator Type" }));
    expect(screen.getByRole("checkbox", { name: "Payin" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse Zone 1A: Payin Traffic Input" }));
    expect(screen.queryByLabelText("EU Split (%)")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Zone 1A: Payin Traffic Input" }));
    expect(screen.getByLabelText("EU Split (%)")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Payout" }));
    await user.click(screen.getByRole("button", { name: "Collapse Zone 1B: Payout Traffic Input" }));
    expect(screen.queryByLabelText("Monthly Payout Volume (€)")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Zone 1B: Payout Traffic Input" }));
    expect(screen.getByLabelText("Monthly Payout Volume (€)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse Zone 2: Introducer Commission" }));
    expect(screen.queryByRole("button", { name: "Commission model: Standard" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Zone 2: Introducer Commission" }));
    expect(screen.getByRole("button", { name: "Commission model: Standard" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse Zone 3: Pricing Configuration" }));
    expect(screen.queryByText("Payin EU Pricing")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Zone 3: Pricing Configuration" }));
    expect(screen.getByText("Payin EU Pricing")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse Zone 4: Other Fees & Limits" }));
    expect(screen.queryByText("Revenue-Affecting Fees")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Zone 4: Other Fees & Limits" }));
    expect(screen.getByText("Revenue-Affecting Fees")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse Zone 5: Profitability Calculations" }));
    expect(screen.queryByText("TOTAL PROFITABILITY")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Zone 5: Profitability Calculations" }));
    expect(screen.getAllByText("TOTAL PROFITABILITY").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: "Collapse Zone 6: Offer Summary" }));
    expect(screen.queryByLabelText("Offer Summary Preview")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Zone 6: Offer Summary" }));
    expect(screen.getByLabelText("Offer Summary Preview")).toBeInTheDocument();
  });
});
