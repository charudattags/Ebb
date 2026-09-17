"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEbbStore } from "@/lib/store";
import { parseCSVDataset, parseJSONDataset, detectFormat, summarize, type ImportResult } from "@/lib/import";

export default function ImportPage() {
  const router = useRouter();
  const cohorts = useEbbStore((s) => s.cohorts);
  const loadDataset = useEbbStore((s) => s.loadDataset);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      const format = detectFormat(file.name, text);
      const parsed = format === "json" ? parseJSONDataset(text, cohorts) : parseCSVDataset(text, cohorts);
      setResult(parsed);
      setFileName(file.name);
    },
    [cohorts]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const summary = result && result.errors.length === 0 ? summarize(result) : null;

  function loadIt() {
    if (!result || result.errors.length > 0) return;
    loadDataset(result.borrowers, result.cohorts, `Imported: ${fileName} (${result.borrowers.length} borrowers)`, result.warnings);
    router.push("/");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Import a dataset</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Bring your own book — JSON matching the <code className="text-ink-faint">Borrower[]</code> shape, or a flat
          monthly CSV. Everything is parsed in your browser; nothing is uploaded anywhere.
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition ${
          dragActive ? "border-class-seasonal bg-class-seasonal/5" : "border-bg-border hover:border-ink-faint"
        }`}
      >
        <p className="text-sm text-ink-dim">Drag and drop a .json or .csv file here, or click to browse.</p>
        <input
          ref={inputRef}
          type="file"
          accept=".json,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      <p className="text-xs text-ink-faint">
        No file handy?{" "}
        <a href="/sample-import.csv" download className="text-class-seasonal hover:underline">
          Download the sample CSV
        </a>{" "}
        (10 borrowers from the bundled demo set) to try the flow.
      </p>

      {result && result.errors.length > 0 && (
        <div className="rounded-xl border border-class-structural/40 bg-class-structural/5 p-5">
          <h3 className="text-sm font-medium text-class-structural">
            {result.errors.length} error{result.errors.length === 1 ? "" : "s"} — nothing was loaded
          </h3>
          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-xs text-ink-dim">
            {result.errors.slice(0, 50).map((e, i) => (
              <li key={i}>{e.row ? `Row ${e.row}: ` : ""}{e.message}</li>
            ))}
          </ul>
          {result.errors.length > 50 && (
            <p className="mt-2 text-xs text-ink-faint">…and {result.errors.length - 50} more.</p>
          )}
        </div>
      )}

      {summary && result && (
        <div className="rounded-xl border border-class-improving/40 bg-class-improving/5 p-5">
          <h3 className="text-sm font-medium text-class-improving">Ready to load</h3>
          <p className="mt-2 text-sm text-ink">
            {summary.borrowerCount} borrowers, {summary.recordCount.toLocaleString("en-IN")} records,{" "}
            {summary.earliestMonth} – {summary.latestMonth}
            {summary.warningCount > 0 && `, ${summary.warningCount} warning${summary.warningCount === 1 ? "" : "s"}`}.
          </p>
          {result.warnings.length > 0 && (
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs text-ink-faint">
              {result.warnings.slice(0, 30).map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          )}
          <button
            onClick={loadIt}
            className="mt-4 rounded-lg bg-class-improving/20 px-4 py-2 text-sm font-medium text-class-improving transition hover:bg-class-improving/30"
          >
            Load this dataset
          </button>
        </div>
      )}

      <div className="rounded-xl border border-bg-border bg-bg-panel p-5 text-xs text-ink-faint">
        <p className="font-medium text-ink-dim">CSV columns required:</p>
        <p className="mt-1 font-mono">
          borrower_id, name, trade, region, month, income, expenses_essential, expenses_business, txn_count, emi_due,
          amount_paid, days_late
        </p>
        <p className="mt-2">
          Rows are grouped by <code>borrower_id</code>. EMI is derived as the modal <code>emi_due</code>; loan terms
          not present in the CSV (principal, APR, tenure) are estimated from it. An unrecognised trade falls back to a
          flat seasonal profile rather than being rejected.
        </p>
      </div>
    </div>
  );
}
