import { LazyNormalizationService } from '../../../src/features/recipe-generator/application/lazyNormalizationService';
import {
  NormalizationCandidate,
  NormalizationModelClient,
} from '../../../src/features/recipe-generator/domain/normalizationTypes';

const CANDIDATES: NormalizationCandidate[] = [
  { ean: '1', name: 'Mleko UHT 3.2%' },
  { ean: '2', name: 'Cebula' },
];

describe('LazyNormalizationService', () => {
  it('saves only valid mappings from parsed JSON', async () => {
    const modelClient: NormalizationModelClient = {
      complete: jest.fn(async () => '{"Mleko UHT 3.2%":"milk"}'),
    };
    const service = new LazyNormalizationService({ modelClient });

    const { result, mappings } = await service.normalizeBatch(CANDIDATES);

    expect(result).toEqual({
      attempted: 2,
      normalized: 1,
      skipped: 1,
      retriesUsed: 0,
    });
    expect(mappings).toEqual([
      {
        ean: '1',
        sourceName: 'Mleko UHT 3.2%',
        normalizedName: 'milk',
      },
    ]);
  });

  it('retries parse failures up to configured max', async () => {
    const modelClient: NormalizationModelClient = {
      complete: jest
        .fn<Promise<string>, [string, string]>()
        .mockResolvedValueOnce('not json')
        .mockResolvedValueOnce('```json\n{"Mleko UHT 3.2%":"milk"}\n```'),
    };
    const service = new LazyNormalizationService({
      modelClient,
      maxParseRetries: 2,
    });

    const { result, mappings } = await service.normalizeBatch(CANDIDATES);

    expect(result.retriesUsed).toBe(1);
    expect(mappings).toHaveLength(1);
    expect(modelClient.complete).toHaveBeenCalledTimes(2);
  });

  it('gracefully skips batch when retries are exhausted', async () => {
    const modelClient: NormalizationModelClient = {
      complete: jest.fn(async () => 'still not json'),
    };
    const service = new LazyNormalizationService({
      modelClient,
      maxParseRetries: 2,
    });

    const { result, mappings } = await service.normalizeBatch(CANDIDATES);

    expect(result).toEqual({
      attempted: 2,
      normalized: 0,
      skipped: 2,
      retriesUsed: 2,
    });
    expect(mappings).toEqual([]);
    expect(modelClient.complete).toHaveBeenCalledTimes(3);
  });
});
