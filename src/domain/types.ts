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