import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";

function workbookBuffer(sheets: Record<string, string[][]>): Buffer {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function buildCollectionTemplateWorkbook(): Buffer {
  return workbookBuffer({
    Instructions: [["This tab is ignored by the importer."]],
    Facilities: [
      ["Facility", "Quantity", "Quantity unit"],
      ["MTN Ayoba a", "", ""],
      ["MTN Bayoba", "", ""],
    ],
    "Stationary combustion": [
      ["Facility", "Quantity", "Quantity unit"],
      ["Boiler house", "1200", "L"],
    ],
    "Mobile combustion": [
      ["Facility", "Quantity", "Quantity unit"],
      ["Fleet depot", "340", "L"],
    ],
    "Fugitive emissions": [
      ["Facility", "Quantity", "Quantity unit"],
      ["Cold store A", "4.5", "kg"],
    ],
    "Fugitive emissions 2": [
      ["Facility", "Quantity", "Quantity unit"],
      ["Cold store B", "2.1", "kg"],
    ],
    "Electricity(Grid)": [
      ["Facility", "Quantity", "Quantity unit"],
      ["Data centre", "7850", "kWh"],
    ],
    "Electricity(IPP)": [
      ["Facility", "Quantity", "Quantity unit"],
      ["Warehouse", "4200", "kWh"],
    ],
    "Onsite Renewable": [
      ["Facility", "Quantity", "Quantity unit"],
      ["Solar array", "900", "kWh"],
    ],
  });
}

export function buildDemonstrationTemplate(): Buffer {
  return workbookBuffer({
    "Mobile Combustion": [
      ["Facility", "Fuel Type", "Consumption", "Unit"],
      ["Head Office", "Diesel", "400", "L"],
    ],
    "Stationary Combustion": [
      ["Facility", "Fuel Type", "Consumption", "Unit"],
      ["Facility B", "Diesel", "600", "L"],
      ["Depot North", "Petrol", "120", "L"],
    ],
    "Fugitive Emissions": [
      ["Facility", "Fuel Type", "Consumption", "Unit"],
      ["Cold Store", "R-410A", "4.5", "kg"],
    ],
    "Electricity(Grid)": [
      ["Facility", "Fuel Type", "Consumption", "Unit"],
      ["Data Centre A", "Electricity", "8000", "kWh"],
    ],
  });
}

export function buildDemonstrationEvidenceWorkbook(): Buffer {
  return workbookBuffer({
    Evidence: [
      ["Facility", "Fuel Type", "Quantity", "Unit", "Invoice Number", "Invoice Date", "Reporting Period", "Supplier"],
      ["Head Office", "Diesel", "400", "L", "INV-1001", "2026-09-18", "September 2026", "Example Fuels"],
      ["Depot North", "Petrol", "0.12", "kL", "INV-1188", "2026-09-12", "September 2026", "Example Fuels"],
      ["Cold Store", "R-410A", "4.5", "kg", "INV-3001", "2026-08-02", "August 2026", "Example HVAC"],
    ],
  });
}

export function buildDemonstrationInvoicePdf(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.font("Helvetica-Bold").fontSize(16).text("Tax invoice");
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(11);
    doc.text("This is demonstration evidence for the GHG Verification Hub pilot. It is not a client invoice.");
    doc.moveDown();
    doc.text("Invoice number: INV-2044");
    doc.text("Invoice date: 18 September 2026");
    doc.text("Supplier: Example Utility");
    doc.moveDown();
    doc.text("Facility: Data Centre A");
    doc.text("Reporting period: September 2026");
    doc.text("Description: Purchased electricity");
    doc.text("Consumption: 7850 kWh");
    doc.text("Meter reading: 44120");
    doc.end();
  });
}
