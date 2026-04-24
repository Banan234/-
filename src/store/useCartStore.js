import { create } from 'zustand';
import { loadStoredJson, saveStoredJson } from '../lib/browserStorage';

const CART_STORAGE_KEY = 'yuzhural-cart';

function loadCartFromStorage() {
  const parsedCart = loadStoredJson(CART_STORAGE_KEY, []);

  return Array.isArray(parsedCart) ? parsedCart : [];
}

function saveCartToStorage(items) {
  saveStoredJson(CART_STORAGE_KEY, items);
}

export const useCartStore = create((set) => ({
  items: loadCartFromStorage(),

  addItem: (product) =>
    set((state) => {
      const existingItem = state.items.find((item) => item.id === product.id);

      let updatedItems;

      if (existingItem) {
        updatedItems = state.items.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: item.quantity + (product.quantity || 1),
              }
            : item
        );
      } else {
        updatedItems = [
          ...state.items,
          { ...product, quantity: product.quantity || 1 },
        ];
      }

      saveCartToStorage(updatedItems);

      return { items: updatedItems };
    }),

  removeItem: (id) =>
    set((state) => {
      const updatedItems = state.items.filter((item) => item.id !== id);

      saveCartToStorage(updatedItems);

      return { items: updatedItems };
    }),

  decreaseItem: (id) =>
    set((state) => {
      const updatedItems = state.items
        .map((item) =>
          item.id === id ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0);

      saveCartToStorage(updatedItems);

      return { items: updatedItems };
    }),

  clearCart: () => {
    saveCartToStorage([]);
    set({ items: [] });
  },
}));
