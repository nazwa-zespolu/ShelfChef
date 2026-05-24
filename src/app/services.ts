import { ScanToAdd } from "./ScanToAdd";
import { HttpOpenFoodFactsClient } from "../infrastructure/OpenFoodFactsClient";
import { ProductRepository } from "../infrastructure/ProductRepository";
import { ScanToAddDatabaseAdapter } from "../infrastructure/ScanToAddDatabaseAdapter";

const repo = new ProductRepository();
const openFoodFactsClient = new HttpOpenFoodFactsClient();
const scanToAdd = new ScanToAdd(new ScanToAddDatabaseAdapter(repo), openFoodFactsClient);

export function getScanToAdd(): ScanToAdd {
  return scanToAdd;
}

export function getProductRepository(): ProductRepository {
  return repo;
}
