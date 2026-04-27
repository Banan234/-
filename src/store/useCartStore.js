import { createItemsStore } from './createItemsStore.js';

// Date.now() даёт коллизию при быстрых кликах (двойной клик «Добавить»
// на одной миллисекунде → одинаковый id, и updateItemQuantity дёргает обе строки).
function createManualId() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useCartStore = createItemsStore({
  name: 'yuzhural-cart',
  version: 1,
  withQuantity: true,
  prepareItem: (product) => ({
    ...product,
    quantity: product.quantity || 1,
  }),
  mergeItem: (existingItem, product) => ({
    ...existingItem,
    quantity: existingItem.quantity + (product.quantity || 1),
  }),
  createExtraActions: ({ set, get }) => ({
    addManualItem: (item) =>
      set((state) => ({
        items: [
          ...state.items,
          {
            id: `manual-${createManualId()}`,
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

    clearCart: () => get().clearItems(),
  }),
});
