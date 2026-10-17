import type { Metadata } from "next";
import { Ledger } from "@/components/registry";

export const metadata: Metadata = { title: "Ledger", description: "Every mint, fee, claim and upgrade, straight from the chain." };

export default function LedgerPage() {
  return <Ledger />;
}
