import { TIER_NAMES, grow, launchParams, reinforceCost } from "@abyss-haul/client";
import type { Metadata } from "next";
import { CohortChart } from "@/components/cohort-chart";
import { sol } from "@/lib/format";

export const metadata: Metadata = {
  title: "How it works",
  description: "Every formula behind Abyss Haul: the fee split, the payout stream, shares, boosts, prices, randomness, and who wins and loses.",
};

const SECTIONS = [
  ["money", "Where the money comes from"],
  ["stream", "How the pool pays out"],
  ["share", "Your share"],
  ["boosts", "Expedition boosts"],
  ["prices", "Prices"],
  ["randomness", "Randomness"],
  ["cohorts", "Who wins and who loses"],
  ["control", "Who controls what"],
] as const;

function Formula({ children }: { children: string }) {
  return (
    <pre className="mt-4 overflow-x-auto rounded-[var(--radius-hull)] border border-kelp bg-trench px-4 py-3 text-[0.9rem] leading-relaxed text-foam">
      <code>{children}</code>
    </pre>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-8 border-t border-kelp/60 py-12">
      <h2 id={`${id}-h`} className="text-4xl">
        {title}
      </h2>
      <div className="mt-4 max-w-3xl space-y-4 text-silt [&_strong]:font-bold [&_strong]:text-foam">{children}</div>
    </section>
  );
}

export default function DocsPage() {
  const p = launchParams();
  const n = (b: { toString(): string }) => BigInt(b.toString());
  const perDepth = n(p.reinforceLamportsPerDepth);
  return (
    <div className="py-12 lg:grid lg:grid-cols-[13rem_1fr] lg:gap-12">
      <nav aria-label="On this page" className="hidden lg:block">
        <ol className="sticky top-8 space-y-2 text-[0.95rem]">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-silt no-underline hover:text-foam">
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article>
        <h1 className="text-6xl">How it works</h1>
        <p className="mt-4 max-w-3xl text-lg text-silt">
          Everything the program does with your SOL, in plain language next to the exact formula. The program and these
          numbers are open source; the launch values below come from the same file the program is initialized with.
        </p>

        <Section id="money" title="Where the money comes from">
          <p>
            Every mint, reinforcement, merge and dock slot charges a fee. <strong>{p.poolBps / 100}%</strong> of each fee
            goes into the pool (rounded up in the pool&apos;s favour) and the rest goes straight to the treasury. Anyone can
            also add SOL to the pool directly; that goes 100% to players.
          </p>
          <Formula>{`to_pool     = ceil(fee × ${p.poolBps} / 10000)
to_treasury = fee − to_pool`}</Formula>
          <p>
            The pool lives in an account controlled only by the program. The only instruction that can take SOL out of it is
            a player&apos;s claim. There is no admin withdrawal.
          </p>
        </Section>

        <Section id="stream" title="How the pool pays out">
          <p>
            Fees don&apos;t pay out all at once. Each new fee is added to whatever hasn&apos;t been paid yet, and the
            whole amount is spread evenly over a fresh <strong>{p.window.toNumber() / 3600}-hour window</strong>. If fees
            stop, the pool is fully paid out exactly one window after the last fee.
          </p>
          <Formula>{`on each fee:   stream_remaining += to_pool
               stream_end        = now + ${p.window.toNumber() / 3600} h
every second:  released = stream_remaining × elapsed / (stream_end − last_update)`}</Formula>
          <p>
            If no subs are docked at all, the stream pauses instead of paying into the void: the window end moves forward
            until someone docks. Direct pool funding adds to the stream without restarting the window, so tiny donations
            can&apos;t be used to slow everyone&apos;s payouts.
          </p>
        </Section>

        <Section id="share" title="Your share">
          <p>
            Docked subs are paid in proportion to Depth Rating. The program keeps one running total, &ldquo;SOL per unit of
            depth&rdquo;, so claiming costs the same no matter how big the fleet gets.
          </p>
          <Formula>{`acc_per_depth += released × 10¹² / total_depth
your_pending   = your_depth × (acc_per_depth − your_snapshot) / 10¹²`}</Formula>
          <p>
            Every rounding favours the pool: credits round up what&apos;s reserved and harbors are paid rounded down. The
            difference is at most a lamport or so per action, and it stays in the pool. The program is tested so that the
            pool always holds at least everything owed, after every possible sequence of actions we could generate.
          </p>
          <p>
            Because your share is <em>your depth ÷ total depth</em>, <strong>every new sub that docks makes every existing
            share smaller</strong>, including yours.
          </p>
        </Section>

        <Section id="boosts" title="Expedition boosts">
          <p>
            Once a day you can send one docked sub away for 1 to 6 hours. It earns nothing while away. When it comes back,
            it has a <strong>{p.expeditionBoostChanceBps / 100}%</strong> chance of a boost of +{p.expeditionBoostBps / 100}%
            of its Depth Rating for {p.expeditionBoostHoursPerHour} hours per hour away, a{" "}
            {p.expeditionBarnacleChanceBps / 100}% chance of a cosmetic barnacle, and otherwise nothing. On average the boost
            makes up about 90% of the earnings lost while away.
          </p>
          <p>
            <strong>Boosts end on the hour.</strong> A boost&apos;s end is rounded up to the next full hour (a 4-hour boost
            starting at 10:20 ends at 15:00). The program removes it exactly at that boundary, even if nobody sends a
            transaction then, and records a checkpoint of the running total there.
          </p>
          <p>
            <strong>The 30-day checkpoint fallback.</strong> Checkpoints are kept for 720 hours. If a harbor whose boost
            ended isn&apos;t touched by anyone for 30 days, its checkpoint may be overwritten. It is then paid at its base
            depth for that whole stretch: it loses the boost bonus, never its base earnings, and the unpaid bonus stays in
            the pool. A daily keeper settles expired boosts, so in practice this never happens.
          </p>
          <p>Undocking, merging or re-sending the boosted sub ends its boost immediately.</p>
        </Section>

        <Section id="prices" title="Prices">
          <p>
            Mint: <strong>{sol(n(p.mintPrice))}</strong>. Reinforcement adds {p.reinforceBpsPerLevel / 100}% of a sub&apos;s
            base Depth Rating per level, up to level {p.reinforceMaxLevel}, and costs more each level. The cost scales with
            the tier&apos;s base depth, so every tier takes the same time to earn it back.
          </p>
          <Formula>{`reinforce(level L) = ${Number(perDepth) / 1e9} SOL × base_depth × ${p.reinforceGrowthBps / 10000}^(L−1)   (rounded up)
dock slot k        = ${sol(n(p.slotBaseLamports))} × ${p.slotGrowthBps / 10000}^k   (k = slots beyond the first ${p.harborStartSlots})`}</Formula>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[520px] border-collapse text-left text-[0.95rem]">
              <caption className="mb-2 text-left">Reinforcement and merge costs per tier</caption>
              <thead className="text-sm">
                <tr className="border-b border-kelp">
                  <th scope="col" className="py-2 font-normal">Tier</th>
                  <th scope="col" className="py-2 text-right font-normal">Level 1</th>
                  <th scope="col" className="py-2 text-right font-normal">Level {p.reinforceMaxLevel}</th>
                  <th scope="col" className="py-2 text-right font-normal">Merge two</th>
                </tr>
              </thead>
              <tbody className="text-foam">
                {TIER_NAMES.map((name, i) => {
                  const base = n(p.tierDepth[i]);
                  return (
                    <tr key={name} className="border-b border-kelp/50">
                      <td className="py-1.5">{name}</td>
                      <td className="py-1.5 text-right">{sol(reinforceCost(perDepth, p.reinforceGrowthBps, base, 1))}</td>
                      <td className="py-1.5 text-right">{sol(reinforceCost(perDepth, p.reinforceGrowthBps, base, p.reinforceMaxLevel))}</td>
                      <td className="py-1.5 text-right">{i < 5 ? sol(n(p.mergeFee[i])) : "top tier"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p>
            Before every mint, reinforcement and merge, the site shows an estimated payback time. It uses the lower of the
            current payout rate and the last day&apos;s actual rate, and it says &ldquo;never&rdquo; when the rate is zero or
            the payback would take more than five years. At a fleet of 1,000 subs with 50 mints a day, a level-1
            reinforcement takes about 100 days to earn back and level {p.reinforceMaxLevel} about 490. Treat reinforcing as a
            long-term sink. The dock slot after the first {p.harborStartSlots} costs {sol(grow(n(p.slotBaseLamports), p.slotGrowthBps, 0))}.
          </p>
        </Section>

        <Section id="randomness" title="Randomness">
          <p>
            Tiers and expedition finds come from the <strong>ORAO VRF</strong> oracle. Your mint pays the fee and requests
            randomness in the same transaction, before the result exists, so nobody (players, the team, or the oracle&apos;s
            requester) can choose or re-roll it. The request includes a random value from your browser, so nobody can
            pre-claim your request either.
          </p>
          <p>
            If the oracle hasn&apos;t answered an hour after you pay, anyone can settle the mint as a Rust Bucket (or bring an
            expedition home with nothing). Holding back a reveal never helps.
          </p>
          <p>
            Each randomness request costs about <strong>0.0065 SOL</strong>, paid to ORAO and not refunded: a 0.0005 SOL fee
            plus rent for the request account. That&apos;s about 2.6% on top of a mint. Abyss Haul originally used
            Switchboard, which shut down in September 2026.
          </p>
        </Section>

        <Section id="cohorts" title="Who wins and who loses">
          <p>
            This chart comes straight from the project&apos;s economics simulation: 120 days, players who mint and hold, in
            four launch shapes. Earnings depend on how fast minting grows, not on how big the fleet is, so the buyers who
            come early gain at the expense of those who come later.
          </p>
          <p className="text-lantern">
            Players as a group always end at −30% or worse, in every scenario, because 30% of every fee goes to the
            treasury and randomness costs come on top.
          </p>
        </Section>
        <div className="max-w-5xl pb-12">
          <CohortChart />
        </div>

        <Section id="control" title="Who controls what">
          <p>
            The admin is a multisig (Squads), not a single key. It can change prices and odds within fixed bounds (the pool
            share can never drop below 50%; the window stays between 1 hour and 7 days), and it can pause minting and
            upgrades. It <strong>cannot</strong> withdraw from the pool, change what anyone is owed, or pause claims,
            undocking or expedition returns.
          </p>
          <p>
            <strong>The upgrade authority can replace the program&apos;s code.</strong> That&apos;s why it sits behind the same
            multisig with a time lock: any upgrade is visible on-chain for the whole time-lock period before it can run. The
            plan is to make the program immutable once it&apos;s stable. The program has not been independently audited.
          </p>
        </Section>
      </article>
    </div>
  );
}
