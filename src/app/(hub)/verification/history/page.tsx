import type { Metadata } from "next";
import { HistoryView } from "@/components/verification/history-view";

export const metadata: Metadata = { title: "Live verification" };

export default function HistoryPage() {
  return <HistoryView />;
}
