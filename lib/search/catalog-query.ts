const SEARCH_DOCUMENT_SQL = "(coalesce(title, '') || ' ' || coalesce(author, '') || ' ' || coalesce(category, '') || ' ' || coalesce(description, ''))";

export function normalizeSearchTerms(terms: string[]): string[] {
  return Array.from(
    new Set(
      terms
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  );
}

export function buildCatalogTextSearch(
  rawTerms: string[],
  startParameter: number,
): { condition: string; params: string[] } {
  const terms = normalizeSearchTerms(rawTerms);
  if (terms.length === 0) {
    return { condition: '', params: [] };
  }

  const matches = terms.map(
    (_, index) => `${SEARCH_DOCUMENT_SQL} ILIKE $${startParameter + index}`,
  );

  return {
    condition: `( ${matches.join(' OR ')} )`,
    params: terms.map((term) => `%${term}%`),
  };
}
