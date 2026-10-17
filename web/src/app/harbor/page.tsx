import type { Metadata } from "next";
import { Harbor } from "@/components/harbor";

export const metadata: Metadata = {
  title: "Harbor",
  description: "Your fleet: claim earnings, dock and undock subs, reinforce, merge and send expeditions.",
};

export default function HarborPage() {
  return <Harbor />;
}
