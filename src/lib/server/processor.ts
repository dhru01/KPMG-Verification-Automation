export interface ProcessorPage {
  page: number;
  text: string;
}

export async function extractPdfPages(bytes: Buffer): Promise<ProcessorPage[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const extracted = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
  return pages.map((text, index) => ({ page: index + 1, text: text ?? "" }));
}

export async function extractWithLocalProcessor(
  filename: string,
  bytes: Buffer,
): Promise<{ pages: ProcessorPage[]; note: string | null } | null> {
  const base = process.env.DOCUMENT_PROCESSOR_URL ?? "http://127.0.0.1:8765";
  try {
    const response = await fetch(`${base}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, contentBase64: bytes.toString("base64") }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      ok?: boolean;
      pages?: { page?: number; text?: string }[];
      note?: string;
    };
    if (!body.ok) return null;
    return {
      pages: (body.pages ?? []).map((page, index) => ({
        page: page.page ?? index + 1,
        text: page.text ?? "",
      })),
      note: body.note ?? null,
    };
  } catch {
    return null;
  }
}

export async function processorHealth(): Promise<{ available: boolean; detail: string }> {
  const base = process.env.DOCUMENT_PROCESSOR_URL ?? "http://127.0.0.1:8765";
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) {
      return { available: false, detail: "The Python document processor did not respond. Excel and text PDFs still use the built-in parser. Scanned images need the local processor for OCR." };
    }
    return { available: true, detail: "Python document processor is available for OCR and alternate Excel parsing." };
  } catch {
    return {
      available: false,
      detail: "Python document processor is not running. Excel and text-based PDFs use the built-in parser. Start the processor to OCR scanned images.",
    };
  }
}
