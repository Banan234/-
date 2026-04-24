import { create } from 'zustand';
import { loadStoredJson, saveStoredJson } from '../lib/browserStorage';

const FAVORITES_STORAGE_KEY = 'yuzhural-favorites';

function loadFavoritesFromStorage() {
  const parsedFavorites = loadStoredJson(FAVORITES_STORAGE_KEY, []);

  return Array.isArray(parsedFavorites) ? parsedFavorites : [];
}

function saveFavoritesToStorage(items) {
  saveStoredJson(FAVORITES_STORAGE_KEY, items);
}

export const useFavoritesStore = create((set, get) => ({
  items: loadFavoritesFromStorage(),

  addItem: (product) =>
    set((state) => {
      const exists = state.items.some((item) => item.id === product.id);

      if (exists) {
        return state;
      }

      const updatedItems = [...state.items, product];
      saveFavoritesToStorage(updatedItems);

      return { items: updatedItems };
    }),

  removeItem: (id) =>
    set((state) => {
      const updatedItems = state.items.filter((item) => item.id !== id);
      saveFavoritesToStorage(updatedItems);

      return { items: updatedItems };
    }),

  toggleItem: (product) => {
    const exists = get().items.some((item) => item.id === product.id);

    if (exists) {
      get().removeItem(product.id);
      return;
    }

    get().addItem(product);
  },

  isFavorite: (id) => get().items.some((item) => item.id === id),

  clearFavorites: () => {
    saveFavoritesToStorage([]);
    set({ items: [] });
  },
}));
