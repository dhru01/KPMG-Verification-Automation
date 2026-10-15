# GHG Verification Hub

Internal workspace for reviewing monthly Scope 1 and Scope 2 activity data. Ayoba is the only active operating company in this pilot.

The direct-comparison rule is a **demonstration**. It is not an approved Ayoba verification methodology, and exported reports are working papers. They are not an audit opinion, assurance conclusion, or formal verification certificate.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The workspace opens directly.

## Try the pilot workflow

1. On the dashboard, choose **Load demonstration run**, or start **New Verification** and download the demonstration template and evidence.
2. Review the extracted consumption records and evidence values.
3. Run the pilot verification.
4. Open a result to see the calculation, then accept, flag, or request more evidence.
5. Export the Excel workbook or PDF summary from Reports.

The demonstration pack is labelled as demonstration data. It is not an Ayoba submission.

## Tests

```bash
npm test
```

The tests cover difference calculations, the zero-evidence rule, unit conversion, the pilot statuses, and the demonstration Excel pipeline.

## Optional document processor

Excel and text-based PDFs are parsed inside the Next.js app. Scanned images are stored and flagged for review unless the local Python processor is running:

```bash
python3 -m pip install -r services/document-processor/requirements.txt
npm run processor
```

OCR also needs the Tesseract binary installed on the machine. The processor listens on `http://127.0.0.1:8765`. Uploaded files are not sent to a third-party AI or OCR service.

## Data storage

**Local development** — runs and audit events live in `data/store.json`. Uploads live in `data/uploads/`. Both are gitignored.

**Vercel (shared pilot link)** — serverless functions have no durable disk. Everyone with the deployment URL shares **one** workspace when you attach:

1. **Redis** — Vercel project → **Storage** → **Marketplace** → add **Upstash Redis** (or an existing Redis integration). This provides `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
2. **Blob** — add **Vercel Blob** to the same project for `BLOB_READ_WRITE_TOKEN`.

Redeploy after linking storage. Without Redis, **Continue** on New verification will fail on Vercel with a clear configuration message — that is expected.

Supabase is **not** required for this pilot. `supabase/migrations/001_initial_schema.sql` is a future normalized schema; the app does not read it yet. Do not put the Supabase service-role key in a `NEXT_PUBLIC_` variable.

## Adding another operating company

Register an OPCO configuration and a methodology under `verification-engine/methodologies/`, then add it to `verification-engine/methodologies/registry.ts`. Excel column aliases live in `src/lib/excel/parse.ts`. The screens do not contain Ayoba-specific comparison logic.

The pilot enables direct comparison only. Sum-of-records and calculated-consumption rules exist in the engine and stay disabled until a methodology explicitly turns one of them on.
