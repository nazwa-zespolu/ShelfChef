import {
  AutoShoppingListItemState,
  CatalogProduct,
  InventoryItem,
  ShoppingListIconColorKey,
  ShoppingListIconKey,
  ShoppingItemStatus,
  ShoppingListItem,
  ShoppingListSummary,
  ShoppingListType,
  ShoppingSuggestion,
} from '../domain/types';
import type {ProductRepository} from '../infrastructure/ProductRepository';
import type {
  AddAllSuggestionsSummary,
  AddShoppingItemInput,
  CompletePurchaseResult,
  ShoppingListRepository,
} from '../infrastructure/ShoppingListRepository';

declare const require: any;

type ShoppingListDetails = {
  list: ShoppingListSummary;
  items: AutoShoppingListItemState[];
};

type CompletePurchasePayload = Record<string, string | null>;

type CatalogIndex = {
  byId: Map<string, CatalogProduct>;
  specificByEan: Map<string, CatalogProduct>;
};

export class ShoppingList {
  private shoppingRepository?: ShoppingListRepository;
  private productRepository?: ProductRepository;

  constructor(
    shoppingRepository?: ShoppingListRepository,
    productRepository?: ProductRepository,
  ) {
    this.shoppingRepository = shoppingRepository;
    this.productRepository = productRepository;
  }

  async createList(
    name: string,
    type: ShoppingListType,
    iconKey?: ShoppingListIconKey,
    iconColorKey?: ShoppingListIconColorKey,
  ): Promise<ShoppingListSummary> {
    const repository = this.requireShoppingRepository();
    return iconKey == null && iconColorKey == null
      ? repository.createList(name, type)
      : repository.createList(name, type, iconKey, iconColorKey);
  }

  async addItem(listId: string, input: AddShoppingItemInput): Promise<ShoppingListItem> {
    return this.requireShoppingRepository().addItem(listId, input);
  }

  async getListWithEffectiveStatuses(listId: string): Promise<ShoppingListDetails> {
    const list = await this.requireList(listId);
    const items = await this.requireShoppingRepository().getItems(listId);
    if (list.type === 'manual') {
      const catalogIndex = await this.loadCatalogIndex();
      const inventory = await this.loadFreshInventory();
      return {
        list,
        items: items.map(item => this.toManualItemState(item, catalogIndex, inventory)),
      };
    }

    if (list.isLocked) {
      return {
        list,
        items: items.map(item => this.toStaticItemState(item)),
      };
    }

    const catalogIndex = await this.loadCatalogIndex();
    const inventory = await this.loadFreshInventory();
    const usedInventoryIds = new Set<string>();
    return {
      list,
      items: items.map(item =>
        this.toEffectiveAutoItemState(item, catalogIndex, inventory, usedInventoryIds),
      ),
    };
  }

  async setListLocked(listId: string, locked: boolean): Promise<void> {
    const list = await this.requireList(listId);
    if (list.type !== 'auto') {
      throw new Error('Only auto shopping lists can be locked');
    }

    if (locked && !list.isLocked) {
      const details = await this.getListWithEffectiveStatuses(listId);
      for (const item of details.items) {
        if (item.status !== 'purchased' && this.isLockSnapshotStatus(item.effectiveStatus)) {
          await this.requireShoppingRepository().updateItemStatusSnapshot(
            item.id,
            item.effectiveStatus,
          );
        }
      }
    }

    await this.requireShoppingRepository().setListLocked(listId, locked);
  }

  async generateReplenishmentSuggestions(): Promise<ShoppingSuggestion[]> {
    const lists = (await this.requireShoppingRepository().getLists()).filter(
      list => list.type === 'auto' && !list.isLocked,
    );
    if (lists.length === 0) {
      return [];
    }

    const catalogIndex = await this.loadCatalogIndex();
    const inventory = await this.loadFreshInventory();
    const usedInventoryIds = new Set<string>();
    const displayQuantityByInventoryKey = new Map<string, number>();
    const consumedQuantityByInventoryKey = new Map<string, number>();
    const grouped = new Map<string, ShoppingSuggestion>();

    for (const list of lists) {
      const items = await this.requireShoppingRepository().getItems(list.id);
      for (const item of items) {
        if (item.status === 'purchased') {
          continue;
        }

        const catalogProduct = item.catalogProductId
          ? catalogIndex.byId.get(item.catalogProductId) ?? null
          : null;
        const normalizedName = catalogProduct?.normalizedName ?? normalizeProductName(item.label);
        const inventoryKey = this.buildItemInventoryKey(item, catalogProduct, normalizedName);
        const groupKey = inventoryKey;
        const suggestionName = catalogProduct?.name ?? item.label;

        let displayQuantity = displayQuantityByInventoryKey.get(inventoryKey);
        if (displayQuantity == null) {
          displayQuantity = this.countFreshInventoryForItem(
            item,
            catalogProduct,
            catalogIndex,
            inventory,
          );
          displayQuantityByInventoryKey.set(inventoryKey, displayQuantity);
        }

        let consumedQuantity = consumedQuantityByInventoryKey.get(inventoryKey);
        if (consumedQuantity == null) {
          consumedQuantity = this.consumeFreshInventoryForItem(
            item,
            catalogProduct,
            catalogIndex,
            inventory,
            usedInventoryIds,
            item.quantity,
          );
          consumedQuantityByInventoryKey.set(inventoryKey, consumedQuantity);
        }
        const missingQuantity = Math.max(0, item.quantity - consumedQuantity);
        if (missingQuantity === 0) {
          continue;
        }

        const existing = grouped.get(groupKey);
        if (!existing) {
          grouped.set(groupKey, {
            catalogProductId: catalogProduct?.id ?? null,
            linkedCatalogProductIds: item.linkedCatalogProducts.map(product => product.id),
            name: suggestionName,
            normalizedName,
            iconKey: item.iconKey,
            iconColorKey: item.iconColorKey,
            imageUrl: item.imageUrl ?? catalogProduct?.imageUrl ?? null,
            missingQuantity,
            currentQuantity: displayQuantity,
            targetQuantity: item.quantity,
            reason: this.buildMissingReason(displayQuantity, item.quantity),
            priority: displayQuantity === 0 ? 'out' : 'low',
            sourceAutoListIds: [list.id],
            sourceAutoListNames: [list.name],
          });
          continue;
        }

        if (!existing.sourceAutoListIds.includes(list.id)) {
          existing.sourceAutoListIds.push(list.id);
          existing.sourceAutoListNames.push(list.name);
        }
        existing.linkedCatalogProductIds = Array.from(
          new Set([
            ...existing.linkedCatalogProductIds,
            ...item.linkedCatalogProducts.map(product => product.id),
          ]),
        );
        if (missingQuantity > existing.missingQuantity) {
          existing.missingQuantity = missingQuantity;
          existing.currentQuantity = displayQuantity;
          existing.targetQuantity = item.quantity;
          existing.iconKey = item.iconKey;
          existing.iconColorKey = item.iconColorKey;
          existing.imageUrl = item.imageUrl ?? catalogProduct?.imageUrl ?? null;
          existing.reason = this.buildMissingReason(displayQuantity, item.quantity);
          existing.priority = displayQuantity === 0 ? 'out' : 'low';
        }
      }
    }

    return Array.from(grouped.values()).sort(
      (a, b) =>
        b.missingQuantity - a.missingQuantity ||
        a.name.localeCompare(b.name),
    );
  }

  async addAllSuggestionsToList(
    targetManualListId: string,
  ): Promise<AddAllSuggestionsSummary> {
    const suggestions = await this.generateReplenishmentSuggestions();
    return this.requireShoppingRepository().addAllSuggestionsToManualList(
      targetManualListId,
      suggestions,
    );
  }

  async updateItemStatus(itemId: string, status: ShoppingItemStatus): Promise<void> {
    return this.requireShoppingRepository().updateItemStatus(itemId, status);
  }

  async completePurchase(
    listId: string,
    payload: CompletePurchasePayload = {},
  ): Promise<CompletePurchaseResult> {
    return this.requireShoppingRepository().completePurchase(listId, payload);
  }

  private async requireList(listId: string): Promise<ShoppingListSummary> {
    const list = await this.requireShoppingRepository().getListById(listId);
    if (!list) {
      throw new Error(`Shopping list not found: ${listId}`);
    }
    return list;
  }

  private async loadCatalogIndex(): Promise<CatalogIndex> {
    const products = await this.requireShoppingRepository().getCatalogProducts();
    return {
      byId: new Map(products.map(product => [product.id, product])),
      specificByEan: new Map(
        products
          .filter(product => product.kind === 'specific' && product.productEan)
          .map(product => [product.productEan as string, product]),
      ),
    };
  }

  private async loadFreshInventory(): Promise<InventoryItem[]> {
    const todayIso = new Date().toISOString().slice(0, 10);
    const inventory = await this.requireProductRepository().getFullInventory();
    return inventory.filter(
      item => item.expiryDate == null || item.expiryDate >= todayIso,
    );
  }

  private toEffectiveAutoItemState(
    item: ShoppingListItem,
    catalogIndex: CatalogIndex,
    inventory: InventoryItem[],
    usedInventoryIds: Set<string>,
  ): AutoShoppingListItemState {
    if (!item.catalogProductId) {
      const displayQuantity = this.countFreshInventoryForItem(
        item,
        null,
        catalogIndex,
        inventory,
      );
      const consumedQuantity = this.consumeFreshInventoryForItem(
        item,
        null,
        catalogIndex,
        inventory,
        usedInventoryIds,
        item.quantity,
      );
      const missingQuantity = Math.max(0, item.quantity - consumedQuantity);
      return {
        ...item,
        effectiveStatus: this.resolveAutoEffectiveStatus(item.status, missingQuantity),
        currentQuantity: displayQuantity,
        missingQuantity: item.status === 'purchased' ? 0 : missingQuantity,
      };
    }

    const catalogProduct = catalogIndex.byId.get(item.catalogProductId);
    if (!catalogProduct) {
      return this.toStaticItemState(item);
    }

    const displayQuantity = this.countFreshInventoryForItem(
      item,
      catalogProduct,
      catalogIndex,
      inventory,
    );
    const consumedQuantity = this.consumeFreshInventoryForItem(
      item,
      catalogProduct,
      catalogIndex,
      inventory,
      usedInventoryIds,
      item.quantity,
    );
    const missingQuantity = Math.max(0, item.quantity - consumedQuantity);
    return {
      ...item,
      effectiveStatus: this.resolveAutoEffectiveStatus(item.status, missingQuantity),
      currentQuantity: displayQuantity,
      missingQuantity: item.status === 'purchased' ? 0 : missingQuantity,
    };
  }

  private toStaticItemState(item: ShoppingListItem): AutoShoppingListItemState {
    const normalizedStatus = item.status === 'unavailable' ? 'planned' : item.status;
    const currentQuantity = normalizedStatus === 'stored' ? item.quantity : 0;
    return {
      ...item,
      effectiveStatus: normalizedStatus,
      currentQuantity,
      missingQuantity: normalizedStatus === 'planned' ? item.quantity : 0,
    };
  }

  private toManualItemState(
    item: ShoppingListItem,
    catalogIndex: CatalogIndex,
    inventory: InventoryItem[],
  ): AutoShoppingListItemState {
    const currentQuantity = this.countInventoryForItem(item, catalogIndex, inventory);
    const effectiveStatus = item.status === 'purchased' ? 'purchased' : 'planned';
    return {
      ...item,
      effectiveStatus,
      currentQuantity,
      missingQuantity: effectiveStatus === 'planned'
        ? Math.max(0, item.quantity - currentQuantity)
        : 0,
    };
  }

  private countInventoryForItem(
    item: ShoppingListItem,
    catalogIndex: CatalogIndex,
    inventory: InventoryItem[],
  ): number {
    const catalogProduct = item.catalogProductId
      ? catalogIndex.byId.get(item.catalogProductId) ?? null
      : null;
    return this.countFreshInventoryForItem(item, catalogProduct, catalogIndex, inventory);
  }

  private consumeFreshInventoryForItem(
    shoppingItem: ShoppingListItem,
    catalogProduct: CatalogProduct | null,
    catalogIndex: CatalogIndex,
    inventory: InventoryItem[],
    usedInventoryIds: Set<string>,
    maxQuantity: number,
  ): number {
    let count = 0;
    for (const inventoryItem of inventory) {
      if (count >= maxQuantity) {
        break;
      }
      if (usedInventoryIds.has(inventoryItem.id)) {
        continue;
      }
      if (!this.inventoryMatchesShoppingItem(
        inventoryItem,
        catalogProduct,
        catalogIndex,
        shoppingItem,
      )) {
        continue;
      }
      usedInventoryIds.add(inventoryItem.id);
      count += 1;
    }
    return count;
  }

  private countFreshInventoryForItem(
    shoppingItem: ShoppingListItem,
    catalogProduct: CatalogProduct | null,
    catalogIndex: CatalogIndex,
    inventory: InventoryItem[],
  ): number {
    let count = 0;
    for (const item of inventory) {
      if (this.inventoryMatchesShoppingItem(item, catalogProduct, catalogIndex, shoppingItem)) {
        count += 1;
      }
    }
    return count;
  }

  private buildItemInventoryKey(
    item: ShoppingListItem,
    catalogProduct: CatalogProduct | null,
    normalizedName: string,
  ): string {
    const linkedIds = item.linkedCatalogProducts
      .map(product => product.id)
      .sort()
      .join(',');
    if (linkedIds) {
      return `linked:${catalogProduct?.id ?? normalizedName}:${linkedIds}`;
    }
    return catalogProduct ? `catalog:${catalogProduct.id}` : `text:${normalizedName}`;
  }

  private resolveAutoEffectiveStatus(
    status: ShoppingItemStatus,
    missingQuantity: number,
  ): ShoppingItemStatus {
    if (status === 'purchased') {
      return 'purchased';
    }
    return missingQuantity === 0 ? 'stored' : 'planned';
  }

  private inventoryMatchesCatalogProduct(
    item: InventoryItem,
    catalogProduct: CatalogProduct,
    catalogIndex: CatalogIndex,
  ): boolean {
    if (catalogProduct.kind === 'specific') {
      return catalogProduct.productEan != null && item.ean === catalogProduct.productEan;
    }

    if (item.ean) {
      const specificParentId = catalogIndex.specificByEan.get(item.ean)?.parentCatalogProductId;
      if (specificParentId === catalogProduct.id) {
        return true;
      }
    }

    return normalizeProductName(item.name) === catalogProduct.normalizedName;
  }

  private inventoryMatchesShoppingItem(
    inventoryItem: InventoryItem,
    catalogProduct: CatalogProduct | null,
    catalogIndex: CatalogIndex,
    shoppingItem: ShoppingListItem,
  ): boolean {
    if (
      catalogProduct &&
      this.inventoryMatchesCatalogProduct(inventoryItem, catalogProduct, catalogIndex)
    ) {
      return true;
    }

    if (
      !catalogProduct &&
      normalizeProductName(inventoryItem.name) === normalizeProductName(shoppingItem.label)
    ) {
      return true;
    }

    return shoppingItem.linkedCatalogProducts.some(product =>
      this.inventoryMatchesCatalogProduct(inventoryItem, product, catalogIndex),
    );
  }

  private isLockSnapshotStatus(status: ShoppingItemStatus): status is 'planned' | 'stored' {
    return status === 'planned' || status === 'stored';
  }

  private buildMissingReason(currentQuantity: number, targetQuantity: number): string {
    return `Masz ${currentQuantity} z ${targetQuantity}`;
  }

  private requireShoppingRepository(): ShoppingListRepository {
    if (!this.shoppingRepository) {
      this.shoppingRepository =
        new (require('../infrastructure/ShoppingListRepository').ShoppingListRepository)();
    }
    return this.shoppingRepository as ShoppingListRepository;
  }

  private requireProductRepository(): ProductRepository {
    if (!this.productRepository) {
      this.productRepository =
        new (require('../infrastructure/ProductRepository').ProductRepository)();
    }
    return this.productRepository as ProductRepository;
  }
}

function normalizeProductName(name: string): string {
  return name.trim().toLowerCase();
}
