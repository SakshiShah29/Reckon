"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Grainient } from "@/components/ui/grainient";

/* ═══════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════ */

const PIPELINE = [
  { step: "01", label: "Fill", desc: "Solver fills order", color: "#8B5CF6" },
  { step: "02", label: "Monitor", desc: "Indexer watches", color: "#14d0f0" },
  { step: "03", label: "Challenge", desc: "Agent detects", color: "#F472B6" },
  { step: "04", label: "Slash", desc: "Bond seized", color: "#EF4444" },
  { step: "05", label: "Distribute", desc: "60 / 30 / 10", color: "#34D399" },
];

const FEATURES = [
  {
    title: "EBBO Oracle",
    desc: "On-chain benchmark computes best-execution price from Uniswap V3 TWAP. Every fill is measured against it.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
      </svg>
    ),
    span: "md:col-span-2",
  },
  {
    title: "Auto-Slash",
    desc: "Challenger agents submit on-chain proof. Bad fills get slashed within minutes — no governance required.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
    span: "",
  },
  {
    title: "iNFT Agents",
    desc: "Autonomous challengers minted as 0G iNFTs with encrypted brain blobs. AXL mesh for multi-agent coordination.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" />
      </svg>
    ),
    span: "",
  },
  {
    title: "ENS Identity",
    desc: "Solvers register with ENS virtual subnames. Reputation is publicly linked to a verifiable on-chain identity.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    span: "md:col-span-2",
  },
];

const STATS = [
  { label: "Total Fills", value: "—", endpoint: "totalFills" },
  { label: "Challenges", value: "—", endpoint: "totalChallenges" },
  { label: "Slashes", value: "—", endpoint: "totalSlashes" },
  { label: "USDC Slashed", value: "—", endpoint: "totalSlashedUSDC", prefix: "$" },
];

/* ═══════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════ */

export default function LandingPage() {
  const [stats, setStats] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((data) => {
        setStats({
          totalFills: String(data.totalFills ?? 0),
          totalChallenges: String(data.totalChallenges ?? 0),
          totalSlashes: String(data.totalSlashes ?? 0),
          totalSlashedUSDC: (data.totalSlashedUSDC ?? 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
        });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="landing-root" style={{ fontFamily: "var(--font-landing)" }}>

      {/* ──────────────────────────────────────────────────────────
          SECTION 1 — HERO
         ────────────────────────────────────────────────────────── */}
      <section className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden">
        {/* Grainient */}
        <Grainient />

        {/* Extra floating orbs for depth */}
        <div className="landing-orb landing-orb-1" />
        <div className="landing-orb landing-orb-2" />
        <div className="landing-orb landing-orb-3" />

        {/* Radial vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 70% 60% at 50% 45%, transparent 30%, rgba(6,6,14,0.7) 100%)",
          }}
        />

        {/* Content */}
        <div className="relative z-10 text-center px-6 max-w-5xl mx-auto">
          {/* Overline */}
          <div className="fade-up fade-up-d1 inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-md mb-10">
            <div className="w-2 h-2 rounded-full bg-[#34D399]" style={{ boxShadow: "0 0 8px #34D399" }} />
            <span className="text-[13px] text-white/60 font-medium tracking-wide">
              Live on Base
            </span>
            <span className="text-[11px] text-white/30 font-mono">Sepolia</span>
          </div>

          {/* Title */}
          <h1
            className="fade-up fade-up-d2 gradient-text text-[clamp(80px,14vw,200px)] font-bold leading-[0.82] tracking-[-0.05em]"
            style={{ fontFamily: "var(--font-landing)" }}
          >
            RECKON
          </h1>

          {/* Tagline */}
          <p className="fade-up fade-up-d3 text-[clamp(17px,2.4vw,26px)] text-white/50 mt-8 max-w-2xl mx-auto leading-[1.5] font-normal">
            The accountability layer that makes DeFi solver fills{" "}
            <span className="text-white/90 font-semibold relative">
              challengeable
              <span className="absolute -bottom-1 left-0 w-full h-[2px] bg-gradient-to-r from-[#8B5CF6] to-[#14d0f0] rounded-full" />
            </span>{" "}
            — with automatic slashing, cryptoeconomic bonds, and on-chain reputation.
          </p>

          {/* CTAs */}
          <div className="fade-up fade-up-d4 flex items-center justify-center gap-4 mt-12">
            <Link
              href="/dashboard"
              className="group relative inline-flex items-center gap-2.5 px-9 py-4 rounded-2xl text-[15px] font-bold text-[#06060e] transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #ffffff 0%, #e0d4fc 100%)",
                boxShadow: "0 0 40px rgba(139,92,246,0.2), 0 4px 20px rgba(0,0,0,0.3)",
              }}
            >
              Launch App
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="group-hover:translate-x-1 transition-transform duration-200">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/swap"
              className="inline-flex items-center gap-2 px-9 py-4 rounded-2xl text-[15px] font-semibold text-white/80 border border-white/12 bg-white/[0.04] backdrop-blur-sm hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 hover:scale-[1.02]"
            >
              Try a Swap
            </Link>
          </div>

          {/* Partner row */}
          <div className="fade-up fade-up-d5 flex items-center justify-center gap-8 mt-16 opacity-50">
            {[
              { name: "UniswapX", logo: "/logos/uniswap.svg", h: "h-6" },
              { name: "Base", logo: "/logos/base-light.svg", h: "h-5" },
              { name: "ENS", logo: "/logos/ens.svg", h: "h-6" },
              { name: "0G", logo: "/logos/0g-light.svg", h: "h-5" },
              { name: "Gensyn", logo: "/logos/gensyn-wordmark.svg", h: "h-4" },
              { name: "KeeperHub", logo: "/logos/keeperhub.png", h: "h-6" },
            ].map((p) => (
              <img key={p.name} src={p.logo} alt={p.name} className={`${p.h} object-contain`} />
            ))}
          </div>
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 opacity-25">
          <div className="w-[1px] h-8 bg-gradient-to-b from-transparent to-white/50" />
          <div className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" />
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
          SECTION 2 — PIPELINE
         ────────────────────────────────────────────────────────── */}
      <section className="relative bg-[#06060e] py-28 px-6 overflow-hidden">
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />

        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-20">
            <span className="text-[11px] uppercase tracking-[0.3em] text-[#8B5CF6] font-semibold">
              The Flow
            </span>
            <h2
              className="text-[clamp(30px,4.5vw,56px)] font-bold text-white mt-4 tracking-[-0.03em]"
              style={{ fontFamily: "var(--font-landing)" }}
            >
              Five Steps to Accountability
            </h2>
          </div>

          {/* Pipeline strip */}
          <div className="flex items-center justify-between">
            {PIPELINE.map((p, i) => (
              <div key={p.step} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center text-center min-w-[100px]">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-[18px] font-bold text-white mb-3 border border-white/[0.08]"
                    style={{ background: `${p.color}18`, color: p.color }}
                  >
                    {p.step}
                  </div>
                  <p className="text-[14px] font-bold text-white tracking-tight">{p.label}</p>
                  <p className="text-[11px] text-white/30 mt-0.5">{p.desc}</p>
                </div>
                {i < PIPELINE.length - 1 && <div className="pipeline-line mx-3" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
          SECTION 3 — LIVE STATS
         ────────────────────────────────────────────────────────── */}
      <section className="relative bg-[#08081a] py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {STATS.map((s) => (
              <div key={s.label} className="glow-card p-6 text-center">
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/30 font-semibold mb-2">
                  {s.label}
                </p>
                <p
                  className="text-[36px] font-bold text-white tracking-tight"
                  style={{ fontFamily: "var(--font-landing)" }}
                >
                  {s.prefix ?? ""}{stats[s.endpoint] ?? s.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
          SECTION 4 — FEATURES (bento)
         ────────────────────────────────────────────────────────── */}
      <section className="relative bg-[#06060e] py-28 px-6 overflow-hidden">
        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-16">
            <span className="text-[11px] uppercase tracking-[0.3em] text-[#14d0f0] font-semibold">
              Primitives
            </span>
            <h2
              className="text-[clamp(30px,4.5vw,52px)] font-bold text-white mt-4 tracking-[-0.03em]"
              style={{ fontFamily: "var(--font-landing)" }}
            >
              What Powers Reckon
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className={`glow-card p-7 ${f.span}`}>
                <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[#8B5CF6] mb-5">
                  {f.icon}
                </div>
                <h3
                  className="text-[18px] font-bold text-white tracking-tight mb-2"
                  style={{ fontFamily: "var(--font-landing)" }}
                >
                  {f.title}
                </h3>
                <p className="text-[13px] text-white/35 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
          SECTION 5 — SLASH DISTRIBUTION
         ────────────────────────────────────────────────────────── */}
      <section className="relative bg-[#08081a] py-28 px-6 overflow-hidden">
        {/* Accent orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, #8B5CF6 0%, transparent 70%)" }}
        />

        <div className="max-w-4xl mx-auto relative text-center">
          <span className="text-[11px] uppercase tracking-[0.3em] text-[#F472B6] font-semibold">
            Economics
          </span>
          <h2
            className="text-[clamp(28px,4vw,48px)] font-bold text-white mt-4 tracking-[-0.03em]"
            style={{ fontFamily: "var(--font-landing)" }}
          >
            Where the Slashed Bond Goes
          </h2>
          <p className="text-[15px] text-white/30 mt-3 max-w-lg mx-auto">
            Every bad fill results in automatic bond seizure and redistribution.
          </p>

          {/* Bar */}
          <div className="mt-14 max-w-2xl mx-auto">
            <div className="flex h-20 rounded-2xl overflow-hidden border border-white/[0.06]">
              <div className="flex-[6] flex flex-col items-center justify-center" style={{ background: "linear-gradient(180deg, #34D399 0%, #059669 100%)" }}>
                <p className="text-white font-bold text-[22px]">60%</p>
                <p className="text-white/70 text-[11px] font-medium mt-0.5">Swapper Restitution</p>
              </div>
              <div className="w-[1px] bg-black/20" />
              <div className="flex-[3] flex flex-col items-center justify-center" style={{ background: "linear-gradient(180deg, #8B5CF6 0%, #6D28D9 100%)" }}>
                <p className="text-white font-bold text-[22px]">30%</p>
                <p className="text-white/70 text-[11px] font-medium mt-0.5">iNFT Owner</p>
              </div>
              <div className="w-[1px] bg-black/20" />
              <div className="flex-[1] flex flex-col items-center justify-center" style={{ background: "linear-gradient(180deg, #FBBF24 0%, #D97706 100%)" }}>
                <p className="text-white font-bold text-[16px]">10%</p>
                <p className="text-white/70 text-[8px] font-medium mt-0.5">Protocol</p>
              </div>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex items-center justify-center gap-4 mt-14">
            <Link
              href="/adjudication"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-[14px] font-semibold text-white border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/18 transition-all duration-300"
            >
              View Live Adjudications
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-[14px] font-semibold text-white/60 hover:text-white transition-colors duration-300"
            >
              Register as Solver
            </Link>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
          FOOTER
         ────────────────────────────────────────────────────────── */}
      <footer className="bg-[#06060e] border-t border-white/[0.04] py-14 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
              <img src="/logo.png" alt="Reckon" className="w-7 h-7 rounded-lg" />
            </div>
            <span
              className="text-white/40 font-bold text-[15px] tracking-tight"
              style={{ fontFamily: "var(--font-landing)" }}
            >
              RECKON
            </span>
          </div>
          <div className="flex items-center gap-6">
            {["Dashboard", "Swap", "Adjudication", "Register"].map((l) => (
              <Link
                key={l}
                href={`/${l.toLowerCase()}`}
                className="text-[12px] text-white/20 hover:text-white/50 transition-colors font-medium"
              >
                {l}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

