import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMigratingItemsStorage } from '../lib/browserStorage.js';

const identity = (item) => item;
const keepExistingItem = (existingItem) => existingItem;
const createNoExtraActions = () => ({});

export function createItemsStore({
  name,
  version = 1,
  prepareItem = identity,
  mergeItem = keepExistingItem,
  withQuantity = false,
  createExtraActions = createNoExtraActions,
}) {
  if (!name) {
    throw new Error('createItemsStore requires a storage name');
  }

  return create(
    persist(
      (set, get) => {
        const baseActions = {
          items: [],

          addItem: (item) =>
            set((state) => {
              const nextItem = prepareItem(item, state);
              const existingItem = state.items.find(
                (currentItem) => currentItem.id === nextItem.id
              );

              if (existingItem) {
                const mergedItem = mergeItem(existingItem, nextItem, state);
                if (mergedItem === existingItem) return state;

                return {
                  items: state.items.map((currentItem) =>
                    currentItem.id === nextItem.id ? mergedItem : currentItem
                  ),
                };
              }

              return { items: [...state.items, nextItem] };
            }),

          removeItem: (id) =>
            set((state) => ({
              items: state.items.filter((item) => item.id !== id),
            })),

          clearItems: () => set({ items: [] }),
        };

        const quantityActions = withQuantity
          ? {
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

              decreaseItem: (id) =>
                set((state) => ({
                  items: state.items
                    .map((item) =>
                      item.id === id
                        ? { ...item, quantity: item.quantity - 1 }
                        : item
                    )
                    .filter((item) => item.quantity > 0),
                })),
            }
          : {};

        return {
          ...baseActions,
          ...quantityActions,
          ...createExtraActions({ set, get }),
        };
      },
      {
        name,
        storage: createJSONStorage(() => createMigratingItemsStorage()),
        partialize: (state) => ({ items: state.items }),
        version,
      }
    )
  );
}
