import type { Metadata } from "next";
import "./globals.css";
import Disclaimer from "@/components/Disclaimer";

export const metadata: Metadata = {
  title: "ASC Product & Compliance Assistant",
  description:
    "A grounded, guardrailed product-finder assistant for drug and alcohol screening supplies. Independent portfolio project.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <main className="app-main">{children}</main>
          <Disclaimer />
        </div>
      </body>
    </html>
  );
}
