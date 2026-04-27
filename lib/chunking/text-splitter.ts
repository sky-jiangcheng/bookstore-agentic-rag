/**
 * Text Splitter for RAG - Classic RAG Component
 *
 * Implements various chunking strategies for processing long text documents.
 * This is a critical component in classic RAG systems for handling long descriptions.
 */

export interface Chunk {
  id: string;
  text: string;
  index: number;
  metadata?: Record<string, unknown>;
}

export interface ChunkingStrategy {
  name: string;
  chunk(text: string, metadata?: Record<string, unknown>): Promise<Chunk[]>;
}

/**
 * Fixed-size chunking strategy - Classic RAG approach
 * Splits text into fixed-size chunks with overlap for context preservation.
 */
export class FixedSizeChunker implements ChunkingStrategy {
  name = 'fixed-size';

  constructor(
    private chunkSize: number = 512,
    private chunkOverlap: number = 64,
    private separator: string = '\n\n'
  ) {
    if (chunkOverlap >= chunkSize) {
      throw new Error('chunkOverlap must be less than chunkSize');
    }
  }

  async chunk(text: string, metadata?: Record<string, unknown>): Promise<Chunk[]> {
    const chunks: Chunk[] = [];
    const separatorLength = this.separator.length;

    // Split by separator first to preserve natural boundaries
    const sections = text.split(this.separator);
    const currentChunks: string[] = [];
    let currentLength = 0;

    for (const section of sections) {
      const sectionLength = section.length;

      // If single section exceeds chunk size, split it by character
      if (sectionLength > this.chunkSize) {
        // Flush existing chunks first
        if (currentChunks.length > 0) {
          chunks.push(this.createChunk(currentChunks.join(this.separator), chunks.length, metadata));
          currentChunks.length = 0;
          currentLength = 0;
        }

        // Split large section into character-based chunks
        const charChunks = this.splitByCharacter(section);
        for (const charChunk of charChunks) {
          chunks.push(this.createChunk(charChunk, chunks.length, metadata));
        }
        continue;
      }

      // Check if adding this section would exceed chunk size
      if (currentLength + sectionLength + (currentChunks.length > 0 ? separatorLength : 0) > this.chunkSize) {
        // Add current chunks to results
        if (currentChunks.length > 0) {
          chunks.push(this.createChunk(currentChunks.join(this.separator), chunks.length, metadata));

          // Handle overlap by keeping some previous chunks
          const overlapText = this.getOverlapText(currentChunks.join(this.separator));
          currentChunks.length = 0;
          currentLength = 0;

          if (overlapText) {
            currentChunks.push(overlapText);
            currentLength = overlapText.length;
          }
        }
      }

      currentChunks.push(section);
      currentLength += sectionLength + (currentChunks.length > 1 ? separatorLength : 0);
    }

    // Add remaining chunks
    if (currentChunks.length > 0) {
      chunks.push(this.createChunk(currentChunks.join(this.separator), chunks.length, metadata));
    }

    return chunks;
  }

  private splitByCharacter(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + this.chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start = end - this.chunkOverlap;
    }

    return chunks;
  }

  private getOverlapText(previousChunk: string): string {
    const words = previousChunk.split(' ');
    const overlapWords = Math.floor(this.chunkOverlap / 5); // Approximate 5 chars per word
    return words.slice(-overlapWords).join(' ');
  }

  private createChunk(text: string, index: number, metadata?: Record<string, unknown>): Chunk {
    return {
      id: `chunk-${index}-${Date.now()}`,
      text: text.trim(),
      index,
      metadata: {
        ...metadata,
        chunk_size: text.length,
        strategy: this.name,
      },
    };
  }
}

/**
 * Semantic chunking strategy - Advanced RAG approach
 * Splits text at semantic boundaries (sentences, paragraphs).
 */
export class SemanticChunker implements ChunkingStrategy {
  name = 'semantic';

  constructor(
    private maxChunkSize: number = 512,
    private minChunkSize: number = 100
  ) {}

  async chunk(text: string, metadata?: Record<string, unknown>): Promise<Chunk[]> {
    const chunks: Chunk[] = [];

    // Split into sentences using regex
    const sentences = this.splitIntoSentences(text);
    const currentChunks: string[] = [];
    let currentLength = 0;

    for (const sentence of sentences) {
      const sentenceLength = sentence.length;

      // If adding this sentence would exceed max chunk size
      if (currentLength + sentenceLength > this.maxChunkSize && currentChunks.length > 0) {
        // Only add if we've reached minimum chunk size
        if (currentLength >= this.minChunkSize) {
          chunks.push(this.createChunk(currentChunks.join(' '), chunks.length, metadata));
          currentChunks.length = 0;
          currentLength = 0;
        }
      }

      currentChunks.push(sentence);
      currentLength += sentenceLength + 1; // +1 for space
    }

    // Add remaining chunks
    if (currentChunks.length > 0) {
      chunks.push(this.createChunk(currentChunks.join(' '), chunks.length, metadata));
    }

    return chunks;
  }

  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitting regex - can be enhanced with NLP libraries
    const sentenceRegex = /[.!?]+\s+|[。！？]+\s*/g;
    const sentences: string[] = [];
    let start = 0;
    let match;

    while ((match = sentenceRegex.exec(text)) !== null) {
      sentences.push(text.slice(start, match.index + match[0].length).trim());
      start = match.index + match[0].length;
    }

    // Add remaining text
    if (start < text.length) {
      sentences.push(text.slice(start).trim());
    }

    return sentences.filter(s => s.length > 0);
  }

  private createChunk(text: string, index: number, metadata?: Record<string, unknown>): Chunk {
    return {
      id: `semantic-chunk-${index}-${Date.now()}`,
      text: text.trim(),
      index,
      metadata: {
        ...metadata,
        chunk_size: text.length,
        strategy: this.name,
      },
    };
  }
}

/**
 * Book-specific chunking strategy
 * Handles book metadata specially, treating title, author, category, and description separately.
 */
export class BookSpecificChunker implements ChunkingStrategy {
  name = 'book-specific';

  constructor(
    private descriptionChunker: ChunkingStrategy = new SemanticChunker(512, 100)
  ) {}

  async chunk(text: string, metadata?: Record<string, unknown>): Promise<Chunk[]> {
    const chunks: Chunk[] = [];

    // Extract book metadata if available
    const title = metadata?.title as string || '';
    const author = metadata?.author as string || '';
    const category = metadata?.category as string || '';
    const description = metadata?.description as string || text;

    // Create structured chunks for book-specific fields

    // Chunk 1: Title + Author + Category (always kept together)
    const metadataChunk: Chunk = {
      id: `book-metadata-${Date.now()}`,
      text: `Title: ${title}\nAuthor: ${author}\nCategory: ${category}`,
      index: 0,
      metadata: {
        ...metadata,
        chunk_type: 'metadata',
        strategy: this.name,
      },
    };
    chunks.push(metadataChunk);

    // Chunk 2+: Description chunks using semantic chunking
    if (description && description.length > 100) {
      const descriptionChunks = await this.descriptionChunker.chunk(description, {
        ...metadata,
        chunk_type: 'description',
      });

      for (const descChunk of descriptionChunks) {
        chunks.push({
          ...descChunk,
          index: chunks.length,
          text: `${title} by ${author}\n\n${descChunk.text}`,
        });
      }
    }

    return chunks;
  }
}

/**
 * Factory function to create chunkers based on configuration
 */
export function createChunker(
  strategy: 'fixed' | 'semantic' | 'book-specific',
  options?: Record<string, unknown>
): ChunkingStrategy {
  switch (strategy) {
    case 'fixed':
      return new FixedSizeChunker(
        (options?.chunkSize as number) || 512,
        (options?.chunkOverlap as number) || 64,
        (options?.separator as string) || '\n\n'
      );

    case 'semantic':
      return new SemanticChunker(
        (options?.maxChunkSize as number) || 512,
        (options?.minChunkSize as number) || 100
      );

    case 'book-specific':
      return new BookSpecificChunker(
        options?.descriptionChunker as ChunkingStrategy
      );

    default:
      throw new Error(`Unknown chunking strategy: ${strategy}`);
  }
}

/**
 * Default chunker for book descriptions
 */
export const defaultChunker = new BookSpecificChunker(new SemanticChunker(512, 100));
