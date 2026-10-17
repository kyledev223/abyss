"use client";

import { TIER_NAMES, prepareMintCommit, prepareMintReveal } from "@abyss-haul/client";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { useState } from "react";
import { PrimaryButton } from "@/components/buttons";
import { SubArt } from "@/components/sub-art";
import { TxStatusLine } from "@/components/tx-status";
import { expectedDepth, payback, useEconomy } from "@/lib/economy";
import { paybackText, sol } from "@/lib/format";
import { useAbyssClient, useSender } from "@/lib/hooks";

export function Shipyard() {
  const { client, ready } = useAbyssClient();
  const eco = useEconomy(client, ready);
  const { publicKey, send, run, status } = useSender();
  const { setVisible } = useWalletModal();
  const [minted, setMinted] = useState<{ asset: string; tier: number; depth: number }>();

  const p = eco?.params;
  const price = p ? BigInt(p.mintPrice.toString()) : 0n;
  const randomness = eco ? eco.oraoFee + eco.oraoRequestRent : 0n;
  const rent = eco?.subAccountsRent ?? 0n;
  const total = price + randomness + rent;
  const expDepth = p ? expectedDepth(p) : 0;
  const days = eco ? payback(price + randomness, expDepth, eco) : "never";

  const mint = () =>
    run(async (step) => {
      if (!publicKey) throw new Error("Connect a wallet first.");
      setMinted(undefined);
      step("Confirm the mint in your wallet");
      const { mintIndex, tx } = await prepareMintCommit(client, publicKey, { priorityFeeUrl: "/api/priority-fee" });
      await send(tx);
      step("Waiting for ORAO to roll your tier (usually a few seconds)");
      const reveal = await prepareMintReveal(client, publicKey, mintIndex, { fee: { priorityFeeUrl: "/api/priority-fee" } });
      step("Confirm the reveal in your wallet; the rent deposit you don't use comes back to you");
      const signature = await send(reveal);
      const asset = client.pda.asset(mintIndex);
      const sub = await client.sub(asset);
      if (sub) setMinted({ asset: asset.toBase58(), tier: sub.tier, depth: sub.depth.toNumber() });
      return { message: sub ? `You minted ${TIER_NAMES[sub.tier]} #${Number(mintIndex) + 1}.` : "Minted.", signature };
    });

  return (
    <div className="py-12">
      <h1 className="text-6xl">Shipyard</h1>
      <p className="mt-4 max-w-2xl text-lg text-silt">
        Every mint rolls one of six tiers with randomness from the ORAO oracle. You pay before the roll exists, so
        nobody, including us, can pick or re-roll the result.
      </p>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="odds-heading">
          <h2 id="odds-heading" className="text-3xl">
            Tiers and odds
          </h2>
          <table className="mt-6 w-full border-collapse text-left">
            <caption className="sr-only">Each tier&apos;s chance per mint and its Depth Rating</caption>
            <thead className="text-sm text-silt">
              <tr className="border-b border-kelp">
                <th scope="col" className="py-2 font-normal">
                  Tier
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Chance per mint
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Depth Rating
                </th>
              </tr>
            </thead>
            <tbody>
              {TIER_NAMES.map((name, i) => {
                const odds = p ? p.tierOddsBps[i] / 100 : 0;
                return (
                  <tr key={name} className="border-b border-kelp/50">
                    <th scope="row" className="py-3 font-normal">
                      <div className="flex items-center gap-4">
                        <SubArt tier={i} size={72} label={`${name} sample`} />
                        <span className="font-display text-2xl font-bold">{name}</span>
                      </div>
                    </th>
                    <td className="py-3 text-right">
                      {odds}%<span className="block text-sm text-silt">about 1 in {odds ? Math.round(100 / odds) : "–"}</span>
                    </td>
                    <td className="py-3 text-right font-display text-2xl">{p ? Number(p.tierDepth[i].toString()).toLocaleString("en-US") : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-4 text-[0.95rem] text-silt">
            Merging two subs of the same tier makes one of the next tier with about 9% more Depth Rating than the
            pair. If the oracle hasn&apos;t answered an hour after you pay, the mint settles as a Rust Bucket, so
            holding back a reveal can never help anyone.
          </p>
        </section>

        <section aria-labelledby="mint-heading" className="self-start rounded-[var(--radius-hull)] border border-kelp bg-trench/70 p-6">
          <h2 id="mint-heading" className="text-3xl">
            Mint a sub
          </h2>
          <dl className="mt-5 space-y-2 text-[0.95rem]">
            <Row label="Mint price" value={sol(price)} note={p ? `${p.poolBps / 100}% to the pool, ${100 - p.poolBps / 100}% to the treasury` : undefined} />
            <Row label="Randomness (ORAO fee and request account)" value={sol(randomness)} note="paid to ORAO, not refunded" />
            <Row label="Rent for your sub's accounts" value={sol(rent)} note="stays with your sub" />
            <div className="flex justify-between border-t border-kelp pt-2 font-bold">
              <dt>You pay about</dt>
              <dd className="text-lantern">{sol(total)}</dd>
            </div>
          </dl>
          <p className="mt-5 text-[0.95rem]">
            Expected Depth Rating per mint: {expDepth.toFixed(0)}. Earning back the price takes{" "}
            <strong className="font-bold text-lantern">{paybackText(days)}</strong>.
          </p>
          <p className="mt-1 text-sm text-silt">
            That&apos;s an estimate at today&apos;s network rate. It falls as minting slows and more subs join.
          </p>

          <div className="mt-6">
            {eco?.paused.mint ? (
              <p className="text-lantern">Minting is paused by the admin. Claims and undocking still work.</p>
            ) : !eco?.live ? (
              <p className="text-silt">Minting opens once the program is live on this network.</p>
            ) : publicKey ? (
              <PrimaryButton onClick={mint} disabled={status.kind === "working"} className="w-full">
                Mint for {sol(price + randomness)}
              </PrimaryButton>
            ) : (
              <PrimaryButton onClick={() => setVisible(true)} className="w-full">
                Connect a wallet to mint
              </PrimaryButton>
            )}
            <TxStatusLine status={status} />
          </div>

          {minted && (
            <div className="mt-6 flex items-center gap-4 border-t border-kelp pt-6">
              <SubArt asset={minted.asset} tier={minted.tier} size={96} label={`Your new ${TIER_NAMES[minted.tier]}`} />
              <div>
                <p className="font-display text-2xl font-bold">{TIER_NAMES[minted.tier]}</p>
                <p className="text-sm text-silt">Depth Rating {minted.depth}</p>
                <Link href="/harbor" className="mt-2 inline-block text-plankton underline underline-offset-4">
                  Dock it in your harbor
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>
        {label}
        {note && <span className="block text-sm text-silt">{note}</span>}
      </dt>
      <dd className="whitespace-nowrap text-lantern">{value}</dd>
    </div>
  );
}
