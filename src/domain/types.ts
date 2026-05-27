export interface ProductDefinition {
    ean: string;
    name: string;
    brand?: string;
    imageUrl?: string;
    category?: string;
  }
  
  export interface InventoryItem extends ProductDefinition {
    id: string; // UUID
    expiryDate: string | null; // ISO 8601 (YYYY-MM-DD) or null when unknown
    openedAt?: string;
    isOpened: boolean;
  }

export type CatalogProductKind = 'generic' | 'specific';

export interface CatalogProduct {
  id: string;
  name: string;
  normalizedName: string;
  kind: CatalogProductKind;
  productEan: string | null;
  parentCatalogProductId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ShoppingListType = 'manual' | 'auto';

export type ShoppingItemStatus = 'planned' | 'purchased' | 'unavailable' | 'stored';

export type ShoppingItemSource = 'manual' | 'suggestion' | 'reactivated';

export interface ShoppingListSummary {
  id: string;
  name: string;
  type: ShoppingListType;
  isLocked: boolean;
  isArchived: boolean;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingListItem {
  id: string;
  listId: string;
  catalogProductId: string | null;
  label: string;
  quantity: number;
  status: ShoppingItemStatus;
  source: ShoppingItemSource;
  storedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutoShoppingListItemState extends ShoppingListItem {
  effectiveStatus: ShoppingItemStatus;
  currentQuantity: number;
  missingQuantity: number;
}

export interface ShoppingSuggestion {
  catalogProductId: string;
  name: string;
  normalizedName: string;
  missingQuantity: number;
  currentQuantity: number;
  targetQuantity: number;
  reason: string;
  priority: 'out' | 'low';
  sourceAutoListIds: string[];
  sourceAutoListNames: string[];
}
