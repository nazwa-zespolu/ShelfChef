import { ProductDefinition } from "../domain/types";

export interface ScanToAddInput {
  ean: string;
  expirationDate: Date;
  count: number;
}

type ExistingProductLookup = ProductDefinition & {
  id: string;
};

interface DatabaseService {
  queryProductByEan: (ean: string) => Promise<ExistingProductLookup | null>;
  insertTemplate: (template: ProductDefinition) => Promise<string>;
  insertProduct: (product: {
    templateId: string;
    ean: string;
    name: string;
    expirationDate: Date;
  }) => Promise<string>;
}

interface OpenFoodFactsService {
  fetchProductByEAN: (ean: string) => Promise<ProductDefinition>;
}

type ManualFallbackResult = {
  fallback: "manual";
  ean: string;
};

export class ScanToAdd {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly openFoodFactsService: OpenFoodFactsService,
  ) {}

  async execute(
    input: ScanToAddInput,
  ): Promise<any> {
    const existingProduct = await this.databaseService.queryProductByEan(input.ean);
    if (existingProduct) {
      return existingProduct;
    }

    try {
      const fetchedDefinition = await this.openFoodFactsService.fetchProductByEAN(input.ean);
      const templateId = await this.databaseService.insertTemplate(fetchedDefinition);

      const amount = input.count > 0 ? input.count : 1;
      const insertedIds: string[] = [];

      for (let i = 0; i < amount; i += 1) {
        const id = await this.databaseService.insertProduct({
          templateId,
          ean: fetchedDefinition.ean,
          name: fetchedDefinition.name,
          expirationDate: input.expirationDate,
        });
        insertedIds.push(id);
      }

      return insertedIds;
    } catch (_error) {
      return { fallback: "manual", ean: input.ean };
    }
  }
}
