import ExternalAPI from '@server/api/externalapi';
import { MediaType } from '@server/constants/media';
import type {
  ConnectionTestResult,
  DownloadManagerAdapter,
  MediaRequest,
  QualityProfile,
  RequestStatus,
  RootFolder,
  SubmissionResult,
} from '@server/lib/adapters/interfaces';
import cacheManager from '@server/lib/cache';
import logger from '@server/logger';

interface ReadarrBookResult {
  id: number;
  title: string;
  foreignBookId: string;
  authorId: number;
  editions: Array<{
    id: number;
    title: string;
    foreignEditionId: string;
    isbn13?: string;
  }>;
}

interface ReadarrAuthorResult {
  id: number;
  authorName: string;
  foreignAuthorId: string;
}

interface ReadarrConfig {
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl?: string;
}

/**
 * Readarr adapter following the Libreseerr matching pattern.
 * ISBN lookup first, then title+author fallback.
 */
export class ReadarrAdapter extends ExternalAPI implements DownloadManagerAdapter {
  readonly mediaTypes = [MediaType.BOOK, MediaType.AUDIOBOOK];
  readonly name = 'Readarr';

  private apiKey: string;

  constructor(config: ReadarrConfig) {
    const protocol = config.useSsl ? 'https' : 'http';
    const baseUrl = `${protocol}://${config.hostname}:${config.port}${config.baseUrl || ''}/api/v1`;

    super(baseUrl, { apikey: config.apiKey }, {
      nodeCache: cacheManager.getCache('readarr'),
    });

    this.apiKey = config.apiKey;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await this.axios.get('/system/status');
      return {
        success: true,
        message: `Connected to Readarr v${response.data.version}`,
      };
    } catch (e) {
      return {
        success: false,
        message: `Readarr connection failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async submitRequest(request: MediaRequest): Promise<SubmissionResult> {
    try {
      // Step 1: Look up book by ISBN or title
      const book = await this.lookupBook(request.externalId, request.title);
      if (!book) {
        return {
          success: false,
          message: `Book not found in Readarr: ${request.title}`,
        };
      }

      // Step 2: Add book to Readarr
      const response = await this.axios.post('/book', {
        foreignBookId: book.foreignBookId,
        title: book.title,
        qualityProfileId: request.qualityProfileId,
        rootFolderPath: request.rootFolderPath,
        monitored: true,
        addOptions: { searchForNewBook: true },
      });

      return {
        success: true,
        externalId: String(response.data.id),
      };
    } catch (e) {
      logger.error('Readarr submit request failed', {
        label: 'readarr',
        error: e instanceof Error ? e.message : String(e),
      });
      return {
        success: false,
        message: `Failed to add book to Readarr: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async checkStatus(externalId: string): Promise<RequestStatus> {
    try {
      const response = await this.axios.get(`/book/${externalId}`);
      const book = response.data;

      if (book.statistics?.bookFileCount > 0) {
        return { status: 'completed' };
      }

      // Check queue
      const queue = await this.axios.get('/queue');
      const inQueue = queue.data.records?.find(
        (r: { bookId: number }) => r.bookId === parseInt(externalId, 10)
      );

      if (inQueue) {
        return { status: 'downloading', message: inQueue.status };
      }

      return { status: 'queued' };
    } catch {
      return { status: 'unknown' };
    }
  }

  async getQualityProfiles(): Promise<QualityProfile[]> {
    const response = await this.axios.get('/qualityprofile');
    return response.data.map((p: { id: number; name: string }) => ({
      id: p.id,
      name: p.name,
    }));
  }

  async getRootFolders(): Promise<RootFolder[]> {
    const response = await this.axios.get('/rootfolder');
    return response.data.map(
      (f: { id: number; path: string; freeSpace: number }) => ({
        id: f.id,
        path: f.path,
        freeSpace: f.freeSpace,
      })
    );
  }

  /**
   * Libreseerr-pattern: ISBN lookup first, then title search fallback.
   */
  private async lookupBook(
    isbn: string,
    title: string
  ): Promise<ReadarrBookResult | null> {
    // Try ISBN lookup
    try {
      const response = await this.axios.get('/book/lookup', {
        params: { term: `isbn:${isbn}` },
      });
      if (response.data?.length > 0) {
        return response.data[0];
      }
    } catch {
      // ISBN lookup failed, try title
    }

    // Fallback: title search
    try {
      const response = await this.axios.get('/book/lookup', {
        params: { term: title },
      });
      if (response.data?.length > 0) {
        return response.data[0];
      }
    } catch {
      // Title lookup failed
    }

    return null;
  }
}

export default ReadarrAdapter;
