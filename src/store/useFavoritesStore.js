import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMigratingItemsStorage } from '../lib/browserStorage';

export const useFavoritesStore = create(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product) =>
        set((state) => {
          if (state.items.some((item) => item.id === product.id)) {
            return state;
          }
          return { items: [...state.items, product] };
        }),

      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        })),

      toggleItem: (product) => {
        const exists = get().items.some((item) => item.id === product.id);
        if (exists) {
          get().removeItem(product.id);
          return;
        }
        get().addItem(product);
      },

      isFavorite: (id) => get().items.some((item) => item.id === id),

      clearFavorites: () => set({ items: [] }),
    }),
    {
      name: 'yuzhural-favorites',
      storage: createJSONStorage(() => createMigratingItemsStorage()),
      partialize: (state) => ({ items: state.items }),
      version: 1,
    }
  )
);
