'use client';

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

// 5-stop gradient: slate-900 → emerald-200 → emerald-500 → emerald-700 → emerald-900
const STOPS = [
  [209, 250, 229],  // emerald-100
  [110, 231, 183],  // emerald-300
  [16,  185, 129],  // emerald-500
  [4,   120, 87 ],  // emerald-700
  [6,   78,  59 ],  // emerald-900
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
  hovered: string | null;
  onHover: (abbr: string | null) => void;
}

export default function USChoroplethMap({ stateData, maxCount, hovered, onHover }: Props) {
  return (
    <ComposableMap projection="geoAlbersUsa" style={{ width: '100%', height: 'auto' }}>
      <Geographies geography={GEO_URL}>
        {({ geographies }) =>
          geographies.map(geo => {
            const name = geo.properties.name as string;
            const abbr = STATE_NAME_TO_ABBR[name];
            const count = abbr ? (stateData[abbr] ?? 0) : 0;
            const isHov = hovered === abbr;
            return (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill={isHov ? '#f59e0b' : stateColor(count, maxCount)}
                stroke="#0f172a"
                strokeWidth={0.5}
                style={{
                  default: { outline: 'none' },
                  hover:   { outline: 'none', cursor: 'pointer' },
                  pressed: { outline: 'none' },
                }}
                onMouseEnter={() => { if (abbr) onHover(abbr); }}
                onMouseLeave={() => onHover(null)}
              />
            );
          })
        }
      </Geographies>
    </ComposableMap>
  );
}
