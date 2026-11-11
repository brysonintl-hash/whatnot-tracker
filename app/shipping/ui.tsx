'use client';

// Small interaction pieces for the Shipments page: hover tips, menus, a
// picker, toasts and an animated expander. Floating layers render into
// document.body and position themselves against their trigger, so a tip or
// a menu is never clipped by a scrolling table or a collapsing row.

import {
  createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState,
  type ReactNode, type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

// ─── Icons ─────────────────────────────────────────────────────────────────

type IconProps = { className?: string };
const icon = (d: ReactNode) => function Icon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  );
};

export const I = {
  calendar: icon(<><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>),
  bell: icon(<><path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15L6 16z" /><path d="M10 20a2 2 0 004 0" /></>),
  edit: icon(<><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></>),
  bolt: icon(<path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z" />),
  search: icon(<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>),
  filter: icon(<path d="M4 5h16l-6 7.5V19l-4 1.5v-8L4 5z" />),
  list: icon(<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />),
  chevron: icon(<path d="M9 6l6 6-6 6" />),
  chevronDown: icon(<path d="M6 9l6 6 6-6" />),
  left: icon(<path d="M15 6l-6 6 6 6" />),
  dots: icon(<><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" /></>),
  chat: icon(<path d="M5 18.5V6a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H8l-3 2.5z" />),
  box: icon(<><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></>),
  user: icon(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></>),
  weight: icon(<><path d="M6 9h12l2 11H4L6 9z" /><circle cx="12" cy="6" r="2.5" /></>),
  truck: icon(<><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></>),
  hash: icon(<path d="M9 4L7 20M17 4l-2 16M4.5 9h16M3.5 15h16" />),
  tag: icon(<><path d="M3.5 12.5V4.5h8l9 9-8 8-9-9z" /><circle cx="8" cy="9" r="1.3" /></>),
  check: icon(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  checkCircle: icon(<><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.2l2.4 2.4 4.6-4.8" /></>),
  refresh: icon(<><path d="M19.5 12a7.5 7.5 0 01-13.3 4.8M4.5 12a7.5 7.5 0 0113.3-4.8" /><path d="M18 3.5v4h-4M6 20.5v-4h4" /></>),
  alert: icon(<><path d="M12 4l9 16H3l9-16z" /><path d="M12 10v4.5M12 17.5h.01" /></>),
  printer: icon(<><path d="M7 9V4h10v5" /><rect x="3.5" y="9" width="17" height="8" rx="1.5" /><path d="M7 14h10v6H7z" /></>),
  external: icon(<><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></>),
  battery: icon(<><rect x="3" y="7.5" width="16" height="9" rx="1.5" /><path d="M21 11v2M8 12h3M9.5 10.5v3" /></>),
  x: icon(<path d="M6 6l12 12M18 6L6 18" />),
  clock: icon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
  play: icon(<path d="M8 5.5v13l10-6.5-10-6.5z" />),
  flag: icon(<path d="M5 21V4h11l-2 4 2 4H5" />),
  trash: icon(<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" />),
  megaphone: icon(<path d="M4 10v4h3l7 4V6L7 10H4zM17 9.5a3 3 0 010 5" />),
};

export const Spinner = ({ className = 'w-3.5 h-3.5' }: IconProps) => (
  <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
    <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

// ─── Positioning ───────────────────────────────────────────────────────────

type Side = 'top' | 'bottom';
type Align = 'start' | 'center' | 'end';
type Pos = { top: number; left: number; side: Side };

/** Keep a fixed-position layer beside its anchor, flipping when there's no room. */
function useAnchored(
  open: boolean, anchor: RefObject<HTMLElement>, layer: RefObject<HTMLElement>,
  prefer: Side, align: Align, gap = 8,
): Pos | null {
  const [pos, setPos] = useState<Pos | null>(null);
  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    const l = layer.current;
    if (!a || !l) return;
    const w = l.offsetWidth, h = l.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let side = prefer;
    if (side === 'top' && a.top - h - gap < 8) side = 'bottom';
    else if (side === 'bottom' && a.bottom + h + gap > vh - 8 && a.top - h - gap >= 8) side = 'top';
    const top = side === 'top' ? a.top - h - gap : a.bottom + gap;
    let left = align === 'start' ? a.left : align === 'end' ? a.right - w : a.left + a.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, vw - w - 8));
    setPos({ top, left, side });
  }, [anchor, layer, prefer, align, gap]);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);
  return pos;
}

// ─── Hover tip ─────────────────────────────────────────────────────────────

/**
 * Explains the thing under the pointer. Shows after a short pause so moving
 * across the table doesn't flash a trail of tips, and on keyboard focus too.
 */
export function Tip({
  content, children, side = 'top', align = 'center', className = '', delay = 250, wide = false,
}: {
  content: ReactNode; children: ReactNode; side?: Side; align?: Align;
  className?: string; delay?: number; wide?: boolean;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [open, setOpen] = useState(false);
  const pos = useAnchored(open, anchor, layer, side, align);

  const show = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), delay); };
  const hide = () => { clearTimeout(timer.current); setOpen(false); };
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!content) return <>{children}</>;
  return (
    <span ref={anchor} className={`inline-flex ${className}`}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      aria-describedby={open ? id : undefined}>
      {children}
      {open && typeof document !== 'undefined' && createPortal(
        <div ref={layer} id={id} role="tooltip"
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
          className={`fixed z-[80] pointer-events-none ${wide ? 'max-w-[320px]' : 'max-w-[260px]'} rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs leading-relaxed px-3 py-2 shadow-xl shadow-slate-900/20
            ${pos ? `animate-in fade-in duration-150 ${pos.side === 'top' ? 'slide-in-from-bottom-1' : 'slide-in-from-top-1'}` : 'opacity-0'} motion-reduce:animate-none`}>
          {content}
        </div>,
        document.body,
      )}
    </span>
  );
}

// ─── Popover ───────────────────────────────────────────────────────────────

export function Popover({
  open, onClose, anchor, children, align = 'end', side = 'bottom', className = '', role,
}: {
  open: boolean; onClose: () => void; anchor: RefObject<HTMLElement>; children: ReactNode;
  align?: Align; side?: Side; className?: string; role?: string;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const pos = useAnchored(open, anchor, layer, side, align, 6);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (layer.current?.contains(t) || anchor.current?.contains(t)) return;
      // A picker opened from inside this layer renders in its own layer;
      // choosing from it isn't a click outside.
      if (t instanceof Element && t.closest('[data-floating]')) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { onClose(); anchor.current?.focus(); } };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open, onClose, anchor]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div ref={layer} role={role} data-floating=""
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className={`fixed z-[70] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl shadow-slate-900/10 dark:shadow-black/40
        ${pos ? `animate-in fade-in zoom-in-95 duration-150 ${pos.side === 'bottom' ? 'slide-in-from-top-1 origin-top' : 'slide-in-from-bottom-1 origin-bottom'}` : 'opacity-0'} motion-reduce:animate-none ${className}`}>
      {children}
    </div>,
    document.body,
  );
}

// ─── Menu ──────────────────────────────────────────────────────────────────

export type MenuItem =
  | { label: string; onSelect?: () => void; href?: string; icon?: ReactNode; tone?: 'primary' | 'danger'; disabled?: boolean; hint?: string }
  | 'separator';

export function Menu({ items, label = 'More actions' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus());
  }, [open]);

  function onKey(e: React.KeyboardEvent) {
    const els = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
  }

  const real = items.filter(i => i !== 'separator');
  if (!real.length) return null;
  return (
    <>
      <Tip content={label}>
        <button ref={btn} onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={label}
          className={`w-9 h-9 grid place-items-center rounded-lg transition-colors ${open ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'}`}>
          <I.dots className="w-5 h-5" />
        </button>
      </Tip>
      <Popover open={open} onClose={close} anchor={btn} align="end" className="w-60 p-1.5" role="menu">
        <div ref={list} onKeyDown={onKey}>
          {items.map((it, idx) => {
            if (it === 'separator') return <div key={idx} className="my-1 h-px bg-slate-100 dark:bg-slate-700" />;
            const tone = it.tone === 'danger' ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:bg-red-50 dark:focus:bg-red-900/20'
              : it.tone === 'primary' ? 'text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 focus:bg-blue-50 dark:focus:bg-blue-900/30 font-semibold'
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 focus:bg-slate-50 dark:focus:bg-slate-700/60';
            const cls = `w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left outline-none transition-colors ${it.disabled ? 'opacity-40 cursor-not-allowed' : tone}`;
            const body = (
              <>
                <span className="mt-0.5 flex-shrink-0 opacity-80">{it.icon}</span>
                <span className="min-w-0">
                  <span className="block leading-tight">{it.label}</span>
                  {it.hint && <span className="block text-[11px] font-normal text-slate-400 leading-snug mt-0.5">{it.hint}</span>}
                </span>
              </>
            );
            return it.href && !it.disabled ? (
              <a key={idx} role="menuitem" tabIndex={-1} href={it.href} target="_blank" rel="noopener noreferrer" className={cls}
                onClick={() => { it.onSelect?.(); close(); }}>{body}</a>
            ) : (
              <button key={idx} role="menuitem" tabIndex={-1} aria-disabled={it.disabled || undefined} className={cls}
                onClick={() => { if (it.disabled) return; close(); it.onSelect?.(); }}>{body}</button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}

// ─── Picker ────────────────────────────────────────────────────────────────

export type Option = { value: string; label: string; sub?: string };

/** A select that looks like the rest of the page, with keyboard support. */
export function Select({
  value, options, onChange, placeholder = '— Select —', disabled, busy, icon: Icon, className = '', size = 'md', label, align = 'start',
}: {
  value: string; options: Option[]; onChange: (v: string) => void; placeholder?: string;
  disabled?: boolean; busy?: boolean; icon?: (p: IconProps) => JSX.Element; className?: string;
  size?: 'sm' | 'md'; label: string; align?: Align;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const current = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const i = Math.max(0, options.findIndex(o => o.value === value));
    setActive(i);
    requestAnimationFrame(() => list.current?.focus());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function pick(i: number) {
    const o = options[i];
    if (!o) return;
    setOpen(false);
    btn.current?.focus();
    if (o.value !== value) onChange(o.value);
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(active); }
    else if (e.key === 'Tab') setOpen(false);
  }

  const h = size === 'sm' ? 'h-9 text-[13px]' : 'h-10 text-sm';
  return (
    <>
      <button ref={btn} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-label={label}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) { e.preventDefault(); setOpen(true); } }}
        className={`${h} w-full flex items-center justify-between gap-2 px-3 rounded-lg border bg-white dark:bg-slate-900 transition-[border-color,box-shadow,background-color] duration-150
          ${open ? 'border-blue-500 ring-[3px] ring-blue-500/15' : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'}
          disabled:opacity-50 disabled:cursor-not-allowed ${className}`}>
        <span className={`truncate ${current ? 'text-slate-800 dark:text-slate-100 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
          {current ? current.label : placeholder}
        </span>
        {busy ? <Spinner className="w-3.5 h-3.5 text-blue-500" /> : (
          <I.chevronDown className={`w-4 h-4 flex-shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      <Popover open={open} onClose={close} anchor={btn} align={align} className="p-1.5 min-w-[220px]">
        <ul ref={list} role="listbox" tabIndex={-1} aria-label={label} onKeyDown={onKey}
          className="max-h-72 overflow-y-auto outline-none" style={{ minWidth: btn.current?.offsetWidth }}>
          {options.length === 0 && <li className="px-3 py-2 text-xs text-slate-400">Nobody to choose from yet.</li>}
          {options.map((o, i) => {
            const selected = o.value === value;
            const hot = i === active;
            return (
              <li key={o.value || i} data-i={i} role="option" aria-selected={selected}
                onMouseEnter={() => setActive(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(i)}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm cursor-pointer transition-colors duration-100
                  ${hot ? 'bg-blue-600 text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                <span className={`w-4 flex-shrink-0 ${hot ? 'text-white' : 'text-slate-400'}`}>
                  {selected ? <I.check className="w-4 h-4" /> : Icon ? <Icon className="w-4 h-4" /> : null}
                </span>
                <span className="truncate font-medium">{o.label}</span>
                {o.sub && <span className={`ml-auto text-xs ${hot ? 'text-blue-100' : 'text-slate-400'}`}>{o.sub}</span>}
              </li>
            );
          })}
        </ul>
      </Popover>
    </>
  );
}

// ─── Expander ──────────────────────────────────────────────────────────────

/**
 * Opens to its content's natural height and back. The grid-rows trick
 * animates to "auto" without measuring; the content mounts on first open
 * and stays mounted so closing can play out.
 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => { if (open) setMounted(true); }, [open]);
  return (
    <div aria-hidden={!open}
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
      <div className="min-h-0 overflow-hidden">{mounted && children}</div>
    </div>
  );
}

// ─── Toasts ────────────────────────────────────────────────────────────────

type Toast = { id: number; text: string; tone: 'ok' | 'error' | 'info'; action?: { label: string; href: string } };
type Push = (t: Omit<Toast, 'id' | 'tone'> & { tone?: Toast['tone'] }) => void;
const ToastCtx = createContext<Push>(() => {});
export const useToast = () => useContext(ToastCtx);

export function Toasts({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback<Push>(t => {
    const id = ++seq.current;
    setList(l => [...l.slice(-3), { id, tone: 'ok', ...t }]);
    setTimeout(() => setList(l => l.filter(x => x.id !== id)), t.tone === 'error' ? 9000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[90] flex flex-col items-end gap-2 pointer-events-none" aria-live="polite">
        {list.map(t => (
          <div key={t.id}
            className="pointer-events-auto w-full sm:w-auto sm:max-w-sm flex items-start gap-2.5 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-sm px-4 py-3 shadow-2xl shadow-slate-900/30 animate-in fade-in slide-in-from-bottom-3 duration-200 motion-reduce:animate-none">
            <span className={`mt-0.5 flex-shrink-0 ${t.tone === 'error' ? 'text-red-400' : t.tone === 'info' ? 'text-blue-300' : 'text-emerald-400'}`}>
              {t.tone === 'error' ? <I.alert className="w-4 h-4" /> : t.tone === 'info' ? <I.clock className="w-4 h-4" /> : <I.checkCircle className="w-4 h-4" />}
            </span>
            <span className="leading-snug">
              {t.text}
              {t.action && (
                <a href={t.action.href} target="_blank" rel="noopener noreferrer" className="ml-1.5 font-semibold text-blue-300 hover:underline whitespace-nowrap">{t.action.label}</a>
              )}
            </span>
            <button onClick={() => setList(l => l.filter(x => x.id !== t.id))} aria-label="Dismiss" className="ml-1 text-slate-400 hover:text-white">
              <I.x className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
