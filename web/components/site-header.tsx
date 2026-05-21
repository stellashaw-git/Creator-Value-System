import Link from "next/link";

/** Matches the landing page header — use on secondary routes only. */
export function SiteHeader() {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-baseline gap-4">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-base font-extrabold tracking-tight">WorthyIQ</span>
            <span className="text-xs uppercase tracking-[0.16em] text-neutral-500">
              Creator Intelligence Platform
            </span>
          </Link>
          <nav className="hidden items-center gap-3 text-xs font-semibold text-neutral-500 sm:flex">
            <Link href="/dataset" className="hover:text-neutral-900">
              Saved
            </Link>
            <Link href="/compare" className="hover:text-neutral-900">
              Compare
            </Link>
            <Link href="/waitlist" className="text-neutral-400 hover:text-neutral-900">
              Early access
            </Link>
          </nav>
        </div>
        <Link href="/analyze" className="btn-primary !py-1.5 !px-4">
          Evaluate a Creator
        </Link>
      </div>
    </header>
  );
}
