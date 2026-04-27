import { createChunker } from './chunking';
import type { TextChunk } from './types/rag';
import { upsertChunkVector, vectorSearchChunks } from './upstash';
import { buildBookDocument, buildEmbeddingPair } from './local-vector.js';

export function generateEmbeddingPair(text: string): {
  vector: number[];
  sparseVector: { indices: number[]; values: number[] };
} {
  return buildEmbeddingPair(text);
}

export async function generateEmbedding(
  text: string,
  taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY' = 'RETRIEVAL_QUERY',
): Promise<number[]> {
  void taskType;
  return buildEmbeddingPair(text).vector;
}

export async function generateBookEmbedding(
  title: string,
  description: string,
  author: string,
  category: string,
): Promise<number[]> {
  const combinedText = buildBookDocument({
    title,
    author,
    category,
    description,
  });
  return generateEmbedding(combinedText, 'RETRIEVAL_DOCUMENT');
}

/**
 * Generate embeddings for book chunks - Classic RAG approach
 * Splits long descriptions into chunks and generates embeddings for each.
 */
export async function generateBookChunkEmbeddings(
  bookId: string,
  title: string,
  description: string,
  author: string,
  category: string,
  chunkingStrategy: 'fixed' | 'semantic' | 'book-specific' = 'book-specific',
): Promise<TextChunk[]> {
  // Create chunker based on strategy
  const chunker = createChunker(chunkingStrategy);

  // Chunk the book description
  const chunks = await chunker.chunk(description, {
    bookId,
    title,
    author,
    category,
  });

  // Generate embeddings for each chunk
  const textChunks: TextChunk[] = [];

  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk.text, 'RETRIEVAL_DOCUMENT');

    const textChunk: TextChunk = {
      id: chunk.id,
      text: chunk.text,
      index: chunk.index,
      bookId,
      metadata: {
        title,
        author,
        category,
        ...chunk.metadata,
      },
      embedding,
    };

    textChunks.push(textChunk);

    // Store chunk embedding in vector database
    await upsertChunkVector(chunk.id, embedding, {
      bookId,
      chunkIndex: chunk.index,
      text: chunk.text,
      title,
      author,
      category,
    });
  }

  return textChunks;
}

/**
 * Search for relevant chunks across all books
 */
export async function searchRelevantChunks(
  query: string,
  _topK: number = 10,
  options?: {
    generateQueryEmbedding?: typeof generateEmbedding;
    vectorSearch?: typeof vectorSearchChunks;
  },
): Promise<{ chunk: TextChunk; score: number }[]> {
  const embedQuery = options?.generateQueryEmbedding ?? generateEmbedding;
  const searchVectors = options?.vectorSearch ?? vectorSearchChunks;

  try {
    const queryVector = await embedQuery(query, 'RETRIEVAL_QUERY');
    const results = await searchVectors(queryVector, _topK);

    return results.map((result) => {
      const metadata = (result.metadata ?? {}) as unknown as Record<string, unknown>;
      const text = typeof metadata.text === 'string' ? metadata.text : '';
      const bookId = typeof metadata.bookId === 'string' ? metadata.bookId : '';
      const chunkType = metadata.chunk_type;
      const chunkSize = metadata.chunk_size;
      const strategy = metadata.strategy;
      const chunkIndex =
        typeof metadata.chunkIndex === 'number'
          ? metadata.chunkIndex
          : Number.isFinite(Number(metadata.chunkIndex))
            ? Number(metadata.chunkIndex)
            : 0;

      return {
        score: result.score,
        chunk: {
          id: result.id,
          text,
          index: chunkIndex,
          bookId,
          metadata: {
            title: typeof metadata.title === 'string' ? metadata.title : undefined,
            author: typeof metadata.author === 'string' ? metadata.author : undefined,
            category: typeof metadata.category === 'string' ? metadata.category : undefined,
            chunk_type:
              chunkType === 'metadata' || chunkType === 'description'
                ? chunkType
                : undefined,
            chunk_size:
              typeof chunkSize === 'number'
                ? chunkSize
                : Number.isFinite(Number(chunkSize))
                  ? Number(chunkSize)
                  : undefined,
            strategy: typeof strategy === 'string' ? strategy : undefined,
          },
        },
      };
    });
  } catch (error) {
    console.warn('[embeddings] Failed to search relevant chunks:', error);
    return [];
  }
}
