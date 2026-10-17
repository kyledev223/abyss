"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";

// The wallet button reads window; render it on the client only.
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

const NAV = [
  { href: "/shipyard", label: "Shipyard" },
  { href: "/harbor", label: "Harbor" },
  { href: "/fleet", label: "Fleet" },
  { href: "/ledger", label: "Ledger" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/docs", label: "How it works" },
];

export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="border-b border-kelp/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4">
        <Link href="/" className="font-stencil text-2xl font-extrabold tracking-wide text-foam no-underline">
          Abyss Haul
        </Link>
        <nav aria-label="Main" className="order-3 flex w-full gap-5 overflow-x-auto text-[0.95rem] md:order-none md:w-auto">
          {NAV.map((n) => {
            const active = path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap no-underline ${active ? "text-plankton" : "text-silt hover:text-foam"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
