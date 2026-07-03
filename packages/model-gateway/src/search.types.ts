export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  publisher?: string;
  publishedAt?: string;
  sourceType?: string;
  excerpt?: string;
};

export interface SearchProviderAdapter {
  search(query: string, maxResults?: number): Promise<SearchResult[]>;
}
