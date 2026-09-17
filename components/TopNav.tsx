"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEbbStore } from "@/lib/store";

export function TopNav() {
  const pathname = usePathname();
  const datasetLabel = useEbbStore((s) => s.datasetLabel);
  const resetToDemo = useEbbStore((s) => s.resetToDemo);
  const isDemo = datasetLabel.startsWith("Demo data");

  const isPortfolio = pathname === "/";
  const isImport = pathname === "/import";

  return (
    <header className="sticky top-0 z-20 border-b border-bg-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight text-ink">Ebb</span>
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
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs">
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
