type Dimension = "energy" | "volume" | "mass";

interface UnitDefinition {
  dimension: Dimension;
  /** Multiplier to convert this unit into the dimension base unit. */
  toBase: number;
}

const UNITS: Record<string, UnitDefinition> = {
  wh: { dimension: "energy", toBase: 1 },
  kwh: { dimension: "energy", toBase: 1_000 },
  mwh: { dimension: "energy", toBase: 1_000_000 },
  gwh: { dimension: "energy", toBase: 1_000_000_000 },
  ml: { dimension: "volume", toBase: 0.001 },
  l: { dimension: "volume", toBase: 1 },
  kl: { dimension: "volume", toBase: 1_000 },
  m3: { dimension: "volume", toBase: 1_000 },
  g: { dimension: "mass", toBase: 1 },
  kg: { dimension: "mass", toBase: 1_000 },
  t: { dimension: "mass", toBase: 1_000_000 },
};

const ALIASES: Record<string, string> = {
  wh: "wh",
  watt: "wh",
  watthour: "wh",
  watthours: "wh",
  kwh: "kwh",
  kilowatthour: "kwh",
  kilowatthours: "kwh",
  mwh: "mwh",
  megawatthour: "mwh",
  megawatthours: "mwh",
  gwh: "gwh",
  gigawatthour: "gwh",
  gigawatthours: "gwh",
  ml: "ml",
  millilitre: "ml",
  millilitres: "ml",
  milliliter: "ml",
  milliliters: "ml",
  l: "l",
  lt: "l",
  ltr: "l",
  litre: "l",
  litres: "l",
  liter: "l",
  liters: "l",
  kl: "kl",
  kilolitre: "kl",
  kilolitres: "kl",
  kiloliter: "kl",
  kiloliters: "kl",
  m3: "m3",
  cubicmetre: "m3",
  cubicmetres: "m3",
  cubicmeter: "m3",
  cubicmeters: "m3",
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  t: "t",
  tonne: "t",
  tonnes: "t",
};

export type UnitConversionResult =
  | { ok: true; value: number; fromUnit: string; toUnit: string; converted: boolean }
  | { ok: false; reason: string };

export function canonicalUnit(input: string): string | null {
  const compact = input
    .trim()
    .toLowerCase()
    .replace(/³/g, "3")
    .replace(/[^a-z0-9]+/g, "");
  if (!compact) return null;
  return ALIASES[compact] ?? null;
}

/**
 * Converts a quantity between compatible units.
 * Mass is never converted to volume, because that requires a density assumption.
 */
export function convertUnit(value: number, from: string, to: string): UnitConversionResult {
  const fromUnit = canonicalUnit(from);
  const toUnit = canonicalUnit(to);
  if (!fromUnit || !toUnit) {
    return {
      ok: false,
      reason: `The unit "${!fromUnit ? from : to}" is not recognised, so no conversion was applied.`,
    };
  }

  const fromDef = UNITS[fromUnit];
  const toDef = UNITS[toUnit];
  if (fromDef.dimension !== toDef.dimension) {
    return {
      ok: false,
      reason: `${from} (${fromDef.dimension}) cannot be converted to ${to} (${toDef.dimension}). Mass is not converted to volume without an explicit density assumption.`,
    };
  }

  if (fromUnit === toUnit) {
    return { ok: true, value, fromUnit: from, toUnit: to, converted: false };
  }

  const converted = (value * fromDef.toBase) / toDef.toBase;
  return { ok: true, value: converted, fromUnit: from, toUnit: to, converted: true };
}
