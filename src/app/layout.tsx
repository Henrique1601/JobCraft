import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JobCraft — Job Copilot Dashboard",
  description:
    "Painel de acompanhamento das candidaturas, Match Score, metas diárias e timeline de passos do job-copilot-agent.",
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "JobCraft — Job Copilot Dashboard",
    description:
      "Painel de acompanhamento das candidaturas, Match Score e timeline de passos.",
    type: "website",
    locale: "pt_BR",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  );
}
