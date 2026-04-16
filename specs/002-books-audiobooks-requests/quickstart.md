# Developer Quickstart: Books and Audiobooks Requests

**Date**: 2026-04-16 | **Branch**: `002-books-audiobooks-requests`

## Prerequisites

- Node.js (version from `.nvmrc`)
- pnpm (never npm or yarn)
- A running Allseerr dev instance (`pnpm dev`)
- (Optional) A Bindery or Readarr instance for download manager testing
- (Optional) An Audiobookshelf, Calibre-Web, or Kavita instance for library server testing

## Getting Started

```bash
# 1. Switch to the feature branch
git checkout 002-books-audiobooks-requests

# 2. Install dependencies
pnpm install

# 3. Start the dev server
pnpm dev
```

The dev server runs at `http://localhost:5055` by default.

## Key Files to Know

Before writing code, read these files to understand the patterns:

| What | File | Why |
|---|---|---|
| Constitution | `.specify/memory/constitution.md` | The rules: adapter pattern, no `any`, no modifying existing code |
| Spec | `specs/002-books-audiobooks-requests/spec.md` | Feature requirements (FR-001 to FR-042) |
| Plan | `specs/002-books-audiobooks-requests/plan.md` | Sub-phases, file layout, dependencies |
| Data model | `specs/002-books-audiobooks-requests/data-model.md` | Entity definitions for BookMedia, AudiobookMedia, etc. |
| API contracts | `specs/002-books-audiobooks-requests/contracts/book-api.md` | All endpoint signatures and payloads |
| Existing Media entity | `server/entity/Media.ts` | Pattern to follow for new entities |
| Existing MediaRequest | `server/entity/MediaRequest.ts` | Request lifecycle, notification hooks |
| Existing search | `server/lib/search.ts` | SearchProvider pattern for `isbn:` / `book:` prefixes |
| Existing settings | `server/lib/settings/index.ts` | AllSettings structure, DVRSettings pattern |
| Existing Radarr API | `server/api/servarr/radarr.ts` | Pattern for Readarr adapter |
| Existing ServarrBase | `server/api/servarr/base.ts` | Base class for Servarr-family adapters |
| Existing ExternalAPI | `server/api/externalapi.ts` | Base class for all external API clients |
| Existing permissions | `server/lib/permissions.ts` | Bitwise permission flags |

## Development Order

Follow the sub-phase order from plan.md. Each sub-phase produces independently testable output.

### Phase 1A: Foundation (start here)

1. Add `BOOK` and `AUDIOBOOK` to `MediaType` enum in `server/constants/media.ts`
2. Create adapter interfaces in `server/lib/adapters/interfaces.ts`
3. Create entity files: `BookMedia.ts`, `AudiobookMedia.ts`, `DownloadManagerInstance.ts`, `LibraryServerInstance.ts`
4. Add new permission flags to `server/lib/permissions.ts`
5. Extend `AllSettings` in `server/lib/settings/index.ts`

**Test**: Run `pnpm build` -- it should compile with no errors. Existing tests should still pass.

### Phase 1B: OpenLibrary Integration

1. Create `server/api/openlibrary/interfaces.ts` with response types
2. Create `server/api/openlibrary/index.ts` extending ExternalAPI
3. Create `server/lib/services/BookSearchService.ts`
4. Create `server/routes/book.ts` with search endpoints
5. Register the new route in the Express router

**Test**: `curl http://localhost:5055/api/v1/book/search?query=hitchhiker` should return results.

### Phase 1C: Download Manager Adapters

1. Create `server/lib/adapters/book/BinderyAdapter.ts`
2. Create `server/lib/adapters/book/ReadarrAdapter.ts`
3. Create `server/lib/services/BookDownloadService.ts`
4. Wire the request route to forward approved requests

**Test**: Configure a Bindery or Readarr instance in settings, approve a book request, verify it appears in the download manager.

### Phase 1D: Library Server Adapters

1. Create adapters for each library server type
2. Create `server/lib/services/BookMatchingService.ts`
3. Create `server/lib/services/BookAvailabilityScanner.ts`
4. Register the scanner as a cron job

**Test**: Add a book to a library server manually, wait for the scan interval, verify the book status updates to AVAILABLE.

### Phase 1E: Settings UI

1. Create `src/components/Settings/BooksAudiobooks/` components
2. Create `server/routes/settings/bookSettings.ts` for CRUD + test connection
3. Wire into the settings page navigation

**Test**: Navigate to Settings in the browser, configure a download manager and library server, test connections.

### Phase 1F: Frontend Search and Request

1. Create `BookCard` and `AudiobookCard` components
2. Create `BookDetail` page
3. Add media type tabs to search results
4. Wire the request button

**Test**: Search for a book in the UI, click request, verify it appears in the request dashboard.

## Adapter Pattern

Every external service must be behind an adapter. The constitution defines two interfaces:

```typescript
// server/lib/adapters/interfaces.ts

interface MediaLibraryAdapter {
  readonly mediaTypes: MediaType[];
  readonly name: string;
  checkAvailability(externalId: string, type: MediaType): Promise<AvailabilityResult>;
  triggerLibraryScan(externalId?: string): Promise<void>;
  testConnection(): Promise<ConnectionTestResult>;
}

interface DownloadManagerAdapter {
  readonly mediaTypes: MediaType[];
  readonly name: string;
  submitRequest(request: MediaRequest): Promise<SubmissionResult>;
  checkStatus(externalId: string): Promise<RequestStatus>;
  testConnection(): Promise<ConnectionTestResult>;
}
```

For book-specific matching, library adapters also implement:

```typescript
interface BookLibraryAdapter extends MediaLibraryAdapter {
  searchByISBN(isbn: string): Promise<LibraryBookResult | null>;
  searchByTitleAuthor(title: string, author: string): Promise<LibraryBookResult | null>;
  searchByASIN(asin: string): Promise<LibraryBookResult | null>;
}
```

## Common Patterns

### Creating an ExternalAPI client

Follow the existing pattern in `server/api/servarr/radarr.ts`:

```typescript
import ExternalAPI from '@server/api/externalapi';

class OpenLibraryAPI extends ExternalAPI {
  constructor() {
    super(
      'https://openlibrary.org',
      {},
      {
        headers: {
          'User-Agent': 'Allseerr/1.0 (https://github.com/allseerr/allseerr)',
        },
        rateLimit: { maxRPS: 1, maxRequests: 100 },
      }
    );
  }

  public async searchBooks(params: { query: string; page: number; limit: number }) {
    // ...
  }
}
```

### Adding a search provider

Follow the pattern in `server/lib/search.ts`:

```typescript
searchProviders.push({
  pattern: new RegExp(/(?<=isbn:)[\dXx-]+/),
  search: async ({ id }) => {
    const openLibrary = new OpenLibraryAPI();
    const result = await openLibrary.getByISBN(id);
    // Map to TmdbSearchMultiResponse format or a unified format
  },
});
```

### Creating a TypeORM entity

Follow the pattern in `server/entity/Media.ts`. Use:
- `@PrimaryGeneratedColumn()` for auto-increment IDs
- `@Column({ type: 'varchar' })` with explicit types (no implicit types)
- `@Index()` on frequently queried columns
- `@DbAwareColumn()` for datetime columns (SQLite/PostgreSQL compatibility)
- `constructor(init?: Partial<Entity>)` pattern

## Things to Avoid

Per the constitution:

- Do NOT modify existing movie/TV entities, routes, or services
- Do NOT use `any` -- every type must be explicit
- Do NOT call external APIs directly from services -- always go through an adapter
- Do NOT use `npm` or `yarn` -- always `pnpm`
- Do NOT hardcode URLs, credentials, or API keys
- Do NOT modify `.eslintrc.js`, `.prettierrc.js`, or `tsconfig.json`
- Do NOT run `synchronize: true` in production -- use explicit migrations

## Testing

```bash
# Run the full test suite (must pass with no regressions)
pnpm test

# Run only book-related tests
pnpm test -- --grep "book"

# Type-check without building
pnpm typecheck

# Lint
pnpm lint
```

Place tests in `__tests__/` directories co-located with the source files:
- `server/lib/adapters/book/__tests__/BinderyAdapter.test.ts`
- `server/lib/services/__tests__/BookMatchingService.test.ts`
- `server/api/openlibrary/__tests__/index.test.ts`

## Useful Commands

```bash
# Check OpenLibrary search manually
curl "https://openlibrary.org/search.json?q=hitchhiker&limit=5&fields=key,title,author_name,isbn,cover_i"

# Check OpenLibrary work details
curl "https://openlibrary.org/works/OL27516W.json"

# Check OpenLibrary edition by ISBN
curl -L "https://openlibrary.org/isbn/9780345391803.json"

# Test Audiobookshelf connection
curl -H "Authorization: Bearer YOUR_TOKEN" "http://abs.local:13378/api/ping"

# Test Kavita authentication
curl -X POST "http://kavita.local:5000/api/Plugin/authenticate?apiKey=YOUR_KEY&pluginName=Allseerr"
```

## Reference Projects

- **Libreseerr** (zamnzim): Reference implementation for OpenLibrary + Readarr integration. Study the matching strategy and API patterns.
- **Audiobookshelf API docs**: https://api.audiobookshelf.org/
- **Kavita API docs**: Swagger/OpenAPI available at `http://kavita-instance/swagger`
- **OpenLibrary API docs**: https://openlibrary.org/developers/api
