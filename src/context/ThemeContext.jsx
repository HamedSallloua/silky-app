import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';

const DEFAULT_THEME = {
  primary: '#8D191C',
  secondary: '#F3EBEC',
  heroLeftImage: '/pictures/femme_example.jpg',
  heroRightImage: '/pictures/enfant_example.jpg',
};

const ThemeContext = createContext(null);

function parseHex(hex) {
  const n = hex.replace('#', '');
  const full = n.length === 3 ? n.split('').map((c) => c + c).join('') : n;
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function darkenHex(hex, amount = 0.15) {
  const { r, g, b } = parseHex(hex);
  const dr = Math.max(0, Math.floor(r * (1 - amount)));
  const dg = Math.max(0, Math.floor(g * (1 - amount)));
  const db = Math.max(0, Math.floor(b * (1 - amount)));
  return `#${((1 << 24) + (dr << 16) + (dg << 8) + db).toString(16).slice(1).toUpperCase()}`;
}

function applyThemeToDocument(theme) {
  const root = document.documentElement;
  const { r, g, b } = parseHex(theme.primary);
  root.style.setProperty('--color-primary', theme.primary);
  root.style.setProperty('--color-secondary', theme.secondary);
  root.style.setProperty('--color-primary-hover', darkenHex(theme.primary));
  root.style.setProperty('--color-secondary-muted', theme.secondary);
  root.style.setProperty('--color-primary-rgb', `${r}, ${g}, ${b}`);
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getTheme()
      .then((data) => {
        setTheme(data);
        applyThemeToDocument(data);
      })
      .catch(() => applyThemeToDocument(DEFAULT_THEME))
      .finally(() => setLoading(false));
  }, []);

  const updateTheme = async (nextTheme) => {
    const saved = await api.updateTheme(nextTheme);
    setTheme(saved);
    applyThemeToDocument(saved);
    return saved;
  };

  const refreshTheme = async () => {
    const data = await api.getTheme();
    setTheme(data);
    applyThemeToDocument(data);
    return data;
  };

  return (
    <ThemeContext.Provider value={{ theme, loading, updateTheme, refreshTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
