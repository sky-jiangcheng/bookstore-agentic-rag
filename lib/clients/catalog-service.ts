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

  return (await filterBlockedBooks(await searchCatalogFromDatabase(filters))).books;
}

/**
 * Get details for a specific book.
 */
export async function getBookDetails(bookId: string): Promise<Book> {
  if (!hasDatabaseConfig()) {
    throw unavailableDataSourceError();
  }

  const book = await getBookDetailsFromDatabase(bookId);

  if (!book) {
    throw new Error(`Book not found: ${bookId}`);
  }

  return assertBookVisible(book);
}

/**
 * Get popular books.
 */
export async function getPopularBooks(count: number): Promise<Book[]> {
  if (!hasDatabaseConfig()) {
    throw unavailableDataSourceError();
  }

  return (await filterBlockedBooks(await getPopularBooksFromDatabase(count))).books;
}
