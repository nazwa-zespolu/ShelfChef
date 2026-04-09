export class AddProductByScanUseCase {
  constructor(
    private readonly productRepository: any,
    private readonly openFoodFactsClient: any,
    private readonly manualAddFallback: any
  ) {}

  async execute(_ean: string): Promise<string> {
    throw new Error("Not implemented yet");
  }
}
