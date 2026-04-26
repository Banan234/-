import { createItemsStore } from './createItemsStore.js';

export const useFavoritesStore = createItemsStore({
  name: 'yuzhural-favorites',
  version: 1,
  createExtraActions: ({ get }) => ({
    toggleItem: (product) => {
      const exists = get().items.some((item) => item.id === product.id);
      if (exists) {
        get().removeItem(product.id);
        return;
      }
      get().addItem(product);
    },

    isFavorite: (id) => get().items.some((item) => item.id === id),

    clearFavorites: () => get().clearItems(),
  }),
});
