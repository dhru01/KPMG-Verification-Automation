#!/usr/bin/env python3
"""Optional local document processor for scanned evidence.

Excel workbooks and text-based PDFs are parsed by the Next.js application
without this service. Start it when scanned images or image-only PDFs need OCR,
or when you want pandas/openpyxl extraction instead.

    python3 -m pip install -r services/document-processor/requirements.txt
    python3 services/document-processor/app.py
"""

from __future__ import annotations

import base64
import io
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def extract_excel(payload: bytes) -> dict:
    try:
        import pandas as pd
    except ImportError:
        return {"ok": False, "error": "Install pandas and openpyxl to parse Excel in Python."}
    frame = pd.read_excel(io.BytesIO(payload), sheet_name=None, dtype=str)
    pages = []
    for name, sheet in frame.items():
        sheet = sheet.fillna("")
        text = f"{name}\n" + sheet.to_csv(index=False)
        pages.append({"page": len(pages) + 1, "text": text})
    return {"ok": True, "kind": "excel", "pages": pages, "note": "Extracted with pandas."}


def extract_pdf(payload: bytes) -> dict:
    try:
        from pypdf import PdfReader
    except ImportError:
        return {"ok": False, "error": "Install pypdf to extract PDF text in Python."}
    reader = PdfReader(io.BytesIO(payload))
    pages = [{"page": index + 1, "text": page.extract_text() or ""} for index, page in enumerate(reader.pages)]
    return {"ok": True, "kind": "pdf", "pages": pages, "note": "Extracted embedded PDF text with pypdf."}


def extract_image(payload: bytes) -> dict:
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        return {
            "ok": False,
            "error": "OCR is not configured. Install pillow and pytesseract, and install the Tesseract binary locally.",
        }
    text = pytesseract.image_to_string(Image.open(io.BytesIO(payload)))
    return {
        "ok": True,
        "kind": "image",
        "pages": [{"page": 1, "text": text}],
        "note": "OCR completed locally with Tesseract. Review the text before relying on it.",
    }


def extract(filename: str, payload: bytes) -> dict:
    lower = filename.lower()
    if lower.endswith((".xlsx", ".xls", ".csv")):
        if lower.endswith(".csv"):
            return {"ok": True, "kind": "csv", "pages": [{"page": 1, "text": payload.decode("utf-8", errors="replace")}], "note": "CSV read locally."}
        return extract_excel(payload)
    if lower.endswith(".pdf"):
        return extract_pdf(payload)
    if lower.endswith((".png", ".jpg", ".jpeg")):
        return extract_image(payload)
    return {"ok": False, "error": "Unsupported file type."}


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: dict) -> None:
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._send(200, {"ok": True, "service": "ghg-document-processor"})
            return
        self._send(404, {"ok": False, "error": "Not found."})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/extract":
            self._send(404, {"ok": False, "error": "Not found."})
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length > 20 * 1024 * 1024:
            self._send(413, {"ok": False, "error": "File is larger than 20 MB."})
            return
        try:
            message = json.loads(self.rfile.read(length).decode("utf-8"))
            payload = base64.b64decode(message["contentBase64"])
            result = extract(str(message.get("filename") or "upload"), payload)
            self._send(200 if result.get("ok") else 422, result)
        except Exception as error:  # noqa: BLE001
            self._send(500, {"ok": False, "error": f"The document could not be processed: {error}"})

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        print(f"[document-processor] {self.address_string()} {format % args}")


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8765), Handler)
    print("Document processor listening on http://127.0.0.1:8765")
    server.serve_forever()
