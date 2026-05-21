import { ProductDefinition } from "../domain/types";
import { ScanToAddDatabaseService } from "../app/ScanToAdd";
import { ProductRepository } from "./ProductRepository";

export class ScanToAddDatabaseAdapter implements ScanToAddDatabaseService {
  constructor(private readonly repo: ProductRepository) {}

  findDefinitionByEan(ean: string): Promise<ProductDefinition | null> {
    return this.repo.findDefinitionByEan(ean);
  }

  saveDefinition(template: ProductDefinition): Promise<void> {
    return this.repo.saveDefinition(template);
  }
}
