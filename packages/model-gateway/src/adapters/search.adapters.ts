import fs from 'fs';
import path from 'path';
import { SearchProviderAdapter, SearchResult } from '../search.types.js';

export class MockSearchAdapter implements SearchProviderAdapter {
  private fixtures: { queries: Array<{ match: string; results: SearchResult[] }>; fallbackResults: SearchResult[] };

  constructor(fixturePath?: string) {
    const defaultPath = process.env.MOCK_SEARCH_FIXTURE_PATH || './templates/mock-search-results.json';
    const resolvedPath = fixturePath || defaultPath;
    const fullPath = path.resolve(process.cwd(), resolvedPath);
    this.fixtures = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  }

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    const lowerQuery = query.toLowerCase();

    const matchedFixture = this.fixtures.queries.find(f => {
      const lowerMatch = f.match.toLowerCase();
      if (lowerQuery.includes(lowerMatch)) return true;

      const queryTokens = lowerQuery.split(/\s+/).filter(t => t.length > 3);
      const matchCount = queryTokens.filter(t => lowerMatch.includes(t)).length;
      return matchCount >= 2;
    });

    const results = matchedFixture ? matchedFixture.results : this.fixtures.fallbackResults;
    return results.slice(0, maxResults);
  }
}

export class ManualEvidenceAdapter implements SearchProviderAdapter {
  async search(_query: string): Promise<SearchResult[]> {
    return [];
  }
}

/**
 * SearXNG search adapter — self-hosted privacy-friendly metasearch engine.
 * Uses the SearXNG JSON API format.
 */
export class SearxngSearchAdapter implements SearchProviderAdapter {
  constructor(private baseUrl: string) {}

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    try {
      const url = new URL(`${this.baseUrl.replace(/\/+$/, '')}/search`);
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('language', 'en');
      url.searchParams.set('pageno', '1');
      url.searchParams.set('categories', 'general,science,tech');

      const response = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        console.error(`SearXNG API error: ${response.statusText}`);
        return [];
      }

      const data = await response.json() as Record<string, unknown>;
      const items = (data.results as Record<string, unknown>[]) || [];
      return items.slice(0, maxResults).map((item: Record<string, unknown>) => ({
        title: String(item.title ?? ''),
        url: String(item.url ?? ''),
        snippet: String(item.content ?? ''),
        publisher: String(item.engine || item.source || ''),
        publishedAt: String(item.publishedDate || item.published_date || ''),
        sourceType: 'web',
      }));
    } catch (error) {
      console.error(`SearXNG search failed: ${error}`);
      return [];
    }
  }
}

/**
 * SerpAPI search adapter — Google search API via serpapi.com.
 * If SERPAPI_API_KEY is set, uses the JSON API.
 */
export class SerpApiSearchAdapter implements SearchProviderAdapter {
  constructor(
    private apiKey?: string,
  ) {}

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    const apiKey = this.apiKey || process.env.SERPAPI_API_KEY;
    if (!apiKey) {
      console.error('SerpAPI API key not configured');
      return [];
    }

    try {
      const url = new URL('https://serpapi.com/search');
      url.searchParams.set('q', query);
      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('num', String(maxResults));
      url.searchParams.set('engine', 'google');

      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        console.error(`SerpAPI error: ${response.statusText}`);
        return [];
      }

      const data = await response.json() as Record<string, unknown>;
      const items = (data.organic_results as Record<string, unknown>[]) || [];
      return items.slice(0, maxResults).map((item: Record<string, unknown>) => ({
        title: String(item.title ?? ''),
        url: String(item.link ?? ''),
        snippet: String(item.snippet ?? ''),
        publisher: String(item.source || item.displayed_link || ''),
        publishedAt: String(item.date ?? ''),
        sourceType: 'web',
      }));
    } catch (error) {
      console.error(`SerpAPI search failed: ${error}`);
      return [];
    }
  }
}

/**
 * Generic web search adapter — supports Google, Bing, and custom APIs.
 * Tries common response shapes (items, organic_results, webPages.value, results).
 */
export class WebSearchAdapter implements SearchProviderAdapter {
  constructor(
    private baseUrl: string,
    private apiKey?: string,
  ) {}

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set('q', query);
    url.searchParams.set('num', String(maxResults));

    const headers: Record<string, string> = {};
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    try {
      const response = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.error(`Web search API error: ${response.statusText}`);
        return [];
      }

      const data = await response.json() as Record<string, unknown>;
      const items = (data.items || data.organic_results || (data.webPages as Record<string, unknown>)?.value || data.results || []) as Record<string, unknown>[];
      return items.slice(0, maxResults).map((item: Record<string, unknown>) => ({
        title: String(item.title ?? ''),
        url: String(item.link || item.url || ''),
        snippet: String(item.snippet || item.description || ''),
        publisher: String(item.source || item.publisher || item.displayLink || ''),
        publishedAt: String(item.date ?? ''),
        sourceType: 'web',
      }));
    } catch (error) {
      console.error(`Web search request failed: ${error}`);
      return [];
    }
  }
}
