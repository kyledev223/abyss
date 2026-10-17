"use client";

import { useEffect, useRef, useState } from "react";
import { SubArt } from "@/components/sub-art";
import { IS_PLAY_MONEY } from "@/lib/config";

const KEY = "abyss-haul:tour-done";

const STEPS = [
  {
    title: "Welcome aboard",
    body: IS_PLAY_MONEY
      ? "Abyss Haul is a game about a fleet of submarines that share a pool of fees. You're on devnet: every SOL here is play money, so explore freely."
      : "Abyss Haul is a game about a fleet of submarines that share a pool of fees. This short tour covers how it works and what it costs.",
    art: { tier: 0 },
  },
  {
    title: "Mint a sub",
    body: "Each mint rolls one of six tiers using randomness from the ORAO oracle. Rarer tiers have a higher Depth Rating. The odds are listed in the shipyard.",
    art: { tier: 3 },
  },
  {
    title: "Dock it to earn",
    body: "Docked subs stay in your wallet, locked in place. They split the pool's payout by Depth Rating, so the more subs join the fleet, the smaller each share becomes.",
    art: { tier: 2, level: 4 },
  },
  {
    title: "Claim any time",
    body: "Your earnings build up second by second. Claim them to your wallet whenever you like. Claims and undocking can never be paused.",
    art: { tier: 4 },
  },
  {
    title: "Know the risk",
    body: "All earnings come from other players' fees, and 30% of every fee goes to the treasury, so players as a group always lose money. Early players can come out ahead only because later ones come out behind. Only spend what you're ready to lose.",
    art: { tier: 5, barnacles: 0x0f0f },
  },
];

export function Onboarding() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(KEY) === "1";
    } catch {
      // storage unavailable (private mode etc.): show the tour, it just won't be remembered
    }
    if (!seen) dialog.current?.showModal();
  }, []);

  const finish = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    dialog.current?.close();
  };

  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <dialog
      ref={dialog}
      aria-labelledby="tour-title"
      onCancel={finish}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-[var(--radius-hull)] border border-kelp bg-trench p-0 text-foam backdrop:bg-abyss/80"
    >
      <div className="p-6 sm:p-8">
        <SubArt tier={s.art.tier} level={"level" in s.art ? s.art.level : 0} barnacles={"barnacles" in s.art ? s.art.barnacles : 0} size={120} label="" />
        <p className="mt-5 text-sm text-silt" aria-live="polite">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 id="tour-title" className="mt-1 text-3xl">
          {s.title}
        </h2>
        <p className={`mt-3 ${last ? "text-lantern" : "text-silt"}`}>{s.body}</p>
        <div className="mt-8 flex items-center gap-3">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="h-10 rounded-[var(--radius-hull)] border border-kelp px-4 font-bold">
              Back
            </button>
          )}
          <button
            onClick={() => (last ? finish() : setStep(step + 1))}
            className="h-10 rounded-[var(--radius-hull)] bg-plankton px-5 font-bold text-abyss"
            autoFocus
          >
            {last ? "I understand" : "Next"}
          </button>
          {!last && (
            <button onClick={finish} className="ml-auto text-[0.95rem] text-silt underline underline-offset-4">
              Skip the tour
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
