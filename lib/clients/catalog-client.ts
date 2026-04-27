import type { Book, CatalogSearchFilters } from '@/lib/types/rag';
import { hasCatalogServiceConfig, hasDatabaseConfig } from '@/lib/config/environment';
import {
  getBookDetailsFromDatabase,
  getBookDetailsFromService,
  getPopularBooksFromDatabase,
  getPopularBooksFromService,
  searchCatalogFromDatabase,
  searchCatalogFromService,
} from '@/lib/server/catalog-repository';
import { assertBookVisible, filterBlockedBooks } from '@/lib/server/book-filters';

function unavailableDataSourceError(): Error {
  return new Error(
    'Catalog data source is unavailable. Configure DATABASE_URL/POSTGRES_URL or CATALOG_SERVICE_URL.'
  );
}

/**
 * Search catalog with given filters.
 */
export async function searchCatalog(filters: CatalogSearchFilters): Promise<Book[]> {
  let books: Book[];

  if (hasDatabaseConfig()) {
    books = await searchCatalogFromDatabase(filters);
  } else if (hasCatalogServiceConfig()) {
    books = await searchCatalogFromService(filters);
  } else {
    throw unavailableDataSourceError();
  }

  return (await filterBlockedBooks(books)).books;
}

/**
 * Get details for a specific book.
 */
export async function getBookDetails(bookId: string): Promise<Book> {
  let book: Book | null = null;

  if (hasDatabaseConfig()) {
    book = await getBookDetailsFromDatabase(bookId);
    if (!book) {
      throw new Error(`Book ${bookId} was not found in database`);
    }
  } else if (hasCatalogServiceConfig()) {
    book = await getBookDetailsFromService(bookId);
    if (!book) {
      throw new Error(`Book ${bookId} was not found in catalog service`);
    }
  } else {
    throw unavailableDataSourceError();
  }

  return assertBookVisible(book);
}

/**
 * Check inventory for a book.
 */
export async function checkInventory(bookId: string): Promise<{ stock: number }> {
  const book = await getBookDetails(bookId);
  return { stock: book.stock };
}

/**
 * Get popular books.
 */
export async function getPopularBooks(count: number = 20): Promise<Book[]> {
  let books: Book[];

  if (hasDatabaseConfig()) {
    books = await getPopularBooksFromDatabase(count);
  } else if (hasCatalogServiceConfig()) {
    books = await getPopularBooksFromService(count);
  } else {
    throw unavailableDataSourceError();
  }

  return (await filterBlockedBooks(books)).books;
}
