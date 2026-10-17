import Link from "next/link";
import { Hero, PoolStats, RecentMints } from "@/components/landing-live";

/** Sections double as depth marks on the rule down the left edge (wide screens). */
const DEPTHS = [
  { id: "surface", depth: "0 m", label: "Surface" },
  { id: "pool", depth: "200 m", label: "The pool right now" },
  { id: "haul", depth: "1,000 m", label: "How a haul works" },
  { id: "catches", depth: "4,000 m", label: "Latest mints" },
];

export default function Home() {
  return (
    <div className="lg:grid lg:grid-cols-[9rem_1fr] lg:gap-10">
      <nav aria-label="On this page" className="hidden lg:block">
        <ol className="sticky top-10 mt-20 border-l border-kelp">
          {DEPTHS.map((d) => (
            <li key={d.id} className="relative pb-10 pl-4 last:pb-0">
              <span className="absolute top-2 -left-[5px] h-[9px] w-[9px] rounded-full border border-kelp bg-abyss" aria-hidden />
              <a href={`#${d.id}`} className="block no-underline hover:text-foam">
                <span className="font-display text-xl text-foam">{d.depth}</span>
                <span className="block text-sm text-silt">{d.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div>
        <Hero />

        <section id="pool" aria-labelledby="pool-heading" className="scroll-mt-8 py-12">
          <h2 id="pool-heading" className="mb-8 text-4xl">
            The pool right now
          </h2>
          <PoolStats />
        </section>

        <section id="haul" aria-labelledby="haul-heading" className="scroll-mt-8 py-12">
          <h2 id="haul-heading" className="text-4xl">
            How a haul works
          </h2>
          <ol className="mt-8 max-w-3xl space-y-6">
            <li>
              <h3 className="text-2xl">Mint</h3>
              <p className="mt-1 text-silt">
                Pay the mint price and the ORAO oracle rolls one of six tiers, from the common Rust Bucket to The Abyssal
                One. Higher tiers have a higher Depth Rating and are rarer. The odds are{" "}
                <Link href="/shipyard" className="text-foam underline decoration-kelp underline-offset-4">
                  public in the shipyard
                </Link>
                .
              </p>
            </li>
            <li>
              <h3 className="text-2xl">Dock</h3>
              <p className="mt-1 text-silt">
                Docked subs stay in your wallet, locked in place while they work. Every second, the pool pays docked subs
                in proportion to their Depth Rating against the whole fleet&apos;s.
              </p>
            </li>
            <li>
              <h3 className="text-2xl">Haul</h3>
              <p className="mt-1 text-silt">
                70% of every mint and upgrade fee drips into the pool over a rolling 12 hours. Claim whenever you like.
                Claims can never be paused.
              </p>
            </li>
            <li>
              <h3 className="text-2xl">Upgrade, merge, explore</h3>
              <p className="mt-1 text-silt">
                Reinforce a hull, merge two subs into the next tier, buy more dock slots, or send one sub on an
                expedition for a chance at a temporary depth boost or a barnacle. Every upgrade fee feeds the pool too.
              </p>
            </li>
          </ol>
          <p className="mt-8 max-w-3xl text-silt">
            None of this creates money. Earnings come from other players&apos; fees, so they shrink as more subs join and
            stop when minting stops.{" "}
            <Link href="/docs" className="text-foam underline decoration-kelp underline-offset-4">
              Every formula is in the docs
            </Link>
            .
          </p>
        </section>

        <section id="catches" aria-labelledby="catches-heading" className="scroll-mt-8 py-12">
          <h2 id="catches-heading" className="mb-6 text-4xl">
            Latest mints
          </h2>
          <RecentMints />
        </section>
      </div>
    </div>
  );
}
