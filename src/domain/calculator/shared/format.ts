const integerFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const twoDecimalsFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const variableAmountFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

export function formatAmountInteger(value: number): string {
  return `€${integerFormatter.format(value)}`;
}

export function formatAmount2(value: number): string {
  return `€${integerFormatter.format(Math.trunc(value))}`;
}

export function formatVariableAmount(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `€${variableAmountFormatter.format(safeValue)}`;
}

export function formatPercent2(value: number): string {
  return `${twoDecimalsFormatter.format(value)}%`;
}
