import type { Metadata } from "next";
import { Shipyard } from "@/components/shipyard";

export const metadata: Metadata = {
  title: "Shipyard",
  description: "Mint a submarine. See every tier's odds and Depth Rating, and exactly what a mint costs.",
};

export default function ShipyardPage() {
  return <Shipyard />;
}
