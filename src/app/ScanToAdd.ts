import { ProductDefinition } from "../domain/types";

export interface ScanToAddInput {
  ean: string;
}

export interface ScanToAddDatabaseService {
  findDefinitionByEan: (ean: string) => Promise<ProductDefinition | null>;
  saveDefinition: (template: ProductDefinition) => Promise<void>;
}

export interface ScanToAddOpenFoodFactsService {
  fetchProductByEAN: (ean: string) => Promise<ProductDefinition>;
}

export type ManualFallbackResult = {
  fallback: "manual";
  ean: string;
};
export type ScanToAddResult = ProductDefinition | ManualFallbackResult;

export class ScanToAdd {
  constructor(
    private readonly databaseService: ScanToAddDatabaseService,
    private readonly openFoodFactsService: ScanToAddOpenFoodFactsService,
  ) {}

  async execute(
    input: ScanToAddInput,
  ): Promise<ScanToAddResult> {
    const existingProduct = await this.databaseService.findDefinitionByEan(input.ean);
    if (existingProduct) {
      return existingProduct;
    }

    let fetchedDefinition: ProductDefinition;
    try {
      fetchedDefinition = await this.openFoodFactsService.fetchProductByEAN(input.ean);
    } catch (_error) {
      return { fallback: "manual", ean: input.ean };
    }

    await this.databaseService.saveDefinition(fetchedDefinition);
    return fetchedDefinition;
  }
}
