import type { NextRequest } from "next/server";
import { buildDemonstrationInvoicePdf } from "@/lib/samples";
import { handleError, requireUser } from "@/lib/server/http";

export async function GET(request: NextRequest) {
  try {
    requireUser(request);
    const bytes = await buildDemonstrationInvoicePdf();
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"Ayoba-demonstration-electricity-invoice.pdf\"",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
