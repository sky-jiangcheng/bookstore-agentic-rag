import { buildEmbeddingPair } from './local-vector';

export function generateEmbeddingPair(text: string): {
  vector: number[];
  sparseVector: { indices: number[]; values: number[] };
} {
  return buildEmbeddingPair(text);
}
