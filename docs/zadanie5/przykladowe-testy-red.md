# Zadanie 5 - przykladowe testy jednostkowe (faza RED)

Ten plik zawiera przykladowe testy, ktore sa zgodne z instrukcja do Zadania 5:

- testy jednostkowe piszemy przed implementacja,
- testy powinny byc failujace (faza RED),
- testy docelowo trafiaja do katalogu `tests/`.

Ponizej sa przyklady dla stacku TypeScript + Jest (pasuje do planowanego React/React Native).

## Proponowany podzial plikow testowych

```txt
tests/
  unit/
    test_default_expiry_policy.test.ts
    test_get_expiring_products_use_case.test.ts
    test_add_product_by_scan_use_case.test.ts
    test_generate_recipe_use_case.test.ts
```

## 1) `test_default_expiry_policy.test.ts`

```ts
import { DefaultExpiryPolicy } from "../../src/domain/policies/DefaultExpiryPolicy";

describe("DefaultExpiryPolicy", () => {
  it("uznaje produkt za konczacy sie wkrotce przy progu 3 dni", () => {
    const policy = new DefaultExpiryPolicy(3);
    const now = new Date("2026-04-08T10:00:00.000Z");
    const expirationDate = new Date("2026-04-10T10:00:00.000Z");

    expect(policy.isExpiringSoon(expirationDate, now)).toBe(true);
  });

  it("nie uznaje produktu za konczacy sie wkrotce poza progiem", () => {
    const policy = new DefaultExpiryPolicy(3);
    const now = new Date("2026-04-08T10:00:00.000Z");
    const expirationDate = new Date("2026-04-20T10:00:00.000Z");

    expect(policy.isExpiringSoon(expirationDate, now)).toBe(false);
  });
});
```

## 2) `test_get_expiring_products_use_case.test.ts`

```ts
import { GetExpiringProductsUseCase } from "../../src/application/use-cases/GetExpiringProductsUseCase";

describe("GetExpiringProductsUseCase", () => {
  it("zwraca tylko produkty spelniajace policy", async () => {
    const productRepository = {
      getAll: jest.fn().mockResolvedValue([
        { id: "p1", name: "Mleko", expirationDate: new Date("2026-04-09") },
        { id: "p2", name: "Ryż", expirationDate: new Date("2026-05-09") },
      ]),
    };

    const expiryPolicy = {
      isExpiringSoon: jest
        .fn()
        .mockImplementation((d: Date) => d <= new Date("2026-04-11")),
    };

    const useCase = new GetExpiringProductsUseCase(productRepository as any, expiryPolicy as any);
    const result = await useCase.execute(new Date("2026-04-08"));

    expect(productRepository.getAll).toHaveBeenCalledTimes(1);
    expect(expiryPolicy.isExpiringSoon).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Mleko");
  });
});
```

## 3) `test_add_product_by_scan_use_case.test.ts`

```ts
import { AddProductByScanUseCase } from "../../src/application/use-cases/AddProductByScanUseCase";

describe("AddProductByScanUseCase", () => {
  it("dodaje produkt na podstawie danych z Open Food Facts", async () => {
    const productRepository = {
      findByEan: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockResolvedValue("p-123"),
    };

    const offClient = {
      fetchProductByEAN: jest.fn().mockResolvedValue({
        ean: "5901234567890",
        name: "Jogurt naturalny",
      }),
    };

    const fallbackManualAdd = { execute: jest.fn() };
    const useCase = new AddProductByScanUseCase(
      productRepository as any,
      offClient as any,
      fallbackManualAdd as any
    );

    const id = await useCase.execute("5901234567890");

    expect(productRepository.findByEan).toHaveBeenCalledWith("5901234567890");
    expect(offClient.fetchProductByEAN).toHaveBeenCalledWith("5901234567890");
    expect(productRepository.insert).toHaveBeenCalledTimes(1);
    expect(fallbackManualAdd.execute).not.toHaveBeenCalled();
    expect(id).toBe("p-123");
  });

  it("uruchamia fallback recznego dodania, gdy OFF jest niedostepne", async () => {
    const productRepository = {
      findByEan: jest.fn().mockResolvedValue(null),
      insert: jest.fn(),
    };

    const offClient = {
      fetchProductByEAN: jest.fn().mockRejectedValue(new Error("OFF unavailable")),
    };

    const fallbackManualAdd = {
      execute: jest.fn().mockResolvedValue("manual-flow"),
    };

    const useCase = new AddProductByScanUseCase(
      productRepository as any,
      offClient as any,
      fallbackManualAdd as any
    );

    const result = await useCase.execute("5900000000000");

    expect(productRepository.insert).not.toHaveBeenCalled();
    expect(fallbackManualAdd.execute).toHaveBeenCalledWith({ ean: "5900000000000" });
    expect(result).toBe("manual-flow");
  });
});
```

## 4) `test_generate_recipe_use_case.test.ts`

```ts
import { GenerateRecipeUseCase } from "../../src/application/use-cases/GenerateRecipeUseCase";

describe("GenerateRecipeUseCase", () => {
  it("przekazuje dostepne produkty i preferencje do AIRecipeClient", async () => {
    const productRepository = {
      getAvailable: jest.fn().mockResolvedValue([
        { id: "1", name: "Pomidor", quantity: 2 },
        { id: "2", name: "Makaron", quantity: 1 },
      ]),
    };

    const aiRecipeClient = {
      generateRecipe: jest.fn().mockResolvedValue({
        title: "Makaron pomidorowy",
        steps: ["Ugotuj makaron", "Zrob sos", "Polacz"],
      }),
    };

    const useCase = new GenerateRecipeUseCase(productRepository as any, aiRecipeClient as any);
    const recipe = await useCase.execute({ preferences: "wegetarianskie" });

    expect(productRepository.getAvailable).toHaveBeenCalledTimes(1);
    expect(aiRecipeClient.generateRecipe).toHaveBeenCalledWith(
      [
        { id: "1", name: "Pomidor", quantity: 2 },
        { id: "2", name: "Makaron", quantity: 1 },
      ],
      "wegetarianskie"
    );
    expect(recipe.title).toContain("Makaron");
  });
});
```

## Jak uzyskac faze RED zgodnie z instrukcja

Poniewaz implementacja ma powstac dopiero w kolejnym zadaniu, po uruchomieniu testow:

- importy z `src/...` beda wskazywac na nieistniejace pliki lub
- testy beda nieprzechodzace z powodu braku implementacji metod.

To jest poprawny rezultat dla Zadania 5 (faza RED).
