import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

const LEGACY_STORAGE_KEY = 'silky_favorites';

const FavoritesContext = createContext(null);

async function migrateLegacyFavorites(serverIds) {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return;

    localStorage.removeItem(LEGACY_STORAGE_KEY);

    if (serverIds.length > 0) return;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;

    for (const productId of parsed.filter(Boolean)) {
      try {
        await api.toggleFavourite(productId);
      } catch {
        /* skip invalid legacy favourites */
      }
    }
  } catch {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
}

export function FavoritesProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const migratedRef = useRef(false);

  const applyFavoritesData = useCallback((result) => {
    const favItems = result?.favourites || result?.items || [];
    const pIds = result?.productIds || Array.from(new Set(favItems.map((f) => f.productId)));
    setItems(favItems);
    setFavoriteIds(pIds);
    return favItems;
  }, []);

  const refreshFavorites = useCallback(async () => {
    try {
      setError(null);
      const result = await api.getFavourites();

      if (!migratedRef.current) {
        migratedRef.current = true;
        const hadLegacy = Boolean(localStorage.getItem(LEGACY_STORAGE_KEY));
        const currentPIds = result?.productIds || [];
        await migrateLegacyFavorites(currentPIds);
        if (hadLegacy) {
          const refreshed = await api.getFavourites();
          return applyFavoritesData(refreshed);
        }
      }

      return applyFavoritesData(result);
    } catch (err) {
      setError(err.message || 'Impossible de charger les favoris');
      throw err;
    }
  }, [applyFavoritesData]);

  useEffect(() => {
    if (authLoading) return;

    // Reset migration flag when identity changes (e.g. guest → guest after logout)
    migratedRef.current = false;

    let cancelled = false;

    async function loadFavorites() {
      setLoading(true);
      try {
        await refreshFavorites();
      } catch {
        /* error state already set */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadFavorites();

    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading, refreshFavorites]);

  const isFavorite = useCallback(
    (productId, variantId = null) => {
      if (!productId) return false;
      if (variantId) {
        return items.some(
          (item) => item.productId === productId && item.variantId === variantId
        );
      }
      // If variantId is not specified, check if any favorite exists for this product
      return items.some((item) => item.productId === productId);
    },
    [items],
  );

  const toggleFavorite = useCallback(
    async (payload) => {
      if (user?.role === 'admin') {
        const msg = 'Les administrateurs ne peuvent pas ajouter de produits aux favoris.';
        setError(msg);
        throw new Error(msg);
      }
      setError(null);
      try {
        const body = typeof payload === 'string' ? { productId: payload } : payload;
        const res = await api.toggleFavourite(body);
        if (res?.favourites || res?.items) {
          applyFavoritesData(res);
          return res.isFavourite;
        }
        const updated = await refreshFavorites();
        return updated;
      } catch (err) {
        setError(err.message || 'Impossible de mettre à jour les favoris');
        throw err;
      }
    },
    [user?.role, applyFavoritesData, refreshFavorites],
  );

  const removeFavorite = useCallback(
    async (payload) => {
      const body = typeof payload === 'string' ? { productId: payload } : payload;
      await toggleFavorite(body);
    },
    [toggleFavorite],
  );

  const value = useMemo(
    () => ({
      items,
      favorites: items,
      favoriteIds,
      loading,
      error,
      isFavorite,
      toggleFavorite,
      removeFavorite,
      refreshFavorites,
    }),
    [items, favoriteIds, loading, error, isFavorite, toggleFavorite, removeFavorite, refreshFavorites],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
}
