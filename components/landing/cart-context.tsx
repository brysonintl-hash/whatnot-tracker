'use client';

import * as React from 'react';

/**
 * Cart state for the storefront. Anonymous visitors get a local-only,
 * session-only cart (browse and add things without an account). Once
 * someone is logged in — a customer, in practice, since staff roles get
 * redirected away from the storefront before ever reaching this — it
 * loads and persists their cart from the server, so it survives a
 * refresh or a return visit. There's still no checkout; this is "what
 * do you want," not a working payment flow.
 */

export type CartItem = { sku: string; name: string; price: number; qty: number };

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  loggedIn: boolean;
  userName: string | null;
  add: (item: Omit<CartItem, 'qty'>) => void;
  updateQty: (sku: string, qty: number) => void;
  remove: (sku: string) => void;
  justAdded: string | null;
}

const CartContext = React.createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<CartItem[]>([]);
  const [justAdded, setJustAdded] = React.useState<string | null>(null);
  const [loggedIn, setLoggedIn] = React.useState(false);
  const [userName, setUserName] = React.useState<string | null>(null);
  // Callbacks below are stable (empty dep arrays) but need the *current*
  // login state, not whatever it was on mount — hence the ref alongside
  // the state that drives rendering.
  const loggedInRef = React.useRef(false);

  React.useEffect(() => {
    fetch('/api/me')
      .then(r => (r.ok ? r.json() : null))
      .then(s => {
        if (!s) return;
        setLoggedIn(true);
        setUserName(s.name ?? null);
        loggedInRef.current = true;
        return fetch('/api/cart')
          .then(r => (r.ok ? r.json() : null))
          .then(data => { if (data?.items) setItems(data.items); });
      })
      .catch(() => {});
  }, []);

  const add = React.useCallback((item: Omit<CartItem, 'qty'>) => {
    setItems(prev => {
      const existing = prev.find(i => i.sku === item.sku);
      return existing
        ? prev.map(i => (i.sku === item.sku ? { ...i, qty: i.qty + 1 } : i))
        : [...prev, { ...item, qty: 1 }];
    });
    setJustAdded(item.sku);
    window.setTimeout(() => setJustAdded(cur => (cur === item.sku ? null : cur)), 1400);

    if (loggedInRef.current) {
      fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      }).catch(() => {});
    }
  }, []);

  const updateQty = React.useCallback((sku: string, qty: number) => {
    setItems(prev => (qty <= 0 ? prev.filter(i => i.sku !== sku) : prev.map(i => (i.sku === sku ? { ...i, qty } : i))));
    if (loggedInRef.current) {
      fetch('/api/cart', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, qty }),
      }).catch(() => {});
    }
  }, []);

  const remove = React.useCallback((sku: string) => {
    setItems(prev => prev.filter(i => i.sku !== sku));
    if (loggedInRef.current) {
      fetch('/api/cart', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku }),
      }).catch(() => {});
    }
  }, []);

  const count = items.reduce((sum, i) => sum + i.qty, 0);
  const subtotal = items.reduce((sum, i) => sum + i.qty * i.price, 0);

  return (
    <CartContext.Provider value={{ items, count, subtotal, loggedIn, userName, add, updateQty, remove, justAdded }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = React.useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
