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
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const migratedRef = useRef(false);

  const refreshFavorites = useCallback(async () => {
    try {
      setError(null);
      const result = await api.getFavourites();

      if (!migratedRef.current) {
        migratedRef.current = true;
        const hadLegacy = Boolean(localStorage.getItem(LEGACY_STORAGE_KEY));
        await migrateLegacyFavorites(result.productIds);
        if (hadLegacy) {
          const refreshed = await api.getFavourites();
          setFavoriteIds(refreshed.productIds);
          return refreshed.productIds;
        }
      }

      setFavoriteIds(result.productIds);
      return result.productIds;
    } catch (err) {
      setError(err.message || 'Impossible de charger les favoris');
      throw err;
    }
  }, []);

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
    (productId) => favoriteIds.includes(productId),
    [favoriteIds],
  );

  const toggleFavorite = useCallback(
    async (productId) => {
      if (user?.role === 'admin') {
        const msg = 'Les administrateurs ne peuvent pas ajouter de produits aux favoris.';
        setError(msg);
        throw new Error(msg);
      }
      setError(null);
      try {
        await api.toggleFavourite(productId);
        const ids = await refreshFavorites();
        return ids.includes(productId);
      } catch (err) {
        setError(err.message || 'Impossible de mettre à jour les favoris');
        throw err;
      }
    },
    [user?.role, refreshFavorites],
  );

  const removeFavorite = useCallback(
    async (productId) => {
      if (!favoriteIds.includes(productId)) return;
      await toggleFavorite(productId);
    },
    [favoriteIds, toggleFavorite],
  );

  const value = useMemo(
    () => ({
      favoriteIds,
      loading,
      error,
      isFavorite,
      toggleFavorite,
      removeFavorite,
      refreshFavorites,
    }),
    [favoriteIds, loading, error, isFavorite, toggleFavorite, removeFavorite, refreshFavorites],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
}
