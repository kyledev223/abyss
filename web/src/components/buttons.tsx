import type { ButtonHTMLAttributes } from "react";

/** The primary action: glows, because it's the live thing on the screen. */
export function PrimaryButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex h-11 items-center justify-center rounded-[var(--radius-hull)] bg-plankton px-5 font-bold text-abyss shadow-[0_0_24px_rgba(124,245,218,.25)] transition-colors hover:bg-[#a6fbe7] disabled:cursor-not-allowed disabled:bg-kelp disabled:text-silt disabled:shadow-none ${className}`}
    />
  );
}

export function QuietButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex h-10 items-center justify-center rounded-[var(--radius-hull)] border border-kelp px-4 text-[0.95rem] font-bold text-foam transition-colors hover:border-silt disabled:cursor-not-allowed disabled:text-silt/60 ${className}`}
    />
  );
}
