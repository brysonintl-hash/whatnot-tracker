import { readData, writeData } from './storage';

// Public-facing storefront settings that staff can change without a
// deploy. Same flat-JSON pattern as every other store in this app (see
// lib/storage.ts).
const FILE = 'storefront.json';

export type HeroSlide = {
  /** Data URL (uploaded photo) or an https:// link, or null for the built-in placeholder art. */
  image: string | null;
  label: string;
  status: string;
};

export type StorefrontSettings = {
  heroSlides: HeroSlide[];
};

// The four slides that used to be hardcoded straight into the Hero
// component's carousel — same captions, no photo. An admin sets a photo
// per slide from /storefront.
const DEFAULT_SLIDES: HeroSlide[] = [
  { image: null, label: 'Verified Pro Stock: Pallet #409B', status: 'In Stock' },
  { image: null, label: 'Verified Pro Stock: Pallet #412A', status: 'In Stock' },
  { image: null, label: 'New Arrivals: Milwaukee M18 Line', status: 'Just In' },
  { image: null, label: 'Clearance Yard: Final Markdowns', status: 'Ends Soon' },
];

const DEFAULTS: StorefrontSettings = { heroSlides: DEFAULT_SLIDES };

// Before slides had their own photos, the store held a single heroImage
// applied to every slide. Reading that old shape here migrates it onto
// all four slides once, so whatever was already set keeps showing instead
// of silently disappearing.
type StoredShape = { heroSlides?: HeroSlide[]; heroImage?: string | null };

export function getStorefrontSettings(): StorefrontSettings {
  const raw = readData<StoredShape>(FILE, DEFAULTS);
  if (Array.isArray(raw.heroSlides)) return { heroSlides: raw.heroSlides };
  const legacyImage = raw.heroImage ?? null;
  return { heroSlides: DEFAULT_SLIDES.map(s => ({ ...s, image: legacyImage })) };
}

export function setHeroSlides(heroSlides: HeroSlide[]): void {
  writeData<StorefrontSettings>(FILE, { heroSlides });
}
