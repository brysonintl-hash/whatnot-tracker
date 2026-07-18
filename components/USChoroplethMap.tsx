'use client';

import { useState, useRef } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';

const GEO_URL = '/us-states.json';

const STATE_NAME_TO_ABBR: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR',
  California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID',
  Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS',
  Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
  Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV',
  Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC',
};

const STATE_FULL_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'Washington D.C.',
};

const STOPS = [
  [209, 250, 229],
  [110, 231, 183],
  [16,  185, 129],
  [4,   120, 87 ],
  [6,   78,  59 ],
] as const;

function stateColor(count: number, max: number): string {
  if (!count || !max) return '#1e293b';
  const t = Math.sqrt(Math.min(count / max, 1));
  const raw = t * (STOPS.length - 1);
  const i = Math.min(Math.floor(raw), STOPS.length - 2);
  const f = raw - i;
  const r = Math.round(STOPS[i][0] * (1 - f) + STOPS[i + 1][0] * f);
  const g = Math.round(STOPS[i][1] * (1 - f) + STOPS[i + 1][1] * f);
  const b = Math.round(STOPS[i][2] * (1 - f) + STOPS[i + 1][2] * f);
  return `rgb(${r},${g},${b})`;
}

interface Props {
  stateData: Record<string, number>;
  maxCount: number;
  total: number;
  hovered: string | null;
  onHover: (abbr: string | null) => void;
}

type TooltipState = { abbr: string; x: number; y: number };

export default function USChoroplethMap({ stateData, maxCount, total, hovered, onHover }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  function getRelPos(e: React.MouseEvent) {
    if (!wrapperRef.current) return { x: 0, y: 0 };
    const rect = wrapperRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleEnter(abbr: string | undefined, e: React.MouseEvent<SVGPathElement>) {
    if (!abbr) return;
    onHover(abbr);
    const { x, y } = getRelPos(e);
    setTooltip({ abbr, x, y });
  }

  function handleMove(abbr: string | undefined, e: React.MouseEvent<SVGPathElement>) {
    if (!abbr) return;
    const { x, y } = getRelPos(e);
    setTooltip({ abbr, x, y });
  }

  function handleLeave() {
    onHover(null);
    setTooltip(null);
  }

  const wrapperWidth = wrapperRef.current?.offsetWidth ?? 9999;
  const count = tooltip ? (stateData[tooltip.abbr] ?? 0) : 0;
  const pct = tooltip && total > 0 ? ((count / total) * 100).toFixed(1) : '0';
  const tipLeft = tooltip && (tooltip.x + 185 > wrapperWidth) ? tooltip.x - 180 : (tooltip?.x ?? 0) + 14;

  return (
    <div ref={wrapperRef} className="relative select-none">
      <ComposableMap projection="geoAlbersUsa" style={{ width: '100%', height: 'auto' }}>
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map(geo => {
              const name = geo.properties.name as string;
              const abbr = STATE_NAME_TO_ABBR[name];
              const cnt = abbr ? (stateData[abbr] ?? 0) : 0;
              const isHov = hovered === abbr;
              const fill = isHov ? '#f59e0b' : stateColor(cnt, maxCount);
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  stroke="#0f172a"
                  strokeWidth={0.5}
                  style={{
                    default: { fill, outline: 'none', transition: 'fill 180ms ease' },
                    hover:   { fill: '#f59e0b', outline: 'none', cursor: 'pointer', transition: 'fill 180ms ease' },
                    pressed: { fill, outline: 'none' },
                  }}
                  onMouseEnter={(e) => handleEnter(abbr, e)}
                  onMouseMove={(e)  => handleMove(abbr, e)}
                  onMouseLeave={handleLeave}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      {tooltip && (
        <div
          className="absolute z-30 pointer-events-none"
          style={{ left: tipLeft, top: Math.max(8, tooltip.y - 60) }}
        >
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl px-4 py-3 shadow-2xl min-w-[160px]">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{tooltip.abbr}</p>
            <p className="font-black text-white text-base leading-tight mt-0.5">{STATE_FULL_NAMES[tooltip.abbr] ?? tooltip.abbr}</p>
            <div className="mt-2 flex items-end gap-1.5">
              <span className="text-emerald-400 font-black text-2xl leading-none">{count.toLocaleString()}</span>
              <span className="text-slate-400 text-xs mb-0.5">order{count !== 1 ? 's' : ''}</span>
            </div>
            <p className="text-slate-500 text-xs mt-0.5">{pct}% of total</p>
          </div>
        </div>
      )}
    </div>
  );
}
