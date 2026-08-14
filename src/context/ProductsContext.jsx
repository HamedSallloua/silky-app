import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';

const ProductsContext = createContext(null);

const STORAGE_KEY = 'silky_products_state';

function getStoredProducts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredProducts(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore storage errors */
  }
}

function normalizeProductState(p) {
  if (!p) return p;
  const colors = (p.colors || []).map((c) => {
    const rawImages = (c.images || (c.image ? [c.image] : []))
      .map((img) => (typeof img === 'string' ? img.trim() : ''))
      .filter(Boolean);
    const mainImg = rawImages[0] || c.image || p.mainImage || '';
    return {
      ...c,
      image: mainImg,
      images: rawImages.length ? rawImages : mainImg ? [mainImg] : [],
    };
  });

  const allThumbnails = p.thumbnails?.length
    ? p.thumbnails
    : colors.flatMap((c) => c.images).filter(Boolean);

  return {
    ...p,
    colors,
    thumbnails: allThumbnails.length ? allThumbnails : [p.mainImage].filter(Boolean),
    isHidden: p.isHidden === true || p.is_active === false,
    is_active: !(p.isHidden === true || p.is_active === false),
  };
}

export function ProductsProvider({ children }) {
  const [products, setProducts] = useState(() => {
    const stored = getStoredProducts();
    return stored ? stored.map(normalizeProductState) : [];
  });
  const [loading, setLoading] = useState(true);

  const refreshProducts = useCallback(async () => {
    try {
      const data = await api.getProducts({ includeHidden: true });
      const list = (data || []).map(normalizeProductState);

      setProducts(list);
      saveStoredProducts(list);
      return list;
    } catch (err) {
      console.warn('Failed to fetch products from backend, using stored cache:', err);
      const stored = getStoredProducts();
      if (stored && Array.isArray(stored)) {
        const list = stored.map(normalizeProductState);
        setProducts(list);
        return list;
      }
      setProducts([]);
      return [];
    }
  }, []);

  useEffect(() => {
    refreshProducts().finally(() => setLoading(false));
  }, [refreshProducts]);

  const getProduct = useCallback((id) => products.find((p) => p.id === id), [products]);

  const getByCategory = useCallback(
    (category, includeHidden = false) =>
      products.filter((p) => p.category === category && (includeHidden || !p.isHidden)),
    [products],
  );

  const visibleProducts = products.filter((p) => !p.isHidden);

  const addProduct = useCallback(async (product) => {
    const isHiddenBool = product.isHidden === true || product.is_active === false;
    let created = normalizeProductState({ ...product, isHidden: isHiddenBool });

    try {
      const saved = await api.createProduct(product);
      if (saved) created = normalizeProductState(saved);
    } catch (err) {
      console.warn('Backend createProduct failed, saving locally:', err);
    }

    setProducts((current) => {
      const next = [...current, created];
      saveStoredProducts(next);
      return next;
    });
    return created;
  }, []);

  const updateProduct = useCallback(async (id, updates) => {
    const isHiddenBool = updates.isHidden === true || updates.is_active === false;
    let savedProduct = normalizeProductState({ ...updates, isHidden: isHiddenBool });

    try {
      const saved = await api.updateProduct(id, updates);
      if (saved) savedProduct = normalizeProductState(saved);
    } catch (err) {
      console.warn('Backend updateProduct failed, saving locally:', err);
    }

    setProducts((current) => {
      const next = current.map((p) => (p.id === id ? { ...p, ...savedProduct } : p));
      saveStoredProducts(next);
      return next;
    });
    return savedProduct;
  }, []);

  const deleteProduct = useCallback(async (id) => {
    try {
      await api.deleteProduct(id);
    } catch (err) {
      console.warn('Backend deleteProduct failed, deleting locally:', err);
    }

    setProducts((current) => {
      const next = current.filter((p) => p.id !== id);
      saveStoredProducts(next);
      return next;
    });
  }, []);

  return (
    <ProductsContext.Provider
      value={{
        products,
        visibleProducts,
        loading,
        getProduct,
        getByCategory,
        addProduct,
        updateProduct,
        deleteProduct,
        refreshProducts,
      }}
    >
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error('useProducts must be used within ProductsProvider');
  return ctx;
}
