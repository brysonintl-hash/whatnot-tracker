'use client';

import { CartProvider, SiteHeader, SiteFooter, useCart } from '@/components/landing';
import { Button, Icon } from '@/components/ui';

// Requires login — middleware already redirects signed-out visitors to
// /login before this ever renders, since /cart isn't in its public list.

function CartContent() {
  const { items, subtotal, updateQty, remove } = useCart();

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-unit-sm px-margin-mobile py-unit-3xl text-center">
        <Icon name="shopping_cart" className="text-on-surface-variant/40" style={{ fontSize: '56px' }} />
        <h1 className="font-display text-headline-md uppercase text-on-surface">Your cart is empty</h1>
        <p className="text-body-sm text-on-surface-variant">Add something from the shop to see it here.</p>
        <Button asChild className="mt-unit-sm"><a href="/">Continue Shopping</a></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-margin-mobile py-unit-2xl md:px-margin-tablet">
      <h1 className="mb-unit-lg font-display text-headline-xl uppercase text-on-surface">Your Cart</h1>

      <div className="flex flex-col divide-y divide-outline-variant rounded-xl border border-outline-variant bg-surface-container-lowest">
        {items.map(item => (
          <div key={item.sku} className="flex flex-col gap-unit-sm p-unit-lg sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-headline-sm uppercase text-on-surface">{item.name}</p>
              <p className="font-mono text-spec-code text-on-surface-variant">SKU #{item.sku} · ${item.price.toFixed(2)} each</p>
            </div>
            <div className="flex items-center justify-between gap-unit-lg sm:justify-end">
              <div className="flex items-center gap-unit-xs">
                <button
                  onClick={() => updateQty(item.sku, item.qty - 1)}
                  aria-label={`Decrease quantity of ${item.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded border border-outline-variant text-on-surface transition-colors hover:bg-surface-container"
                >
                  <Icon name="remove" size="sm" />
                </button>
                <span className="w-8 text-center font-mono tabular-nums text-on-surface">{item.qty}</span>
                <button
                  onClick={() => updateQty(item.sku, item.qty + 1)}
                  aria-label={`Increase quantity of ${item.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded border border-outline-variant text-on-surface transition-colors hover:bg-surface-container"
                >
                  <Icon name="add" size="sm" />
                </button>
              </div>
              <span className="w-20 text-right font-display text-headline-sm text-on-surface">
                ${(item.qty * item.price).toFixed(2)}
              </span>
              <button
                onClick={() => remove(item.sku)}
                aria-label={`Remove ${item.name}`}
                className="text-on-surface-variant transition-colors hover:text-error"
              >
                <Icon name="close" size="sm" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-unit-lg flex items-center justify-between rounded-xl bg-surface-container-low p-unit-lg">
        <span className="font-display text-headline-sm uppercase text-on-surface">Subtotal</span>
        <span className="font-display text-price-huge text-primary">${subtotal.toFixed(2)}</span>
      </div>

      <p className="mt-unit-sm text-body-sm text-on-surface-variant">
        Checkout isn't set up online yet — call the Contractor Desk at{' '}
        <a href="tel:1-800-555-7825" className="text-primary hover:underline">1-800-555-STCK</a> to place this order.
      </p>
    </div>
  );
}

export default function CartPage() {
  return (
    <CartProvider>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-28">
        <CartContent />
      </main>
      <SiteFooter />
    </CartProvider>
  );
}
