import Image from 'next/image';
import { Icon } from '@/components/ui';
import { Reveal } from './reveal';

type Category = {
  name: string;
  count: number;
  save: string;
  brands: string;
  image: string;
  alt: string;
};

const CATEGORIES: Category[] = [
  {
    name: 'Cordless Drill Kits', count: 128, save: 'Save Up to 40%', brands: 'Milwaukee, DeWalt, Makita',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBUELpAstvE9HJJf2mvpTRzZ9QPuukHpAEdrvBmYGCXxEUKPBIRABA6v9VtA6-pM4hc4KNVqTzVspFnCV0i7Xs8i8MwXnmPrBCisNUa6IUjI2rjowuicMLHAMwdaA8g4VVeeX4rhZzBmTsplX0ZovU72W1qpW9wrfsPslHNjMUGuSoxg0PlT4Hj2mM46ocOZbJtmvHDYYN3hPpFdX_FuHgqolN4cCCNZK03FUoxFPYIhx6EnhYKzbzh6A',
    alt: 'Cordless drill combo set with batteries and hard case',
  },
  {
    name: 'Impact Drivers & Wrenches', count: 94, save: 'Save Up to 35%', brands: 'High Torque · 1/2" · 3/4"',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAGp5cyBaepgneSs5bbTNVjLHG_c6WWT8K7tp4IPOB18cs9igHYTgNWGFzRdkAbbMa2zfbh0m7FfvpWtXwQkNV134FXz2kmWm9kVDk9PW_-1PbYDGdMxgt1HPA9lkwnudKwMoWdO_a7UbP2vDWPHN7vMcrYMfzv3WFF2uTW4G0PqOjeVbBA-H88jWBS4tJWloi3m3Zu8khR_nRAtLP0apaSWYbsxFrWPDnL_847ECyBbUDgoxkHiujIFQ',
    alt: 'High torque impact wrenches with socket attachments',
  },
  {
    name: 'Rotary & Demolition Hammers', count: 62, save: 'Save Up to 45%', brands: 'SDS-Plus & SDS-Max Breakers',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCDqNT61HhCXLa79NM6PFDibmYp0ahWtDZwX_HJh6pyHMvGMMsgikDYsAMCC7iHC_elbxlXLIBwYI3cFc_1S6wu6kELcPy1X5AMdzbgIVEn4rnoB5nS_TFO_ooRtU8Qs872fusuwCdPVGXLpKXk9h5DAblXx49wJ4C54rKGpAchdCFyVdYSe7JlwgCr7r9tuRnsWJVJOqtoCEDGb9qntBMrkLrEktDPBArnIJ9Z3usRUVG3sDLOak3rCQ',
    alt: 'Industrial demolition hammer with chisels',
  },
  {
    name: 'Miter & Circular Saws', count: 88, save: 'Save Up to 30%', brands: 'Sliding Compound & Worm-Drive',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBRmtznnuscioTHCJO7Sg3GsjqHOSlAYNjlV1zND-aPQNWzJs3EVH6jv-L59_w2JVNAEG8mTo08Un7XZSwqONu9ksXHK1dZ75hJRNL7o9q5DLnb5gaCz8ansPyvSY9B1p7lobOdwk5VWjIdj-RW3XjHxxHMjVN6IOCaGCWU6PnMnB3LPhNPtm_1jee80mLWji7JbO7C5PpoTa4K7dbA1cp9nYQK51wsFgUf7jHppzIS_HcM1U3m0FkstQ',
    alt: 'Compound sliding miter saw on a rolling stand',
  },
  {
    name: 'Tool Chests & Jobsite Storage', count: 110, save: 'Save Up to 50%', brands: 'Rolling Boxes & Steel Chests',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBCuguVBq7QsSgnxTV8B4F3x9uqVG7WAq31dpo2eUGQ3zaZoH0WjOW1_l9Dlh4DNRg4rSUMYCPANvXeMjCSUDtG8aLCJX0nemagmjTG5XJFv6rE54M2RVvQNVHJa_H-jbMe3fngZcp6kOLldfm6LON_j-VIftjM1t6YV7XvNyfpr1pF81w4kbKVcCgF_SMeRI5-bX3Fphy45BWxxTJL72qZqpTNIAPp7vNmB2cwDGU01TM2rF0dKjXrlA',
    alt: 'Stackable modular tool storage chests',
  },
  {
    name: 'Precision Hand Tools', count: 340, save: 'Lifetime Warranty', brands: 'Ratchets, Wrenches, Levels',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBt8qyXzkSRfJn-wwr5_JzZTtbUqgYfuq12U2F9c3iCer_Wo6YCr0iNqMaL--YEaQWIarAdSJMpJ4v0VgHKcRO0XQ5yi_hOjmocmliYLECnov0FDKJKftTthTX1dd-w-g2jFPxJQWN8GQlUjIgg0XZymAh8WXJKbhf-hECrjSFS5QoCPrgRI9ockfk64iB0XHUEuu-xOuC3SltFCmgaGRUtpMeg6BNyQylUA7gRkjEwbqUv5NtMfkhmAQ',
    alt: 'Forged chrome vanadium wrenches and a torpedo level',
  },
];

export function CategoryGrid() {
  return (
    <section id="categories" className="w-full bg-surface py-unit-2xl">
      <div className="mx-auto max-w-7xl px-margin-mobile md:px-margin-tablet lg:px-margin-desktop">
        <Reveal className="mb-unit-xl flex flex-col justify-between gap-unit-sm md:flex-row md:items-end">
          <div>
            <span className="block font-mono text-spec-code uppercase text-secondary">Direct Equipment Inventory</span>
            <h2 className="font-display text-headline-xl uppercase text-on-surface">Shop By Pro Category</h2>
          </div>
          <a href="#" className="group flex items-center gap-unit-2xs font-display text-label-badge uppercase text-primary-container hover:underline">
            Explore All 24 Heavy Trade Divisions
            <Icon name="arrow_forward" size="sm" className="transition-transform duration-200 group-hover:translate-x-1" />
          </a>
        </Reveal>

        <div className="grid grid-cols-1 gap-unit-lg sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c, i) => (
            <Reveal key={c.name} delay={i * 70}>
              <a
                href="#"
                className="group flex h-full flex-col justify-between rounded-xl bg-surface-container-lowest p-unit-lg shadow-sm transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-1 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-unit-sm">
                  <div>
                    <span className="rounded bg-surface-container px-unit-xs py-unit-2xs font-mono text-spec-code uppercase text-secondary">
                      {c.count} Products
                    </span>
                    <h3 className="mt-unit-xs font-display text-headline-md uppercase text-on-surface transition-colors group-hover:text-primary-container">
                      {c.name}
                    </h3>
                  </div>
                  <span className="shrink-0 whitespace-nowrap rounded bg-primary-fixed px-unit-xs py-unit-2xs font-display text-label-badge uppercase text-on-primary-fixed">
                    {c.save}
                  </span>
                </div>

                <div className="my-unit-md flex h-40 items-center justify-center overflow-hidden rounded-lg bg-surface-container-low">
                  <Image
                    src={c.image}
                    alt={c.alt}
                    width={220}
                    height={144}
                    unoptimized
                    className="h-36 object-contain transition-transform duration-300 group-hover:scale-105"
                  />
                </div>

                <div className="flex items-center justify-between font-display text-label-badge uppercase text-secondary">
                  <span>{c.brands}</span>
                  <Icon name="arrow_forward" size="md" className="text-primary-container transition-transform duration-200 group-hover:translate-x-1" />
                </div>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
