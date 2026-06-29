import type { Listing } from '@/app/api/scraper/route';

interface CacheEntry { listings: Listing[]; at: number }

const cache = new Map<string, CacheEntry>();
const TTL = 5 * 60 * 1000;

export function setIngest(username: string, listings: Listing[]): void {
  cache.set(username.toLowerCase(), { listings, at: Date.now() });
}

export function getIngest(username: string): Listing[] | null {
  const entry = cache.get(username.toLowerCase());
  if (!entry) return null;
  if (Date.now() - entry.at > TTL) { cache.delete(username); return null; }
  return entry.listings;
}
