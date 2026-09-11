import { randomBytes } from 'crypto';
import { readData, writeData } from './storage';

const FILE = 'deals.json';

export type Deal = {
  id: string;
  sku: string;
  brand: string;
  line: string;
  name: string;
  image: string; // data URL (uploaded photo) or an https:// link
  specs: string[]; // short chips, e.g. "2,000 RPM" — any number, cards render whatever's there
  rating: number; // 0-5
  reviews: number;
  price: number;
  wasPrice: number; // original price — a discount badge only shows when this is greater than price
  description: string;
};

// The four products that used to be hardcoded straight into the FlashDeals
// component — kept as the starting content so the homepage looks exactly
// the same the moment this feature ships. From here, an admin can edit or
// remove them from /deals like anything else.
const DEFAULT_DEALS: Deal[] = [
  {
    id: 'seed-dw-9821', sku: 'DW-9821', brand: 'DEWALT', line: '20V MAX XR',
    name: '1/2-in Brushless Hammer Drill / Driver Kit (5.0Ah)',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBObB5_ZBNrgqy56zYdxpNOAfKzOlikzi7RWWsl_aJlHR0GxWuKTkG0EjAL83dqiopiUi0qNYYVFp8a3mDS2Ejqizf3SEbyZgN-ki9U8g3_KpLz8mXYFunsQiuJZ2GS1YYZFKdyD4l1pMv2f5tbMC98ur2MVnCxeczOMtO9wTm5xaZytn38SUgoZ8NYBdvJRQRVdGcImdnUugm4P2x9S7C-647ng527ZeQ3PtFgJZUqownrGn_bEu80kQ',
    specs: ['2,000 RPM', '820 UWO', '2× Batt'],
    rating: 4.5, reviews: 142, price: 179, wasPrice: 289, description: '',
  },
  {
    id: 'seed-mw-2853', sku: 'MW-2853', brand: 'MILWAUKEE', line: 'M18 FUEL',
    name: '1/4-in Hex Impact Driver Bare Tool High Velocity',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCpinaXeJy6-T5qTyH6-0NGn-K1Zv-Iz7PRzF6MkA4_GtfgcTJyZH4EMChoRJnNfVa51EQyJi3TyUyGkYYXxlG6EsUQ6S1HA99RgTTzSiuAqmJcTpOeNHzIMBAt0l5LOvH01rKa_H9K-x6LOA_2LOCutGJ1N6DLF1Y6aFIH15ejAu95F0AfytjZzC4uZrSboF2lchWkcJryNaqldM49-64uW6ywMCQqDPmVG_62An18qunPjSMbSnZuXA',
    specs: ['2,000 IN-LBS', '3,600 RPM', 'Bare Tool'],
    rating: 5, reviews: 389, price: 99, wasPrice: 169, description: '',
  },
  {
    id: 'seed-mk-5007', sku: 'MK-5007', brand: 'MAKITA', line: '15 AMP',
    name: '7-1/4-in Magnesium Circular Saw With Electric Brake',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDKoHnnShQUPKGigHU4Kv3ggcXaX3hnNMhPXBvs0fJFKKWFiIw94VRMntZlZTg7EasiYX8bMf50V5rblxe0Rnkbgkr8xG2rBh178F_VqfrfV1cEbF8Hv_SIdkzdEf99mWo-G0GoazBISvM7xHuGedw6Jpkf26I70HRr3QaD0Nya7yCh1t3KSMNaJc4iV2NT4V1HTzVYu-FmvxUIM50dhCKCQCTat_zk4iBdGXiwcIybrCFIB0aLyoHWMg',
    specs: ['5,800 RPM', '10.6 LBS', '56° Bevel'],
    rating: 4, reviews: 88, price: 139, wasPrice: 199, description: '',
  },
  {
    id: 'seed-bsh-11255', sku: 'BSH-11255', brand: 'BOSCH', line: 'BULLDOG XTREME',
    name: '1-in SDS-plus D-Handle Rotary Hammer Drill',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDpuT9FCT3qGsUe_WQf7hxLBI5I62wQIOy5KtVuSArQiSdyK3naZmL325T35kGuqshh7pHASgPUXamm4iqgFY1yA3_8iHiVuja1nh5xcV4MlhVmyVkO-9gc1syQA6ASRD8YcuaU2mUFg1fxlzlejKkKonzQRHIYl_NzdSiS0MZ2N0CYvasRbLFmF-WKcmqTTlkSG_F1PWYFEaZz4Dl7NsPRWTeICIInc8Ka-b02kTmjKhovTgET89W7zw',
    specs: ['8.0 AMP', '2.0 FT-LBS', 'Vario-Lock'],
    rating: 5, reviews: 210, price: 149, wasPrice: 269, description: '',
  },
];

export function getDeals(): Deal[] {
  return readData<Deal[]>(FILE, DEFAULT_DEALS);
}

function saveDeals(deals: Deal[]): void {
  writeData<Deal[]>(FILE, deals);
}

export function createDeal(data: Omit<Deal, 'id'>): Deal {
  const deal: Deal = { ...data, id: randomBytes(6).toString('hex') };
  saveDeals([...getDeals(), deal]);
  return deal;
}

export function updateDeal(id: string, data: Partial<Omit<Deal, 'id'>>): Deal | null {
  const deals = getDeals();
  const idx = deals.findIndex(d => d.id === id);
  if (idx === -1) return null;
  const updated = { ...deals[idx], ...data };
  const next = [...deals];
  next[idx] = updated;
  saveDeals(next);
  return updated;
}

export function deleteDeal(id: string): boolean {
  const deals = getDeals();
  const filtered = deals.filter(d => d.id !== id);
  if (filtered.length === deals.length) return false;
  saveDeals(filtered);
  return true;
}
