import Link from "next/link";
import { IS_PLAY_MONEY } from "@/lib/config";

/** Risk disclaimer, in our own words. Shown on every page. */
export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-kelp/60">
      {IS_PLAY_MONEY && (
        <p className="bg-trench px-4 py-2 text-center text-sm text-silt">
          You are on devnet. Every SOL here is play money with no value.
        </p>
      )}
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[2fr_1fr]">
        <section aria-labelledby="risk-heading" className="max-w-prose">
          <h2 id="risk-heading" className="text-2xl text-lantern">
            Read this before you spend anything
          </h2>
          <div className="mt-3 space-y-3 text-[0.95rem] text-silt">
            <p>
              Abyss Haul is a game, not an investment. Every SOL that subs haul up was paid in by other players
              minting and upgrading. Nothing else funds the pool.
            </p>
            <p>
              Players as a group always end at −30% or worse, because 30% of every fee goes to the treasury. Early
              players can come out ahead only because later players come out behind. When minting slows, earnings
              fall towards zero.
            </p>
            <p>
              Smart contracts can have bugs, randomness comes from an outside oracle, and this program has not been
              independently audited. Only use money you are fully prepared to lose, and check whether games like this
              are legal where you live.
            </p>
          </div>
        </section>
        <nav aria-label="Footer" className="flex flex-col gap-2 text-[0.95rem] text-silt">
          <Link href="/docs" className="hover:text-foam">
            How rewards are calculated
          </Link>
          <Link href="/docs#cohorts" className="hover:text-foam">
            Who wins and who loses
          </Link>
          <Link href="/ledger" className="hover:text-foam">
            Public ledger of every fee
          </Link>
          <a href="https://github.com/kyledev223/abyss" className="hover:text-foam">
            Source code
          </a>
        </nav>
      </div>
    </footer>
  );
}
