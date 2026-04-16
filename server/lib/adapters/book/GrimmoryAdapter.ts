import { MediaType } from '@server/constants/media';
import type {
  AvailabilityResult,
  BookLibraryAdapter,
  BookSearchResult,
  ConnectionTestResult,
} from '@server/lib/adapters/interfaces';

/**
 * Grimmory adapter — STUB implementation.
 * API documentation is sparse. All methods throw NotImplementedError.
 * TODO: Implement when Grimmory API docs become available.
 */
export class GrimmoryAdapter implements BookLibraryAdapter {
  readonly mediaTypes = [MediaType.BOOK];
  readonly name = 'Grimmory';

  async testConnection(): Promise<ConnectionTestResult> {
    return {
      success: false,
      message:
        'Grimmory integration is not yet implemented. API documentation pending.',
    };
  }

  async checkAvailability(
    _externalId: string,
    _type: MediaType
  ): Promise<AvailabilityResult> {
    throw new Error(
      'Grimmory adapter not yet implemented. See Phase 1 spec.'
    );
  }

  async triggerLibraryScan(): Promise<void> {
    throw new Error(
      'Grimmory adapter not yet implemented. See Phase 1 spec.'
    );
  }

  async searchByISBN(_isbn: string): Promise<BookSearchResult | null> {
    throw new Error(
      'Grimmory adapter not yet implemented. See Phase 1 spec.'
    );
  }

  async searchByTitleAuthor(
    _title: string,
    _author: string
  ): Promise<BookSearchResult[]> {
    throw new Error(
      'Grimmory adapter not yet implemented. See Phase 1 spec.'
    );
  }
}

export default GrimmoryAdapter;
