import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./renderApp.js";

describe("Zone 3 and Zone 4", () => {
  it("renders zone 3 pricing configuration with formula breakdowns", async () => {
    const { user } = renderApp();

    await user.click(screen.getByRole("button", { name: "Show constants & formulas" }));

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
    expect(screen.queryByLabelText("Interchange (%)")).not.toBeInTheDocument();
    expect(screen.queryByText(/Scheme Cost Impact/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Revenue After Scheme/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide constants & formulas" }));
    expect(screen.queryByText(/Formula: MDR Revenue = EU Volume/)).not.toBeInTheDocument();
    expect(screen.queryByText("Formula Breakdown (EU)")).not.toBeInTheDocument();
    expect(screen.queryByText("Provider Payin Costs (Zone 5)")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show constants & formulas" }));
    expect(screen.getByText(/Formula: MDR Revenue = EU Volume/)).toBeInTheDocument();
    expect(screen.getByText("Formula Breakdown (EU)")).toBeInTheDocument();
    expect(screen.getByText("Provider Payin Costs (Zone 5)")).toBeInTheDocument();

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
    expect(screen.getByText("Configured 1% -> Applied 1.3% (minimum floor).")).toHaveClass(
      "bg-amber-50"
    );
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
    const { user } = renderApp();

    await user.click(screen.getByRole("button", { name: "Show constants & formulas" }));

    expect(screen.getByText("Zone 4: Other Fees & Limits")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Settlement Fee" })).toBeInTheDocument();
    expect(screen.getByText("Payin Minimum Fee")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Payout" }));
    expect(screen.getByText("Payout Minimum Fee (Per Transaction)")).toBeInTheDocument();
    expect(screen.getByText(/Does not affect Zone 5 profitability/)).toBeInTheDocument();
    expect(screen.getByLabelText("Volume Threshold (M)")).toHaveValue("2.5");
    expect(screen.getByLabelText("Minimum Transaction Fee (€)")).toHaveValue("1");
    expect(screen.getByText(/Contract preview: ≤€2.5M: €1 \/ >€2.5M: N\/A/)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Payout Minimum Fee (Per Transaction)" }));
    expect(screen.getByText("Rounding rule: always round up to the next €0.10.")).toHaveClass(
      "bg-amber-50"
    );
    const payoutMinimumInput = screen.getByLabelText("Minimum Fee per Transaction (€)");
    await user.clear(payoutMinimumInput);
    await user.type(payoutMinimumInput, "3.5");
    await user.tab();
    expect(screen.getAllByText(/Payout Minimum Fee Applied/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Payout Minimum Fee Uplift")).toBeInTheDocument();
    expect(screen.getByText(/Formula: Payout Revenue After Min Fee = max/)).toBeInTheDocument();
    expect(screen.getByText(/Formula: Payout Minimum Per-TRX Revenue =/)).toBeInTheDocument();
    expect(screen.getByText(/Payout Fees ALL \(€7,000\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide constants & formulas" }));
    expect(screen.queryByText(/Formula: Payout Minimum Per-TRX Revenue =/)).not.toBeInTheDocument();
    expect(screen.queryByText("Formula Breakdown (Zone 4)")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show constants & formulas" }));
    expect(screen.getByText(/Formula: Payout Minimum Per-TRX Revenue =/)).toBeInTheDocument();
    expect(screen.getByText("Formula Breakdown (Zone 4)")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "By region (EU / WW)" }));
    expect(screen.getByLabelText("EU Volume Threshold (M)")).toHaveValue("2.5");
    expect(screen.getByLabelText("EU Minimum Transaction Fee (€)")).toHaveValue("1");
    expect(screen.getByLabelText("WW Volume Threshold (M)")).toHaveValue("2.5");
    expect(screen.getByLabelText("WW Minimum Transaction Fee (€)")).toHaveValue("1");

    expect(screen.getByRole("button", { name: "Settlement period T+4" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Settlement period T+7" })).not.toBeInTheDocument();
    expect(screen.getByText("Minimum provider cost is €10. Do not set below €10.")).toHaveClass(
      "bg-amber-50"
    );
    expect(screen.getByText("Minimum provider cost is €50. Do not set below €50.")).toHaveClass(
      "bg-amber-50"
    );

    const rollingReserveHoldInput = screen.getByLabelText("Rolling Reserve Hold (days)");
    await user.clear(rollingReserveHoldInput);
    await user.type(rollingReserveHoldInput, "10");
    await user.tab();
    expect(rollingReserveHoldInput).toHaveValue("30");
    expect(
      screen.getByText("Minimum allowed value is 30. Lower values reset to 30.")
    ).toHaveClass("bg-amber-50");

    expect(screen.getByText(/3DS Revenue \(EU €0 \+ WW €0\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "3D Secure Fee" }));
    expect(screen.getByText(/3DS Revenue \(EU €400 \+ WW €100\)/)).toBeInTheDocument();
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
});
