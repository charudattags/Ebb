"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEbbStore } from "@/lib/store";
import {
  parseJSONDataset,
  parseSheetFile,
  guessMapping,
  buildDatasetFromRows,
  validateMapping,
  summarize,
  detectFormat,
  EXPECTED_FIELDS,
  type ImportResult,
  type ParsedSheet,
  type ColumnMapping,
} from "@/lib/import";

type Step = "upload" | "map" | "result";

function formatCell(value: unknown): string {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  return String(value ?? "");
}

export default function ImportPage() {
  const router = useRouter();
  const cohorts = useEbbStore((s) => s.cohorts);
  const loadDataset = useEbbStore((s) => s.loadDataset);
  const resetToDemo = useEbbStore((s) => s.resetToDemo);

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setParseError(null);
      setFileName(file.name);
      const format = detectFormat(file.name);
      if (format === "json") {
        const text = await file.text();
        const parsed = parseJSONDataset(text, cohorts);
        setResult(parsed);
        setSheet(null);
        setStep("result");
        return;
      }
      try {
        const parsedSheet = await parseSheetFile(file);
        if (parsedSheet.headers.length === 0 || parsedSheet.rows.length === 0) {
          setParseError("Couldn't find a header row and at least one data row in this file.");
          return;
        }
        setSheet(parsedSheet);
        setMapping(guessMapping(parsedSheet.headers));
        setStep("map");
      } catch (e) {
        setParseError(`Couldn't read this file: ${(e as Error).message}`);
      }
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

  const missingMapped = useMemo(() => validateMapping(mapping), [mapping]);

  function confirmMapping() {
    if (!sheet) return;
    const built = buildDatasetFromRows(sheet, mapping, cohorts);
    setResult(built);
    setStep("result");
  }

  function startOver() {
    setStep("upload");
    setSheet(null);
    setResult(null);
    setFileName(null);
    setParseError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const summary = result && result.errors.length === 0 ? summarize(result) : null;

  function loadIt() {
    if (!result || result.errors.length > 0) return;
    loadDataset(result.borrowers, result.cohorts, `Imported: ${fileName} (${result.borrowers.length} borrowers)`, result.warnings);
    router.push("/");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Import a dataset</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Bring your own book — a spreadsheet (.xlsx, .xls, .csv), or JSON matching the{" "}
          <code className="text-ink-faint">Borrower[]</code> shape. Everything is parsed in your browser; nothing is
          uploaded anywhere.
        </p>
      </div>

      {step === "upload" && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition ${
              dragActive ? "border-class-seasonal bg-class-seasonal/5" : "border-bg-border hover:border-ink-faint"
            }`}
          >
            <p className="text-sm text-ink-dim">Drag and drop a .xlsx, .xls, .csv, or .json file here, or click to browse.</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>

          {parseError && (
            <div className="rounded-xl border border-class-structural/40 bg-class-structural/5 p-4 text-sm text-class-structural">
              {parseError}
            </div>
          )}

          <p className="text-xs text-ink-faint">
            No file handy?{" "}
            <a href="/sample-import.xlsx" download className="text-class-seasonal hover:underline">
              Download the sample .xlsx
            </a>{" "}
            (12 borrowers, deliberately mismatched column names) to try the mapping flow.
          </p>

          <div className="rounded-xl border border-bg-border bg-bg-panel p-5 text-xs text-ink-faint">
            <p className="font-medium text-ink-dim">We're looking for these columns (any header names — you'll map them next):</p>
            <p className="mt-1 font-mono">
              borrower_id, name, trade, region, month, income, expenses_essential, expenses_business, txn_count,
              emi_due, amount_paid, days_late
            </p>
            <p className="mt-2">
              Rows are grouped by <code>borrower_id</code>. EMI is derived as the modal <code>emi_due</code>. An
              unrecognised trade falls back to a flat seasonal profile rather than being rejected.
            </p>
          </div>
        </>
      )}

      {step === "map" && sheet && (
        <div className="space-y-5">
          <div className="rounded-xl border border-bg-border bg-bg-panel p-5">
            <h3 className="text-sm font-medium text-ink-dim">
              Match your columns — {sheet.headers.length} detected in {fileName}
            </h3>
            <p className="mt-1 text-xs text-ink-faint">We've guessed a mapping below; fix anything that's wrong.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {EXPECTED_FIELDS.map((field) => (
                <label key={field.key} className="flex flex-col gap-1 text-xs">
                  <span className="text-ink-dim">{field.label}</span>
                  <select
                    value={mapping[field.key] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({
                        ...m,
                        [field.key]: e.target.value === "" ? undefined : Number(e.target.value),
                      }))
                    }
                    className={`rounded-lg border bg-bg-raised px-3 py-2 text-sm text-ink focus:border-class-seasonal focus:outline-none ${
                      mapping[field.key] === undefined ? "border-class-temporary/50" : "border-bg-border"
                    }`}
                  >
                    <option value="">— not mapped —</option>
                    {sheet.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {missingMapped.length > 0 && (
              <p className="mt-3 text-xs text-class-temporary">
                Still need: {missingMapped.join(", ")}.
              </p>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-bg-border bg-bg-panel p-4">
            <p className="mb-2 text-xs font-medium text-ink-dim">Preview — first 3 rows</p>
            <table className="min-w-full text-left text-xs tabular">
              <thead className="text-ink-faint">
                <tr>
                  {sheet.headers.map((h, i) => (
                    <th key={i} className="px-2 py-1 font-medium">{h || `Column ${i + 1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-ink-dim">
                {sheet.rows.slice(0, 3).map((row, ri) => (
                  <tr key={ri} className="border-t border-bg-border">
                    {sheet.headers.map((_, ci) => (
                      <td key={ci} className="px-2 py-1">{formatCell(row[ci])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button
              onClick={confirmMapping}
              disabled={missingMapped.length > 0}
              className="rounded-lg bg-class-seasonal/20 px-4 py-2 text-sm font-medium text-class-seasonal transition hover:bg-class-seasonal/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Validate {sheet.rows.length.toLocaleString("en-IN")} rows
            </button>
            <button onClick={startOver} className="rounded-lg border border-bg-border px-4 py-2 text-sm text-ink-dim transition hover:text-ink">
              Start over
            </button>
          </div>
        </div>
      )}

      {step === "result" && result && (
        <div className="space-y-4">
          {result.errors.length > 0 ? (
            <div className="rounded-xl border border-class-structural/40 bg-class-structural/5 p-5">
              <h3 className="text-sm font-medium text-class-structural">
                {result.errors.length} error{result.errors.length === 1 ? "" : "s"} — nothing was loaded
              </h3>
              <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-xs text-ink-dim">
                {result.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>{e.row ? `Row ${e.row}: ` : ""}{e.message}</li>
                ))}
              </ul>
              {result.errors.length > 50 && <p className="mt-2 text-xs text-ink-faint">…and {result.errors.length - 50} more.</p>}
            </div>
          ) : (
            summary && (
              <div className="rounded-xl border border-class-improving/40 bg-class-improving/5 p-5">
                <h3 className="text-sm font-medium text-class-improving">Ready to load</h3>
                <p className="mt-2 text-sm text-ink">
                  {summary.borrowerCount} borrowers · {summary.recordCount.toLocaleString("en-IN")} records ·{" "}
                  {summary.earliestMonth} – {summary.latestMonth}
                  {summary.warningCount > 0 && ` · ${summary.warningCount} warning${summary.warningCount === 1 ? "" : "s"}`}
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
            )
          )}
          <div className="flex gap-3">
            <button onClick={startOver} className="rounded-lg border border-bg-border px-4 py-2 text-sm text-ink-dim transition hover:text-ink">
              Import a different file
            </button>
            <button
              onClick={() => { resetToDemo(); router.push("/"); }}
              className="rounded-lg border border-bg-border px-4 py-2 text-sm text-ink-dim transition hover:text-ink"
            >
              Reset to demo data
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
