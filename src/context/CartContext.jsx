import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

const LEGACY_STORAGE_KEY = 'silky_cart';

const CartContext = createContext(null);

function mapCartItems(items) {
  return items.map((item) => ({
    ...item,
    cartItemId: item.id,
  }));
}

function applyCartState(cart, setters) {
  setters.setItems(mapCartItems(cart.items));
  setters.setDeliveryFee(cart.deliveryFee);
  setters.setSubtotal(cart.subtotal);
  setters.setTotal(cart.total);
  setters.setItemCount(cart.itemCount);
}

async function migrateLegacyCart(serverCartEmpty) {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return;

    localStorage.removeItem(LEGACY_STORAGE_KEY);

    if (!serverCartEmpty) return;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;

    for (const item of parsed) {
      if (!item.productId || !item.colorId || !item.size) continue;
      try {
        await api.addCartItem({
          productId: item.productId,
          colorId: item.colorId,
          size: item.size,
          quantity: Math.max(1, Number(item.quantity) || 1),
        });
      } catch {
        /* skip invalid or unavailable legacy items */
      }
    }
  } catch {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
}

export function CartProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState([]);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [subtotal, setSubtotal] = useState(0);
  const [total, setTotal] = useState(0);
  const [itemCount, setItemCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastAddedAt, setLastAddedAt] = useState(null);
  const migratedRef = useRef(false);

  const setters = useMemo(
    () => ({ setItems, setDeliveryFee, setSubtotal, setTotal, setItemCount }),
    [],
  );

  const refreshCart = useCallback(async () => {
    try {
      setError(null);
      const cart = await api.getCart();

      if (!migratedRef.current) {
        migratedRef.current = true;
        const hadLegacy = Boolean(localStorage.getItem(LEGACY_STORAGE_KEY));
        await migrateLegacyCart(cart.items.length === 0);
        if (hadLegacy) {
          const refreshed = await api.getCart();
          applyCartState(refreshed, setters);
          return refreshed;
        }
      }

      applyCartState(cart, setters);
      return cart;
    } catch (err) {
      setError(err.message || 'Impossible de charger le panier');
      throw err;
    }
  }, [setters]);

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    async function loadCart() {
      setLoading(true);
      setItems([]);
      setSubtotal(0);
      setTotal(0);
      setItemCount(0);
      setDeliveryFee(0);
      try {
        await refreshCart();
      } catch {
        /* error state already set */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCart();

    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading, refreshCart]);

  const addItem = useCallback(
    async (item) => {
      setError(null);
      try {
        const cart = await api.addCartItem({
          productId: item.productId,
          colorId: item.colorId,
          size: item.size,
          quantity: Math.max(1, Number(item.quantity) || 1),
        });
        applyCartState(cart, setters);
        setLastAddedAt((prev) => Math.max(Date.now(), (prev || 0) + 1));
        return cart;
      } catch (err) {
        setError(err.message || 'Impossible d\'ajouter au panier');
        throw err;
      }
    },
    [setters],
  );

  const updateQuantity = useCallback(
    async (cartItemId, delta) => {
      const item = items.find((i) => i.cartItemId === cartItemId);
      if (!item) return;

      const newQty = item.quantity + delta;
      setError(null);

      try {
        if (newQty <= 0) {
          const cart = await api.removeCartItem(cartItemId);
          applyCartState(cart, setters);
          return cart;
        }

        if (delta > 0) {
          const cart = await api.addCartItem({
            productId: item.productId,
            colorId: item.colorId,
            size: item.size,
            quantity: delta,
          });
          applyCartState(cart, setters);
          return cart;
        }

        await api.removeCartItem(cartItemId);
        const cart = await api.addCartItem({
          productId: item.productId,
          colorId: item.colorId,
          size: item.size,
          quantity: newQty,
        });
        applyCartState(cart, setters);
        return cart;
      } catch (err) {
        setError(err.message || 'Impossible de mettre à jour la quantité');
        throw err;
      }
    },
    [items, setters],
  );

  const removeItem = useCallback(
    async (cartItemId) => {
      setError(null);
      try {
        const cart = await api.removeCartItem(cartItemId);
        applyCartState(cart, setters);
        return cart;
      } catch (err) {
        setError(err.message || 'Impossible de supprimer l\'article');
        throw err;
      }
    },
    [setters],
  );

  const clearCart = useCallback(() => {
    setItems([]);
    setSubtotal(0);
    setTotal(0);
    setItemCount(0);
    setDeliveryFee(0);
  }, []);

  const value = useMemo(
    () => ({
      items,
      deliveryFee,
      subtotal,
      total,
      itemCount,
      loading,
      error,
      lastAddedAt,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      refreshCart,
    }),
    [
      items,
      deliveryFee,
      subtotal,
      total,
      itemCount,
      loading,
      error,
      lastAddedAt,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      refreshCart,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
