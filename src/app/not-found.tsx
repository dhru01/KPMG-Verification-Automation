import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f4f6f8] px-4 text-center">
      <h1 className="text-2xl font-semibold text-[#0c2340]">Page not found</h1>
      <p className="text-sm text-slate-600">That verification page is not part of this workspace.</p>
      <Link className="text-sm font-medium text-[#1d4e89]" href="/">Back to the dashboard</Link>
    </main>
  );
}
