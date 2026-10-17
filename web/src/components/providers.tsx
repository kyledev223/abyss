"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import type { ReactNode } from "react";
import { PUBLIC_RPC_URL } from "@/lib/config";

/**
 * Phantom, Solflare and Backpack all implement the Wallet Standard and are detected automatically,
 * so no wallet-specific adapters are bundled.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConnectionProvider endpoint={PUBLIC_RPC_URL} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
