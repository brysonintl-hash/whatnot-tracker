/** Minimal header for the legal pages — no search/cart, just a way back home. */
export function LegalHeader() {
  return (
    <header className="w-full border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-3xl items-center px-6">
        <a href="/" className="flex items-baseline gap-1.5">
          <span className="text-lg font-black tracking-tight text-slate-900">Stack</span>
          <span className="text-lg font-black tracking-tight text-[#DC2626]">Bargains</span>
        </a>
      </div>
    </header>
  );
}
