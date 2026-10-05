// Logo: gradient play-button mark + "Watch Party" wordmark. Used in the navbar, footer and room header.
export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm ${className}`}>
      <svg viewBox="0 0 24 24" className="h-1/2 w-1/2 translate-x-[1px]" fill="currentColor">
        <path d="M8 5.5v13a1 1 0 0 0 1.52.85l10.5-6.5a1 1 0 0 0 0-1.7L9.52 4.65A1 1 0 0 0 8 5.5Z" />
      </svg>
    </span>
  );
}

export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      {!compact && <span className="text-lg font-extrabold tracking-tight text-slate-900">Watch Party</span>}
    </span>
  );
}
