export interface DietaryFlags {
  isVegetarian: boolean;
  isVegan: boolean;
  isGlutenFree: boolean;
  isLactoseFree: boolean;
}

export interface ProductDefinition {
    ean: string;
    name: string;
    brand?: string;
    imageUrl?: string;
    category?: string;
    dietary?: DietaryFlags;
  }
  
  export interface InventoryItem extends ProductDefinition {
    id: string; // UUID
    expiryDate: string | null; // ISO 8601 (YYYY-MM-DD) or null when unknown
    openedAt?: string | null;
    isOpened: boolean;
  }

export type CatalogProductKind = 'generic' | 'specific';

export interface CatalogProduct {
  id: string;
  name: string;
  normalizedName: string;
  kind: CatalogProductKind;
  productEan: string | null;
  imageUrl: string | null;
  parentCatalogProductId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ShoppingListType = 'manual' | 'auto';

export type ShoppingListIconKey = string;

export type ShoppingListIconColorKey = string;

export type ShoppingItemStatus = 'planned' | 'purchased' | 'stored';

export type ShoppingItemSource = 'manual' | 'suggestion' | 'reactivated';

export interface ShoppingListSummary {
  id: string;
  name: string;
  type: ShoppingListType;
  iconKey: ShoppingListIconKey;
  iconColorKey: ShoppingListIconColorKey;
  isLocked: boolean;
  sortOrder: number;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingListItem {
  id: string;
  listId: string;
  catalogProductId: string | null;
  linkedCatalogProducts: CatalogProduct[];
  label: string;
  iconKey: ShoppingListIconKey;
  iconColorKey: ShoppingListIconColorKey;
  imageUrl: string | null;
  quantity: number;
  sortOrder: number;
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
  catalogProductId: string | null;
  linkedCatalogProductIds: string[];
  name: string;
  normalizedName: string;
  iconKey?: ShoppingListIconKey;
  iconColorKey?: ShoppingListIconColorKey;
  imageUrl?: string | null;
  missingQuantity: number;
  currentQuantity: number;
  targetQuantity: number;
  reason: string;
  priority: 'out' | 'low';
  sourceAutoListIds: string[];
  sourceAutoListNames: string[];
}
