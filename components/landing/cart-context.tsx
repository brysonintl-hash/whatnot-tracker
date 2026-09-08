'use client';

import * as React from 'react';

/**
 * Demo cart state for the landing page — session-only (no persistence, no
 * checkout). There's no customer commerce backend behind this site yet;
 * this exists so "Add to Cart" gives real feedback instead of doing
 * nothing, not to imply a working store. Wire this to a real cart/checkout
 * system when one exists.
 */

export type CartItem = { sku: string; name: string; price: number; qty: number };

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (item: Omit<CartItem, 'qty'>) => void;
  justAdded: string | null;
}

const CartContext = React.createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<CartItem[]>([]);
  const [justAdded, setJustAdded] = React.useState<string | null>(null);

  const add = React.useCallback((item: Omit<CartItem, 'qty'>) => {
    setItems(prev => {
      const existing = prev.find(i => i.sku === item.sku);
      if (existing) {
        return prev.map(i => (i.sku === item.sku ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { ...item, qty: 1 }];
    });
    setJustAdded(item.sku);
    window.setTimeout(() => setJustAdded(cur => (cur === item.sku ? null : cur)), 1400);
  }, []);

  const count = items.reduce((sum, i) => sum + i.qty, 0);
  const subtotal = items.reduce((sum, i) => sum + i.qty * i.price, 0);

  return (
    <CartContext.Provider value={{ items, count, subtotal, add, justAdded }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = React.useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
