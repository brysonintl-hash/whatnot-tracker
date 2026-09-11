import { readData, writeData } from './storage';

// Public-facing storefront settings that staff can change without a
// deploy — right now, just the hero banner image. Same flat-JSON pattern
// as every other store in this app (see lib/storage.ts).
const FILE = 'storefront.json';

export type StorefrontSettings = {
  /** Data URL (uploaded photo) or https:// link, or null to use the built-in placeholder art. */
  heroImage: string | null;
};

const DEFAULTS: StorefrontSettings = { heroImage: null };

export function getStorefrontSettings(): StorefrontSettings {
  return readData<StorefrontSettings>(FILE, DEFAULTS);
}

export function setHeroImage(heroImage: string | null): void {
  writeData<StorefrontSettings>(FILE, { ...getStorefrontSettings(), heroImage });
}
