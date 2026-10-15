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

**Vercel (shared pilot link)** — serverless functions have no durable disk. Everyone with the deployment URL shares **one** workspace. Use either:

**Option A — Supabase (recommended if you already use Supabase)**

1. In Supabase → **SQL**, run `supabase/migrations/002_workspace_snapshot.sql` (creates `workspace_snapshots` and the `ghg-hub-uploads` storage bucket).
2. In Vercel → **Settings → Environment Variables**, set:
   - `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser; optional for this pilot)
   - `SUPABASE_SERVICE_ROLE_KEY` (server only — never expose as `NEXT_PUBLIC_`)
3. Redeploy the Vercel project.

**Option B — Vercel KV + Blob**

1. **Redis** — Vercel → **Storage** → **Marketplace** → **Upstash Redis** (`KV_REST_API_URL`, `KV_REST_API_TOKEN`).
2. **Blob** — **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`).
3. Redeploy.

Without Option A or B, the dashboard will show a storage configuration error on Vercel.

`supabase/migrations/001_initial_schema.sql` is a future normalized schema; the live pilot uses the single-document `workspace_snapshots` table from `002`.

## Adding another operating company

Register an OPCO configuration and a methodology under `verification-engine/methodologies/`, then add it to `verification-engine/methodologies/registry.ts`. Excel column aliases live in `src/lib/excel/parse.ts`. The screens do not contain Ayoba-specific comparison logic.

The pilot enables direct comparison only. Sum-of-records and calculated-consumption rules exist in the engine and stay disabled until a methodology explicitly turns one of them on.
