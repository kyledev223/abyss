import type { Metadata } from "next";
import { FleetRegistry } from "@/components/registry";

export const metadata: Metadata = { title: "Fleet", description: "Every submarine in the Abyss Haul fleet." };

export default function FleetPage() {
  return <FleetRegistry />;
}
