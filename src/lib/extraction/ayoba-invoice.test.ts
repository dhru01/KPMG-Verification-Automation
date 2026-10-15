import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractAyobaInvoiceConsumption } from "./ayoba-invoice";

describe("Ayoba invoice Consumption extraction", () => {
  it("sums only the electricity Consumption column (not charge subtotals)", () => {
    const text = `
Electrical Tariff Detail & Meter Readings
Meter Serial Description Tariff Opening Closing Factor Billable Portion Consumption
NES2050000248 Energy Charge 120.00
ELON103977 Energy Charge 36.00
3514585002766 HVAC - 
LWCOME Common Area 260.00
Charges
Energy Total 156.00
Common Area Total 260.00
Total Cost (excl. VAT) 416.00 kWh
6241.59
Water Tariff Detail
`;
    const result = extractAyobaInvoiceConsumption(text);
    assert.equal(result.total, 416);
    assert.equal(result.lines.length, 4);
    assert.deepEqual(result.lines.map((line) => line.value), [120, 36, 0, 260]);
  });

  it("reconciles to the invoice kWh total when stray subtotals were parsed", () => {
    const text = `
Meter Serial Consumption
NES2050000248 120.00
ELON103977 36.00
LWCOME 260.00
Energy Total 156.00
Common Area Total 260.00
Total Cost 416.00 kWh
Water Tariff
`;
    const result = extractAyobaInvoiceConsumption(text);
    assert.equal(result.total, 416);
  });

  it("reads a single labelled Consumption value for legacy demonstration invoices", () => {
    const text = "Facility: Data Centre A\nReporting period: September 2026\nConsumption: 7850 kWh";
    const result = extractAyobaInvoiceConsumption(text);
    assert.equal(result.lines.length, 1);
    assert.equal(result.total, 7850);
  });

  it("reads Consumption values detached at the Livewire PDF footer", () => {
    const text = `
NES20500000248 Energy Charge COCT : SPU1 High Cons. 279.09 30.00 100.00%
Water Tariff Detail & Meter Readings
283.09 120.00
6,482.51 36.00
13,684.21 260.00
416.00 5,427.47
6,241.59
SAMPLE - MODIFIED VALUES
`;
    const result = extractAyobaInvoiceConsumption(text);
    assert.equal(result.total, 416);
    assert.deepEqual(result.lines.map((line) => line.value), [120, 36, 260]);
    assert.equal(result.sourceSection, "detached_column");
  });

  it("does not include water section consumption", () => {
    const text = `
Electrical Tariff
Meter Serial Consumption
M1 100.00
Total Cost 100.00 kWh
Water Tariff Detail
Meter Serial Consumption
15764097 0.806
220825138 0.012
Total Cost 0.818 kL
`;
    const result = extractAyobaInvoiceConsumption(text);
    assert.equal(result.total, 100);
    assert.equal(result.unit, "kWh");
  });
});
