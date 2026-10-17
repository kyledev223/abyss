import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Big_Shoulders, Big_Shoulders_Stencil } from "next/font/google";
import { Onboarding } from "@/components/onboarding";
import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const display = Big_Shoulders({ subsets: ["latin"], variable: "--font-big-shoulders", display: "swap" });
const stencil = Big_Shoulders_Stencil({ subsets: ["latin"], variable: "--font-big-shoulders-stencil", display: "swap" });
const body = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Abyss Haul", template: "%s · Abyss Haul" },
  description:
    "Mint procedurally drawn submarines, dock them in your harbor and haul up a share of the fee pool. Every formula is public.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${stencil.variable} ${body.variable}`}>
      <body className="min-h-screen">
        <Providers>
          <SiteHeader />
          <main className="mx-auto max-w-6xl px-4">{children}</main>
          <SiteFooter />
          <Onboarding />
        </Providers>
      </body>
    </html>
  );
}
