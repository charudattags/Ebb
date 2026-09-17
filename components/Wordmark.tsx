// Inline, hand-drawn-feeling mark: "Ebb" set in the display face with a
// single tide swash underneath rather than a stock logotype.
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="28" height="20" viewBox="0 0 28 20" fill="none" aria-hidden="true">
        <path
          d="M1 12.5c2.4 3 4.8 3 7.2 0s4.8-3 7.2 0 4.8 3 7.2 0"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="text-class-seasonal"
        />
        <path
          d="M1 17c2.4 2.2 4.8 2.2 7.2 0s4.8-2.2 7.2 0 4.8 2.2 7.2 0"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          className="text-ink-faint"
          opacity="0.6"
        />
      </svg>
      <span className="font-display text-xl font-semibold tracking-tight text-ink">Ebb</span>
    </span>
  );
}
