import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export type CartItem = { sku: string; name: string; price: number; qty: number };

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const FILE = join(DATA_DIR, 'carts.json');

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readAll(): Record<string, CartItem[]> {
  try {
    if (existsSync(FILE)) return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {}
  return {};
}

function writeAll(data: Record<string, CartItem[]>): void {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function getCart(username: string): CartItem[] {
  return readAll()[username] ?? [];
}

export function addToCart(username: string, item: Omit<CartItem, 'qty'>): CartItem[] {
  const all = readAll();
  const cart = all[username] ?? [];
  const existing = cart.find(i => i.sku === item.sku);
  const updated = existing
    ? cart.map(i => (i.sku === item.sku ? { ...i, qty: i.qty + 1 } : i))
    : [...cart, { ...item, qty: 1 }];
  all[username] = updated;
  writeAll(all);
  return updated;
}

// qty <= 0 removes the item entirely.
export function setQty(username: string, sku: string, qty: number): CartItem[] {
  const all = readAll();
  const cart = all[username] ?? [];
  const updated = qty <= 0 ? cart.filter(i => i.sku !== sku) : cart.map(i => (i.sku === sku ? { ...i, qty } : i));
  all[username] = updated;
  writeAll(all);
  return updated;
}

export function removeFromCart(username: string, sku: string): CartItem[] {
  const all = readAll();
  const updated = (all[username] ?? []).filter(i => i.sku !== sku);
  all[username] = updated;
  writeAll(all);
  return updated;
}
