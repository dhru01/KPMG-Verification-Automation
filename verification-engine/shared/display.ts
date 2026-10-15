const QUANTITY_FORMAT = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 4,
});

export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10000) / 10000;
  return QUANTITY_FORMAT.format(rounded);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function quantityWithUnit(value: number, unit: string): string {
  return `${formatQuantity(value)} ${displayUnit(unit, value)}`;
}

export function displayUnit(unit: string, value: number): string {
  const compact = unit.trim().toLowerCase();
  if (compact === "l" || compact === "litre" || compact === "litres" || compact === "liter" || compact === "liters") {
    return Math.abs(value) === 1 ? "litre" : "litres";
  }
  return unit;
}
