import OpenLibraryAPI from '@server/api/openlibrary';
import type { BookResult } from '@server/api/openlibrary';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { AudiobookMedia } from '@server/entity/AudiobookMedia';
import { BookMedia } from '@server/entity/BookMedia';
import type { BookSearchResult } from '@server/interfaces/api/bookInterfaces';

const AUDIOBOOK_PUBLISHERS = [
  'audible',
  'brilliance audio',
  'recorded books',
  'tantor',
  'blackstone',
  'hachette audio',
  'penguin audio',
  'harper audio',
  'random house audio',
  'simon & schuster audio',
  'macmillan audio',
  'bbc audio',
  'bolinda',
];

/**
 * Service that handles book and audiobook search via OpenLibrary,
 * with local availability overlay from the database.
 * FR-001, FR-002, FR-007, FR-038, FR-039.
 */
export class BookSearchService {
  private openLibrary: OpenLibraryAPI;

  constructor() {
    this.openLibrary = new OpenLibraryAPI();
  }

  async search(
    query: string,
    type: 'book' | 'audiobook' = 'book',
    page = 1,
    limit = 20
  ): Promise<{
    results: BookSearchResult[];
    totalResults: number;
  }> {
    const { results, totalResults } = await this.openLibrary.search(
      query,
      page,
      limit
    );

    // Filter for audiobooks if requested
    let filtered = results;
    if (type === 'audiobook') {
      filtered = results.filter((r) => this.isLikelyAudiobook(r));
    }

    // Overlay local availability status
    const enriched = await Promise.all(
      filtered.map((result) => this.enrichWithStatus(result, type))
    );

    return {
      results: enriched,
      totalResults: type === 'audiobook' ? enriched.length : totalResults,
    };
  }

  async searchByISBN(
    isbn: string
  ): Promise<BookSearchResult | null> {
    const result = await this.openLibrary.searchByISBN(isbn);
    if (!result) return null;
    return this.enrichWithStatus(result, 'book');
  }

  private async enrichWithStatus(
    result: BookResult,
    type: 'book' | 'audiobook'
  ): Promise<BookSearchResult> {
    const isBook = type === 'book';
    const repo = isBook
      ? getRepository(BookMedia)
      : getRepository(AudiobookMedia);

    const existing = await repo.findOne({
      where: { openLibraryId: result.openLibraryId },
    });

    return {
      openLibraryId: result.openLibraryId,
      title: result.title,
      authorName: result.authorName,
      isbn13: result.isbn13,
      isbn10: result.isbn10,
      coverUrl: result.coverUrl,
      year: result.year,
      publisher: result.publisher,
      pageCount: result.pageCount,
      subjects: result.subjects,
      mediaType: isBook ? MediaType.BOOK : MediaType.AUDIOBOOK,
      mediaStatus: existing?.status ?? null,
      bookMediaId: existing?.id ?? null,
    };
  }

  /**
   * Heuristic to detect audiobooks from OpenLibrary results.
   * Checks publisher name against known audiobook publishers.
   */
  private isLikelyAudiobook(result: BookResult): boolean {
    if (result.publisher) {
      const pubLower = result.publisher.toLowerCase();
      return AUDIOBOOK_PUBLISHERS.some((ap) => pubLower.includes(ap));
    }
    return false;
  }
}

export default BookSearchService;
