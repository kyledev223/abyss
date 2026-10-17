import type { Metadata } from "next";
import { Leaderboard } from "@/components/registry";

export const metadata: Metadata = { title: "Leaderboard", description: "Harbors ranked by docked Depth Rating." };

export default function LeaderboardPage() {
  return <Leaderboard />;
}
