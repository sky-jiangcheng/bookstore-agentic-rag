import type { Book, CatalogSearchFilters } from '@/lib/types/rag';
import { hasDatabaseConfig } from '@/lib/config/environment';
import {
  getBookDetailsFromDatabase,
  getPopularBooksFromDatabase,
  searchCatalogFromDatabase,
} from '@/lib/server/catalog-repository';
import { assertBookVisible, filterBlockedBooks } from '@/lib/server/book-filters';

function unavailableDataSourceError(): Error {
  return new Error(
    'Catalog data source is unavailable. Configure DATABASE_URL or POSTGRES_URL.'
  );
}

/**
 * Search catalog with given filters.
 */
export async function searchCatalog(filters: CatalogSearchFilters): Promise<Book[]> {
  if (!hasDatabaseConfig()) {
    throw unavailableDataSourceError();
  }

  // 明确优先级：用户选择的 library_category > AI 推断的 inferred_library_type
  const category = filters.library_category ?? filters.requirement?.inferred_library_type;
  
  const result = await searchCatalogFromDatabase({
    ...filters,
    library_category: category,
  });
  
  // 使用同一个 category 进行过滤，确保一致性
  return (await filterBlockedBooks(result, category)).books;
}

/**
 * Get details for a specific book.
 */
export async function getBookDetails(bookId: string, category?: string): Promise<Book> {
  if (!hasDatabaseConfig()) {
    throw unavailableDataSourceError();
  }

  const book = await getBookDetailsFromDatabase(bookId);

  if (!book) {
    throw new Error(`Book not found: ${bookId}`);
  }

  return assertBookVisible(book, category);
}

/**
 * Get popular books.
 */
export async function getPopularBooks(count: number, category?: string): Promise<Book[]> {
  if (!hasDatabaseConfig()) {
    throw unavailableDataSourceError();
  }

  return (await filterBlockedBooks(await getPopularBooksFromDatabase(count), category)).books;
}
