import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMigratingItemsStorage } from '../lib/browserStorage';

export const useCartStore = create(
  persist(
    (set) => ({
      items: [],

      addItem: (product) =>
        set((state) => {
          const existingItem = state.items.find((item) => item.id === product.id);

          if (existingItem) {
            return {
              items: state.items.map((item) =>
                item.id === product.id
                  ? { ...item, quantity: item.quantity + (product.quantity || 1) }
                  : item
              ),
            };
          }

          return {
            items: [
              ...state.items,
              { ...product, quantity: product.quantity || 1 },
            ],
          };
        }),

      addManualItem: (item) =>
        set((state) => ({
          items: [
            ...state.items,
            {
              id: `manual-${Date.now()}`,
              slug: '',
              sku: '',
              image: '/product-placeholder.svg',
              category: 'Ручная позиция',
              price: 0,
              unit: 'м',
              manual: true,
              ...item,
              quantity: item.quantity || 1,
            },
          ],
        })),

      updateItemQuantity: (id, quantity) =>
        set((state) => {
          const nextQuantity = Math.max(0, Number(quantity) || 0);
          return {
            items: state.items
              .map((item) =>
                item.id === id ? { ...item, quantity: nextQuantity } : item
              )
              .filter((item) => item.quantity > 0),
          };
        }),

      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        })),

      decreaseItem: (id) =>
        set((state) => ({
          items: state.items
            .map((item) =>
              item.id === id ? { ...item, quantity: item.quantity - 1 } : item
            )
            .filter((item) => item.quantity > 0),
        })),

      clearCart: () => set({ items: [] }),
    }),
    {
      name: 'yuzhural-cart',
      storage: createJSONStorage(() => createMigratingItemsStorage()),
      partialize: (state) => ({ items: state.items }),
      version: 1,
    }
  )
);
