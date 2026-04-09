import { GenerateRecipe } from "../../src/app/GenerateRecipe";

describe("UC-05: GenerateRecipe", () => {
  it("fetches available products and passes them with preferences to AI", async () => {
    const databaseService = {
      queryAllProducts: jest.fn().mockResolvedValue([
        { id: "1", name: "Makaron", expirationDate: new Date("2026-04-20") },
        { id: "2", name: "Pomidory", expirationDate: new Date("2026-04-18") },
      ]),
    };

    const aiRecipeService = {
      generateRecipe: jest.fn().mockResolvedValue({
        title: "Makaron pomidorowy",
        ingredients: ["Makaron", "Pomidory"],
        steps: ["Ugotuj makaron", "Przygotuj sos", "Polacz skladniki"],
      }),
    };

    const generateRecipe = new GenerateRecipe(
      databaseService as any,
      aiRecipeService as any
    );

    await generateRecipe.execute({ preferences: "wegetarianskie, szybkie" });

    expect(databaseService.queryAllProducts).toHaveBeenCalledTimes(1);
    expect(aiRecipeService.generateRecipe).toHaveBeenCalledWith(
      [
        { id: "1", name: "Makaron", expirationDate: new Date("2026-04-20") },
        { id: "2", name: "Pomidory", expirationDate: new Date("2026-04-18") },
      ],
      "wegetarianskie, szybkie"
    );
  });

  it("returns generated recipe proposal", async () => {
    const databaseService = {
      queryAllProducts: jest.fn().mockResolvedValue([
        { id: "1", name: "Jajka", expirationDate: new Date("2026-04-16") },
      ]),
    };

    const aiRecipeService = {
      generateRecipe: jest.fn().mockResolvedValue({
        title: "Omlet studencki",
        ingredients: ["Jajka", "Szczypiorek"],
        steps: ["Roztrzep jajka", "Smaz 3 minuty"],
      }),
    };

    const generateRecipe = new GenerateRecipe(
      databaseService as any,
      aiRecipeService as any
    );

    const recipe = await generateRecipe.execute({ preferences: "bez mleka" });

    expect(recipe).toEqual({
      title: "Omlet studencki",
      ingredients: ["Jajka", "Szczypiorek"],
      steps: ["Roztrzep jajka", "Smaz 3 minuty"],
    });
  });

  it("throws error when AI API is unavailable", async () => {
    const databaseService = {
      queryAllProducts: jest.fn().mockResolvedValue([
        { id: "1", name: "Ryz", expirationDate: new Date("2026-04-22") },
      ]),
    };

    const aiRecipeService = {
      generateRecipe: jest.fn().mockRejectedValue(new Error("AI unavailable")),
    };

    const generateRecipe = new GenerateRecipe(
      databaseService as any,
      aiRecipeService as any
    );

    await expect(
      generateRecipe.execute({ preferences: "tanie i szybkie" })
    ).rejects.toThrow("AI unavailable");

    expect(databaseService.queryAllProducts).toHaveBeenCalledTimes(1);
    expect(aiRecipeService.generateRecipe).toHaveBeenCalledTimes(1);
  });

  it("passes empty product list when pantry is empty", async () => {
    const databaseService = {
      queryAllProducts: jest.fn().mockResolvedValue([]),
    };

    const aiRecipeService = {
      generateRecipe: jest.fn().mockResolvedValue({
        title: "Zakupy bazowe",
        ingredients: ["Makaron", "Pomidory"],
        steps: ["Kup skladniki", "Ugotuj danie"],
      }),
    };

    const generateRecipe = new GenerateRecipe(
      databaseService as any,
      aiRecipeService as any
    );

    await generateRecipe.execute({ preferences: "dowolne" });

    expect(aiRecipeService.generateRecipe).toHaveBeenCalledWith([], "dowolne");
  });
});
