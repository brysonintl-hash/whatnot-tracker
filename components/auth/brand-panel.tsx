/**
 * The left-side brand panel shared by every auth page (login, register,
 * forgot/reset password) — a tilted collage of dashboard cards built in
 * CSS so it stays crisp at any size, showing the app's own figures.
 */

function MenuDots() {
  return (
    <div className="flex flex-col items-center gap-[3px]" aria-hidden="true">
      {[0, 1, 2].map(i => <span key={i} className="h-[3px] w-[3px] rounded-full bg-slate-300" />)}
    </div>
  );
}

function TrendBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600">
      {value}
      <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M2.5 7.5L7.5 2.5M7.5 2.5H3.5M7.5 2.5V6.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Monthly gross-volume bars, echoing the Sales Analytics chart. */
function ChartCard() {
  const bars: { h: number; tone: string }[] = [
    { h: 46, tone: 'bg-emerald-400' }, { h: 72, tone: 'bg-emerald-100' },
    { h: 58, tone: 'bg-amber-300' }, { h: 34, tone: 'bg-rose-100' },
    { h: 88, tone: 'bg-emerald-500' }, { h: 52, tone: 'bg-amber-400' },
    { h: 40, tone: 'bg-rose-200' }, { h: 66, tone: 'bg-orange-500' },
  ];
  return (
    <div className="w-[340px] rounded-3xl bg-white p-6 shadow-2xl">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="text-[26px] font-black leading-none tracking-tight text-slate-900">$918,180</p>
          <p className="mt-1.5 text-[13px] text-slate-400">Gross volume</p>
        </div>
        <MenuDots />
      </div>
      <div className="flex h-28 items-end gap-2">
        {bars.map((b, i) => (
          <div key={i} className={`flex-1 rounded-lg ${b.tone}`} style={{ height: `${b.h}%` }} />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[12px] font-medium text-slate-400">
        <span>Nov</span><span>Dec</span>
      </div>
      <div className="mt-4 flex items-center gap-4 text-[12px] font-medium text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-emerald-400" />Whatnot</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-amber-400" />Amazon</span>
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, badge, note, width = 'w-[300px]',
}: {
  icon: React.ReactNode; label: string; value: string; badge?: string; note?: string; width?: string;
}) {
  return (
    <div className={`${width} rounded-3xl bg-white p-6 shadow-2xl`}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-500">{icon}</span>
        <p className="text-[15px] font-semibold text-slate-500">{label}</p>
      </div>
      <p className="text-[34px] font-black leading-none tracking-tight text-slate-900">{value}</p>
      {(badge || note) && (
        <div className="mt-3 flex items-center gap-2">
          {badge && <TrendBadge value={badge} />}
          {note && <span className="text-[12px] text-slate-400">{note}</span>}
        </div>
      )}
    </div>
  );
}

function BrandTile() {
  return (
    <div className="flex h-[132px] w-[132px] items-center justify-center rounded-[28px] bg-white p-5 shadow-2xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="" className="h-full w-full rounded-2xl object-cover" />
    </div>
  );
}

export function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden lg:block lg:w-[52%]">
      {/* Brand gradient ground */}
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#F0490E_0%,#DC2626_45%,#9F1239_100%)]" />
      {/* Diagonal light streaks */}
      <div
        className="absolute inset-0 opacity-40 mix-blend-overlay"
        style={{
          backgroundImage:
            'repeating-linear-gradient(115deg, rgba(255,255,255,0.55) 0 3px, transparent 3px 26px), ' +
            'repeating-linear-gradient(115deg, rgba(255,180,120,0.5) 0 10px, transparent 10px 60px)',
        }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_10%,transparent_35%,rgba(120,20,10,0.55)_100%)]" />

      {/* Logo */}
      <div className="absolute left-10 top-9 z-20 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Stack Bargains" className="h-11 w-11 rounded-2xl object-cover shadow-lg" />
        <span className="text-[26px] font-black tracking-tight text-white">Stack Bargains</span>
      </div>

      {/* Tilted card collage */}
      <div className="absolute inset-0 z-10" aria-hidden="true">
        <div className="absolute left-[-24px] top-[200px] rotate-[-9deg]"><ChartCard /></div>
        <div className="absolute left-[330px] top-[118px] rotate-[7deg]">
          <StatCard
            label="New income" value="$40,832.32" badge="13.6%" note="from last month"
            icon={<svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="2" y="5" width="16" height="10" rx="2" /><circle cx="10" cy="10" r="2.2" /></svg>}
          />
        </div>
        <div className="absolute left-[372px] top-[312px] rotate-[-4deg] drop-shadow-2xl"><BrandTile /></div>
        <div className="absolute left-[268px] top-[452px] rotate-[5deg]">
          <StatCard
            width="w-[280px]" label="Orders" value="48,060" badge="6.22%" note="this period"
            icon={<svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 6h14l-1.5 9h-11L3 6z" strokeLinejoin="round" /><circle cx="8" cy="17" r="1" /><circle cx="14" cy="17" r="1" /></svg>}
          />
        </div>
        <div className="absolute left-[40px] top-[608px] rotate-[3deg]">
          <StatCard
            label="Gross profit" value="$250,868" badge="8.4%" note="after COGS"
            icon={<svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 14l4.5-5 3.5 3L17 6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          />
        </div>
      </div>
    </div>
  );
}
