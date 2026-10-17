"use client";

import {
  EXPEDITION_COOLDOWN,
  MAX_EXPEDITION_HOURS,
  MEASURED_CU,
  REVEAL_TIMEOUT,
  TIER_NAMES,
  claimableAt,
  currentPayoutPerDay,
  effectiveDepth,
  prepareExpeditionReturnCommit,
  prepareExpeditionReturnReveal,
  reinforceCost,
  slotCost,
  toHarborRewards,
  toRewardState,
  type Checkpoints,
} from "@abyss-haul/client";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PrimaryButton, QuietButton } from "@/components/buttons";
import { SubArt } from "@/components/sub-art";
import { TxStatusLine } from "@/components/tx-status";
import { payback, useEconomy, type Economy } from "@/lib/economy";
import { duration, paybackText, sol } from "@/lib/format";
import { useAbyssClient, useFleet, useNow, useSender } from "@/lib/hooks";
import type { FleetSub } from "@/lib/server/chain";

type HarborAccount = NonNullable<Awaited<ReturnType<ReturnType<typeof useAbyssClient>["client"]["harbor"]>>>;
type PoolAccount = Awaited<ReturnType<ReturnType<typeof useAbyssClient>["client"]["pool"]>>;

const FEE = { priorityFeeUrl: "/api/priority-fee" };

export function Harbor() {
  const { client, ready } = useAbyssClient();
  const { publicKey, send, run, status } = useSender();
  const { setVisible } = useWalletModal();
  const owner = publicKey?.toBase58() ?? null;
  const fleet = useFleet(owner);
  const eco = useEconomy(client, ready);
  const now = useNow();

  const [harbor, setHarbor] = useState<HarborAccount | null | undefined>();
  const [pool, setPool] = useState<PoolAccount>();
  const [cps, setCps] = useState<Checkpoints>();

  const reload = useCallback(async () => {
    if (!publicKey || !ready) return;
    const [h, p, c] = await Promise.all([client.harbor(publicKey), client.pool(), client.checkpoints()]);
    setHarbor(h);
    setPool(p);
    setCps(c);
    fleet.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, publicKey, ready]);

  useEffect(() => {
    const first = setTimeout(reload, 0);
    const t = setInterval(reload, 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [reload]);

  /** Sends one instruction from the connected wallet and refreshes everything. */
  const act = (label: string, done: string, build: () => Promise<TransactionInstruction>, cu: number) =>
    run(async (step) => {
      if (!publicKey) throw new Error("Connect a wallet first.");
      step(`Confirm ${label} in your wallet`);
      const signature = await send(await client.tx(publicKey, [await build()], cu, FEE));
      await reload();
      return { message: done, signature };
    });

  if (!publicKey) {
    return (
      <Shell>
        <p className="mt-4 max-w-xl text-lg text-silt">Connect a wallet to see your harbor, claim earnings and manage your subs.</p>
        <PrimaryButton className="mt-6" onClick={() => setVisible(true)}>
          Connect a wallet
        </PrimaryButton>
      </Shell>
    );
  }
  if (!ready || harbor === undefined || !eco) {
    return (
      <Shell>
        <p className="mt-4 text-silt">{eco && !eco.live ? "The program isn't live on this network yet." : "Reading your harbor…"}</p>
      </Shell>
    );
  }
  if (harbor === null) {
    return (
      <Shell>
        <p className="mt-4 max-w-xl text-lg text-silt">
          You don&apos;t have a harbor yet. Opening one is free apart from a small rent deposit for its account, and it
          starts with {eco.params.harborStartSlots} dock slots.
        </p>
        <PrimaryButton
          className="mt-6"
          disabled={status.kind === "working"}
          onClick={() => act("opening your harbor", "Your harbor is open.", () => client.openHarborIx(publicKey), MEASURED_CU.openHarbor)}
        >
          Open your harbor
        </PrimaryButton>
        <TxStatusLine status={status} />
      </Shell>
    );
  }

  const subs = fleet.data?.subs ?? [];
  const inSlots = subs.filter((s) => s.state !== "idle");
  const idle = subs.filter((s) => s.state === "idle");
  const busy = status.kind === "working";

  return (
    <Shell>
      <Earnings harbor={harbor} pool={pool} cps={cps} now={now} busy={busy} onClaim={() => act("the claim", "Claimed to your wallet.", () => client.claimIx(publicKey), MEASURED_CU.claim)} />
      <TxStatusLine status={status} />

      <section aria-labelledby="docked-heading" className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="docked-heading" className="text-3xl">
            Docked {harbor.docked} of {harbor.slots} slots
          </h2>
          <ExpandSlot harbor={harbor} eco={eco} busy={busy} onExpand={() => act("the new dock slot", "Your harbor has a new slot.", () => client.expandHarborIx(publicKey), MEASURED_CU.expandHarbor)} />
        </div>
        {inSlots.length === 0 ? (
          <p className="mt-4 text-silt">Nothing docked. Dock a sub below to start earning a share of the pool.</p>
        ) : (
          <ul className="mt-4 divide-y divide-kelp/60 border-y border-kelp/60">
            {inSlots.map((s) => (
              <SubRow key={s.asset} sub={s} harbor={harbor} eco={eco} now={now} busy={busy}>
                <DockedActions
                  sub={s}
                  harbor={harbor}
                  eco={eco}
                  now={now}
                  busy={busy}
                  act={act}
                  run={run}
                  send={send}
                  reload={reload}
                />
              </SubRow>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="idle-heading" className="mt-14">
        <h2 id="idle-heading" className="text-3xl">
          In your wallet
        </h2>
        {idle.length === 0 ? (
          <p className="mt-4 text-silt">
            No undocked subs.{" "}
            <Link href="/shipyard" className="text-foam underline underline-offset-4">
              Mint one in the shipyard
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-kelp/60 border-y border-kelp/60">
            {idle.map((s) => (
              <SubRow key={s.asset} sub={s} harbor={harbor} eco={eco} now={now} busy={busy}>
                <QuietButton
                  disabled={busy || harbor.docked >= harbor.slots || eco.paused.upgrades}
                  title={harbor.docked >= harbor.slots ? "All dock slots are full" : undefined}
                  onClick={() => act("docking", "Docked. It's earning now.", () => client.dockIx(publicKey, new PublicKey(s.asset)), MEASURED_CU.dock)}
                >
                  Dock
                </QuietButton>
                <Reinforce sub={s} eco={eco} busy={busy} onReinforce={() => act("the reinforcement", "Hull reinforced.", () => client.reinforceIx(publicKey, new PublicKey(s.asset)), MEASURED_CU.reinforce)} />
              </SubRow>
            ))}
          </ul>
        )}
      </section>

      <Merges subs={subs} eco={eco} busy={busy} onMerge={(a, b) =>
        act(
          "the merge",
          "Merged into the next tier.",
          async () => client.mergeIx(publicKey, new PublicKey(a), new PublicKey(b), BigInt((await client.pool()).mintedCount.toString())),
          MEASURED_CU.merge,
        )
      } />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-12">
      <h1 className="text-6xl">Your harbor</h1>
      {children}
    </div>
  );
}

function Earnings({
  harbor,
  pool,
  cps,
  now,
  busy,
  onClaim,
}: {
  harbor: HarborAccount;
  pool?: PoolAccount;
  cps?: Checkpoints;
  now: number;
  busy: boolean;
  onClaim: () => void;
}) {
  const view = useMemo(() => {
    if (!pool || !cps) return undefined;
    const p = toRewardState(pool.rewards as never);
    const h = toHarborRewards(harbor.rewards as never);
    const claimable = claimableAt(p, h, BigInt(now), cps);
    const myDepth = Number(h.depth + (h.boostEndHour * 3600n > BigInt(now) ? h.boostExtra : 0n));
    const share = p.totalDepth > 0n ? myDepth / Number(p.totalDepth) : 0;
    return { claimable, share, perDay: currentPayoutPerDay(p, BigInt(now)) * share, myDepth };
  }, [pool, cps, harbor, now]);

  return (
    <section aria-labelledby="earn-heading" className="mt-8 grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-end">
      <div>
        <h2 id="earn-heading" className="text-lg font-normal text-silt">
          Ready to claim
        </h2>
        <p className="font-display text-[clamp(2.8rem,7vw,4.8rem)] font-bold leading-none text-plankton" aria-live="off">
          {view ? sol(view.claimable, 6) : "…"}
        </p>
        <PrimaryButton className="mt-5" disabled={busy || !view || view.claimable === 0n} onClick={onClaim}>
          Claim to your wallet
        </PrimaryButton>
      </div>
      {view && (
        <dl className="grid grid-cols-2 gap-6">
          <div className="border-l-2 border-kelp pl-4">
            <dt className="text-sm text-silt">Your share of the fleet</dt>
            <dd className="font-display text-3xl font-bold">{(view.share * 100).toFixed(view.share < 0.01 ? 3 : 2)}%</dd>
            <dd className="text-sm text-silt">Depth Rating {view.myDepth.toLocaleString("en-US")}</dd>
          </div>
          <div className="border-l-2 border-kelp pl-4">
            <dt className="text-sm text-silt">Earning right now</dt>
            <dd className="font-display text-3xl font-bold">{sol(view.perDay)}</dd>
            <dd className="text-sm text-silt">per day, falls as subs join</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function SubRow({ sub, harbor, children }: { sub: FleetSub; harbor: HarborAccount; eco: Economy; now: number; busy: boolean; children: React.ReactNode }) {
  const boosted = harbor.boostSub.toBase58() !== PublicKey.default.toBase58() && harbor.rewards.boostExtra.toNumber() > 0;
  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-3 py-4">
      <SubArt asset={sub.asset} tier={sub.tier} level={sub.level} barnacles={sub.barnacles} size={84} label={`${sub.tierName} #${sub.mintIndex + 1}`} />
      <div className="min-w-[12rem] flex-1">
        <p className="font-display text-2xl font-bold">
          {sub.tierName} <span className="font-body text-base font-normal text-silt">#{sub.mintIndex + 1}</span>
        </p>
        <p className="text-sm text-silt">
          Depth Rating {sub.depth.toLocaleString("en-US")}, reinforce level {sub.level}
          {sub.barnacles > 0 && `, ${sub.barnacles.toString(2).replace(/0/g, "").length} barnacles`}
          {boosted && sub.state === "docked" && ` (boost +${harbor.rewards.boostExtra.toString()} active)`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </li>
  );
}

function Reinforce({ sub, eco, busy, onReinforce }: { sub: FleetSub; eco: Economy; busy: boolean; onReinforce: () => void }) {
  const [open, setOpen] = useState(false);
  const p = eco.params;
  const base = BigInt(p.tierDepth[sub.tier].toString());
  if (sub.level >= p.reinforceMaxLevel) return <span className="text-sm text-silt">Fully reinforced</span>;
  const cost = reinforceCost(BigInt(p.reinforceLamportsPerDepth.toString()), p.reinforceGrowthBps, base, sub.level + 1);
  const gain = Number(effectiveDepth(base, sub.level + 1, p.reinforceBpsPerLevel)) - sub.depth;
  const days = payback(cost, gain, eco);
  return (
    <div className="relative">
      <QuietButton disabled={busy || eco.paused.upgrades} aria-expanded={open} onClick={() => setOpen(!open)}>
        Reinforce
      </QuietButton>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-[var(--radius-hull)] border border-kelp bg-trench p-4 text-[0.95rem] shadow-xl">
          <p>
            Level {sub.level + 1} costs <span className="text-lantern">{sol(cost)}</span> and adds {gain} Depth Rating.
          </p>
          <p className="mt-2 text-lantern">Earning that back takes {paybackText(days)}.</p>
          <p className="mt-2 text-sm text-silt">
            Reinforcing is a long-term sink, not a quick boost: it feeds the pool, and your extra share shrinks as the
            fleet grows. Estimate at today&apos;s rate; it falls if minting slows.
          </p>
          <PrimaryButton
            className="mt-3 w-full"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              onReinforce();
            }}
          >
            Reinforce for {sol(cost)}
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}

function ExpandSlot({ harbor, eco, busy, onExpand }: { harbor: HarborAccount; eco: Economy; busy: boolean; onExpand: () => void }) {
  const p = eco.params;
  if (harbor.slots >= p.harborMaxSlots) return <p className="text-sm text-silt">Your harbor is at its maximum of {p.harborMaxSlots} slots.</p>;
  const cost = slotCost(BigInt(p.slotBaseLamports.toString()), p.slotGrowthBps, p.harborStartSlots, harbor.slots);
  return (
    <QuietButton disabled={busy || eco.paused.upgrades} onClick={onExpand}>
      Add a slot for <span className="ml-1 text-lantern">{sol(cost)}</span>
    </QuietButton>
  );
}

function DockedActions({
  sub,
  harbor,
  eco,
  now,
  busy,
  act,
  run,
  send,
  reload,
}: {
  sub: FleetSub;
  harbor: HarborAccount;
  eco: Economy;
  now: number;
  busy: boolean;
  act: (label: string, done: string, build: () => Promise<TransactionInstruction>, cu: number) => Promise<boolean>;
  run: ReturnType<typeof useSender>["run"];
  send: ReturnType<typeof useSender>["send"];
  reload: () => Promise<void>;
}) {
  const { client } = useAbyssClient();
  const owner = harbor.owner;
  const asset = new PublicKey(sub.asset);
  const [hours, setHours] = useState(2);

  if (sub.state === "away") {
    const left = sub.awayUntil - now;
    if (left > 0) return <span className="text-sm text-silt">On an expedition, back in {duration(left)}</span>;
    return (
      <PrimaryButton
        disabled={busy}
        onClick={() =>
          run(async (step) => {
            step("Confirm the return in your wallet");
            const { tx } = await prepareExpeditionReturnCommit(client, owner, asset, FEE);
            await send(tx);
            step("Waiting for ORAO to decide what your sub found");
            const reveal = await prepareExpeditionReturnReveal(client, owner, asset, { fee: FEE });
            step("Confirm the reveal in your wallet");
            const signature = await send(reveal);
            await reload();
            return { message: "Your sub is back in its slot.", signature };
          })
        }
      >
        Bring it back
      </PrimaryButton>
    );
  }

  if (sub.state === "returning") {
    return (
      <PrimaryButton
        disabled={busy}
        onClick={() =>
          run(async (step) => {
            step("Waiting for ORAO to decide what your sub found");
            const reveal = await prepareExpeditionReturnReveal(client, owner, asset, { fee: FEE });
            step("Confirm the reveal in your wallet");
            const signature = await send(reveal);
            await reload();
            return { message: "Your sub is back in its slot.", signature };
          })
        }
      >
        Reveal the find
      </PrimaryButton>
    );
  }

  const p = eco.params;
  const onCooldown = harbor.lastExpeditionReturn.toNumber() > 0 && now < harbor.lastExpeditionReturn.toNumber() + EXPEDITION_COOLDOWN;
  const someoneAway = harbor.expeditionSub.toBase58() !== PublicKey.default.toBase58();
  const boostHours = hours * p.expeditionBoostHoursPerHour;
  return (
    <>
      <QuietButton disabled={busy} onClick={() => act("undocking", "Undocked. It's back in your wallet, free to trade.", () => client.undockIx(owner, asset), MEASURED_CU.undock)}>
        Undock
      </QuietButton>
      <Reinforce sub={sub} eco={eco} busy={busy} onReinforce={() => act("the reinforcement", "Hull reinforced.", () => client.reinforceIx(owner, asset), MEASURED_CU.reinforce)} />
      <details className="relative">
        <summary className="inline-flex h-10 cursor-pointer list-none items-center rounded-[var(--radius-hull)] border border-kelp px-4 text-[0.95rem] font-bold">
          Expedition
        </summary>
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-[var(--radius-hull)] border border-kelp bg-trench p-4 text-[0.95rem] shadow-xl">
          {someoneAway ? (
            <p className="text-silt">Another sub is already on an expedition. One at a time.</p>
          ) : onCooldown ? (
            <p className="text-silt">
              The next expedition can leave in {duration(harbor.lastExpeditionReturn.toNumber() + EXPEDITION_COOLDOWN - now)}.
            </p>
          ) : (
            <>
              <label className="block">
                Away for
                <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="ml-2 rounded border border-kelp bg-abyss px-2 py-1">
                  {Array.from({ length: MAX_EXPEDITION_HOURS }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>
                      {h} {h === 1 ? "hour" : "hours"}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-3">It earns nothing while away. When it comes back:</p>
              <ul className="mt-1 list-disc pl-5 text-silt">
                <li>
                  {p.expeditionBoostChanceBps / 100}% chance: +{p.expeditionBoostBps / 100}% Depth Rating for {boostHours} hours
                </li>
                <li>{p.expeditionBarnacleChanceBps / 100}% chance: a barnacle on its hull</li>
                <li>{(10_000 - p.expeditionBoostChanceBps - p.expeditionBarnacleChanceBps) / 100}% chance: nothing</li>
              </ul>
              <p className="mt-2 text-sm text-silt">
                Returning costs about 0.0065 SOL for ORAO randomness. If the oracle doesn&apos;t answer within {REVEAL_TIMEOUT / 3600} hour, it
                comes back with nothing.
              </p>
              <PrimaryButton
                className="mt-3 w-full"
                disabled={busy || eco.paused.upgrades}
                onClick={() => act("the expedition", `Your sub left on a ${hours}-hour expedition.`, () => client.expeditionStartIx(owner, asset, hours), MEASURED_CU.expeditionStart)}
              >
                Send for {hours} {hours === 1 ? "hour" : "hours"}
              </PrimaryButton>
            </>
          )}
        </div>
      </details>
    </>
  );
}

function Merges({ subs, eco, busy, onMerge }: { subs: FleetSub[]; eco: Economy; busy: boolean; onMerge: (a: string, b: string) => void }) {
  const p = eco.params;
  const groups = TIER_NAMES.slice(0, 5)
    .map((name, tier) => ({ name, tier, subs: subs.filter((s) => s.tier === tier && (s.state === "idle" || s.state === "docked")) }))
    .filter((g) => g.subs.length >= 2);
  return (
    <section aria-labelledby="merge-heading" className="mt-14">
      <h2 id="merge-heading" className="text-3xl">
        Merge
      </h2>
      {groups.length === 0 ? (
        <p className="mt-4 text-silt">You need two subs of the same tier (below The Abyssal One) to merge them into the next tier.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {groups.map((g) => {
            const fee = BigInt(p.mergeFee[g.tier].toString());
            const [a, b] = [...g.subs].sort((x, y) => x.depth - y.depth);
            const next = Number(p.tierDepth[g.tier + 1].toString());
            const gain = next - a.depth - b.depth;
            return (
              <li key={g.tier} className="flex flex-wrap items-center justify-between gap-4 border-l-2 border-kelp pl-4">
                <div>
                  <p>
                    Two {g.name}s (#{a.mintIndex + 1} and #{b.mintIndex + 1}) become one {TIER_NAMES[g.tier + 1]} with Depth Rating {next}.
                  </p>
                  <p className="text-sm text-silt">
                    {gain >= 0 ? `+${gain}` : gain} Depth Rating, frees a dock slot, resets reinforcement. Earning back the fee takes{" "}
                    {paybackText(payback(fee, Math.max(0, gain), eco))}.
                  </p>
                </div>
                <QuietButton disabled={busy || eco.paused.upgrades} onClick={() => onMerge(a.asset, b.asset)}>
                  Merge for <span className="ml-1 text-lantern">{sol(fee)}</span>
                </QuietButton>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
