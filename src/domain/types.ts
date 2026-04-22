export interface ProductDefinition {
    ean: string;
    name: string;
    brand?: string;
    imageUrl?: string;
    category?: string;
  }
  
  export interface InventoryItem extends ProductDefinition {
    id: string; // UUID
    expiryDate: string; // ISO 8601
    openedAt?: string;
    isOpened: boolean;
  }