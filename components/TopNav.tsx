"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEbbStore } from "@/lib/store";
import { Wordmark } from "@/components/Wordmark";

export function TopNav() {
  const pathname = usePathname();
  const datasetLabel = useEbbStore((s) => s.datasetLabel);
  const resetToDemo = useEbbStore((s) => s.resetToDemo);
  const soundOn = useEbbStore((s) => s.soundOn);
  const toggleSound = useEbbStore((s) => s.toggleSound);
  const isDemo = datasetLabel.startsWith("Demo data");

  const isPortfolio = pathname === "/";
  const isImport = pathname === "/import";

  return (
    <header className="sticky top-0 z-20 border-b border-bg-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <Wordmark />
          <span className="hidden text-xs text-ink-faint sm:inline">cash-flow aware lending</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/"
            className={isPortfolio ? "font-medium text-ink" : "text-ink-dim hover:text-ink"}
          >
            Portfolio
          </Link>
          <Link
            href="/import"
            className={isImport ? "font-medium text-ink" : "text-ink-dim hover:text-ink"}
          >
            Import data
          </Link>
          <Link href="/borrower/new" className="text-ink-dim hover:text-ink">
            + Add borrower
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <button
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? "Turn sound off" : "Turn sound on"}
            title={soundOn ? "Sound on" : "Sound off"}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-bg-border text-ink-dim transition hover:border-ink-faint hover:text-ink"
          >
            {soundOn ? <SoundOnIcon /> : <SoundOffIcon />}
          </button>
          <span className="rounded-full border border-bg-border bg-bg-panel px-3 py-1 text-ink-dim">
            {datasetLabel}
          </span>
          {!isDemo && (
            <button
              onClick={resetToDemo}
              className="rounded-full border border-bg-border px-3 py-1 text-ink-dim transition hover:border-ink-faint hover:text-ink"
            >
              Reset to demo data
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function SoundOnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M17 8a5 5 0 010 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function SoundOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
