import type { Metadata } from "next";
import { OpcoView } from "@/components/opcos/opco-view";

export const metadata: Metadata = { title: "OPCO selection" };

export default function OpcosPage() {
  return <OpcoView />;
}
