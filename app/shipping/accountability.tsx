'use client';

// Who handled how many shipments, and how often one came back with a problem.

import { useEffect, useState } from 'react';
import { ERROR_TYPES, type ErrorType } from '@/lib/shipmentProblems';
import { dayTime, type Problem } from './shipmentParts';

type PersonScore = {
  username: string;
  name: string;
  handled: number;
  labels: number;
  errors: number;
  rate: number | null;
  byType: Partial<Record<ErrorType, number>>;
  lastErrorAt: string | null;
};

type Data = {
  days: number;
  people: PersonScore[];
  problems: (Problem & { buyer: string | null })[];
  unattributed: number;
};

const WINDOWS = [7, 30, 90];

const SOURCE: Record<Problem['source'], string> = {
  manual: 'Reported here',
  incomplete: 'From Incomplete Orders',
  replacement: 'From Replacements',
};

function topType(byType: PersonScore['byType']): string {
  const top = (Object.entries(byType) as [ErrorType, number][]).sort((a, b) => b[1] - a[1])[0];
  return top ? `${ERROR_TYPES[top[0]]} (${top[1]})` : '—';
}

const pct = (r: number) => `${(r * 100).toFixed(r > 0 && r < 0.1 ? 1 : 0)}%`;

export default function Accountability() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRuledOut, setShowRuledOut] = useState(false);

  async function load(d = days) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/shipments/accountability?days=${d}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn\'t load.');
    }
    setLoading(false);
  }

  useEffect(() => { load(days); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setDismissed(p: Problem, dismissed: boolean) {
    await fetch('/api/shipments/problems', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, dismissed }),
    });
    load();
  }

  const team = data?.people.reduce((t, p) => ({ handled: t.handled + p.handled, errors: t.errors + p.errors }), { handled: 0, errors: 0 });
  const teamRate = team && team.handled ? team.errors / team.handled : null;
  const problems = (data?.problems ?? []).filter(p => showRuledOut || !p.dismissed);
  const ruledOut = (data?.problems ?? []).filter(p => p.dismissed).length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Who handled what — and how often it went wrong</h2>
          <p className="text-xs text-slate-400 mt-0.5 max-w-2xl">
            A shipment&apos;s handler is whoever made its label on this site. If the label was made in Whatnot instead,
            it&apos;s whoever the shipment was assigned to. Problems count against the handler.
          </p>
        </div>
        <div className="flex gap-1">
          {WINDOWS.map(w => (
            <button key={w} onClick={() => setDays(w)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${days === w ? 'bg-red-500 border-red-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-red-400'}`}>
              {w} days
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                {['Person', 'Shipments handled', 'Labels made here', 'Problems', 'Problem rate', 'Most common', 'Last problem'].map((h, i) => (
                  <th key={h} className={`text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4 ${i > 0 && i < 5 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data && data.people.length === 0 && (
                <tr><td colSpan={7} className="py-10 px-4 text-center text-xs text-slate-400">
                  Nobody has handled a shipment in this window yet. Handlers are recorded from the moment someone makes a label here or a shipment is assigned.
                </td></tr>
              )}
              {data?.people.map(p => (
                <tr key={p.username} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-100">{p.name}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-slate-700 dark:text-slate-200">{p.handled}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-slate-500 dark:text-slate-400">{p.labels}</td>
                  <td className={`py-3 px-4 text-right tabular-nums font-bold ${p.errors ? 'text-red-600 dark:text-red-400' : 'text-slate-400'}`}>{p.errors}</td>
                  <td className="py-3 px-4 text-right tabular-nums">
                    {p.rate == null ? <span className="text-slate-400">—</span> : (
                      <span className={teamRate != null && p.rate > teamRate && p.errors > 0 ? 'font-bold text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-200'}>
                        {pct(p.rate)}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">{topType(p.byType)}</td>
                  <td className="py-3 px-4 text-xs text-slate-400">{p.lastErrorAt ? dayTime(p.lastErrorAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
            {team && data && data.people.length > 1 && (
              <tfoot>
                <tr className="bg-slate-50 dark:bg-slate-900/50 text-xs">
                  <td className="py-2.5 px-4 font-bold text-slate-500">Team</td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-slate-500">{team.handled}</td>
                  <td />
                  <td className="py-2.5 px-4 text-right tabular-nums text-slate-500">{team.errors}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-slate-500">{teamRate == null ? '—' : pct(teamRate)}</td>
                  <td colSpan={2} className="py-2.5 px-4 text-slate-400">A rate in red is above the team&apos;s.</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Problem log</h3>
          {ruledOut > 0 && (
            <button onClick={() => setShowRuledOut(v => !v)} className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white">
              {showRuledOut ? 'Hide' : 'Show'} {ruledOut} ruled out
            </button>
          )}
        </div>
        {data && problems.length === 0 && (
          <p className="text-xs text-slate-400">
            No problems in this window. Report one from a shipment&apos;s details on Assign Shipments — open the row and use “Report a problem”.
            Orders logged on Incomplete Orders and Replacements are linked here automatically when the order went out in a shipment someone handled.
          </p>
        )}
        {problems.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm divide-y divide-slate-100 dark:divide-slate-700">
            {problems.map(p => (
              <div key={p.id} className={`flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3 text-xs ${p.dismissed ? 'opacity-50' : ''}`}>
                <div className="w-28 text-slate-400 flex-shrink-0">{dayTime(p.reportedAt)}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-slate-800 dark:text-slate-100">
                    <span className="font-bold">{ERROR_TYPES[p.type]}</span>
                    <span className="text-slate-500"> · {p.againstName || 'nobody'}</span>
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">
                    Shipment #{p.shipmentId}{p.buyer ? ` to ${p.buyer}` : ''}{p.orderId ? ` · order #${p.orderId}` : ''}
                    {p.note ? ` — ${p.note}` : ''}
                  </p>
                </div>
                <div className="text-slate-400 flex-shrink-0">{SOURCE[p.source]}</div>
                <button onClick={() => setDismissed(p, !p.dismissed)} className="font-bold text-slate-500 hover:text-red-600 flex-shrink-0">
                  {p.dismissed ? 'Count it again' : 'Not their fault'}
                </button>
              </div>
            ))}
          </div>
        )}
        {data && data.unattributed > 0 && (
          <p className="text-[11px] text-slate-400 mt-2">
            {data.unattributed} order{data.unattributed === 1 ? '' : 's'} from Incomplete Orders / Replacements went out in a shipment nobody was recorded handling, so {data.unattributed === 1 ? 'it isn\'t' : 'they aren\'t'} counted against anyone.
          </p>
        )}
      </div>
    </div>
  );
}
