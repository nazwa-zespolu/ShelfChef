import { GenerateRecipeUseCase } from "../../src/app/use-cases/GenerateRecipeUseCase";

describe("GenerateRecipeUseCase", () => {
  it("pobiera dostepne produkty i przekazuje je wraz z preferencjami do AI", async () => {
    const productRepository = {
      getAll: jest.fn().mockResolvedValue([
        { id: "p1", name: "Makaron", quantity: 1, expirationDate: new Date("2026-04-20") },
        { id: "p2", name: "Pomidory", quantity: 2, expirationDate: new Date("2026-04-18") },
      ]),
    };

    const aiRecipeService = {
      generateRecipe: jest.fn().mockResolvedValue({
        title: "Makaron pomidorowy",
        ingredients: ["Makaron", "Pomidory"],
        steps: ["Ugotuj makaron", "Przygotuj sos", "Polacz skladniki"],
      }),
    };

    const useCase = new GenerateRecipeUseCase(
      productRepository as any,
      aiRecipeService as any
    );

    await useCase.execute({ preferences: "wegetarianskie, szybkie" });

    expect(productRepository.getAll).toHaveBeenCalledTimes(1);
    expect(aiRecipeService.generateRecipe).toHaveBeenCalledWith(
      [
        { id: "p1", name: "Makaron", quantity: 1, expirationDate: new Date("2026-04-20") },
        { id: "p2", name: "Pomidory", quantity: 2, expirationDate: new Date("2026-04-18") },
      ],
      "wegetarianskie, szybkie"
    );
  });

  it("zwraca wygenerowana propozycje przepisu", async () => {
    const productRepository = {
      getAll: jest.fn().mockResolvedValue([
        { id: "p1", name: "Jajka", quantity: 4, expirationDate: new Date("2026-04-16") },
      ]),
    };

    const aiRecipeService = {
      generateRecipe: jest.fn().mockResolvedValue({
        title: "Omlet studencki",
        ingredients: ["Jajka", "Szczypiorek"],
        steps: ["Roztrzep jajka", "Smaz 3 minuty"],
      }),
    };

    const useCase = new GenerateRecipeUseCase(
      productRepository as any,
      aiRecipeService as any
    );

    const recipe = await useCase.execute({ preferences: "bez mleka" });

    expect(recipe).toEqual({
      title: "Omlet studencki",
      ingredients: ["Jajka", "Szczypiorek"],
      steps: ["Roztrzep jajka", "Smaz 3 minuty"],
    });
  });

  it("zglasza blad, gdy AI API jest niedostepne", async () => {
    const productRepository = {
      getAll: jest.fn().mockResolvedValue([
        { id: "p1", name: "Ryz", quantity: 1, expirationDate: new Date("2026-04-22") },
      ]),
    };

    const aiRecipeService = {
      generateRecipe: jest.fn().mockRejectedValue(new Error("AI unavailable")),
    };

    const useCase = new GenerateRecipeUseCase(
      productRepository as any,
      aiRecipeService as any
    );

    await expect(
      useCase.execute({ preferences: "tanie i szybkie" })
    ).rejects.toThrow("AI unavailable");

    expect(productRepository.getAll).toHaveBeenCalledTimes(1);
    expect(aiRecipeService.generateRecipe).toHaveBeenCalledTimes(1);
  });

  it("przekazuje pusta liste produktow, gdy magazyn jest pusty", async () => {
    const productRepository = {
      getAll: jest.fn().mockResolvedValue([]),
    };

    const aiRecipeService = {
      generateRecipe: jest.fn().mockResolvedValue({
        title: "Zakupy bazowe",
        ingredients: ["Makaron", "Pomidory"],
        steps: ["Kup skladniki", "Ugotuj danie"],
      }),
    };

    const useCase = new GenerateRecipeUseCase(
      productRepository as any,
      aiRecipeService as any
    );

    await useCase.execute({ preferences: "dowolne" });

    expect(aiRecipeService.generateRecipe).toHaveBeenCalledWith([], "dowolne");
  });
});
