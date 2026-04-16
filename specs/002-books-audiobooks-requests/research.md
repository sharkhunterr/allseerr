# Phase 0 Research: Books and Audiobooks Requests

**Date**: 2026-04-16 | **Spec**: spec.md | **Plan**: plan.md

## 1. OpenLibrary Search API

### Overview

OpenLibrary is a free, open metadata source for books. No API key required. The Libreseerr project (by zamnzim) uses it as the sole user-facing search source.

### Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `https://openlibrary.org/search.json` | GET | Full-text search by title, author, ISBN |
| `https://openlibrary.org/search/authors.json` | GET | Author search |
| `https://openlibrary.org/works/{olid}.json` | GET | Work details (canonical record) |
| `https://openlibrary.org/books/{olid}.json` | GET | Edition details (specific printing) |
| `https://openlibrary.org/isbn/{isbn}.json` | GET | Edition lookup by ISBN (redirects to edition) |
| `https://openlibrary.org/authors/{olid}.json` | GET | Author details |

### Search Parameters

```
GET /search.json?q={query}&page={page}&limit={limit}&fields={fields}
```

Key query parameters:
- `q` -- general search (title, author, subject)
- `title` -- title-specific search
- `author` -- author-specific search
- `isbn` -- ISBN search
- `page` -- pagination (1-indexed)
- `limit` -- results per page (max 100, default 100)
- `fields` -- comma-separated field list to reduce payload size
- `sort` -- `new`, `old`, `random`, `key`

Recommended fields for Allseerr:
```
key,title,author_name,author_key,first_publish_year,publisher,isbn,cover_i,
number_of_pages_median,subject,edition_count,language,has_fulltext
```

### Response Format (search.json)

```json
{
  "numFound": 1234,
  "start": 0,
  "numFoundExact": true,
  "docs": [
    {
      "key": "/works/OL12345W",
      "title": "The Hitchhiker's Guide to the Galaxy",
      "author_name": ["Douglas Adams"],
      "author_key": ["OL1234A"],
      "first_publish_year": 1979,
      "publisher": ["Pan Books", "Harmony Books"],
      "isbn": ["0345391802", "9780345391803"],
      "cover_i": 8739161,
      "number_of_pages_median": 224,
      "edition_count": 382,
      "language": ["eng"],
      "subject": ["Science fiction", "Humorous stories"]
    }
  ]
}
```

Cover image URL pattern:
```
https://covers.openlibrary.org/b/id/{cover_i}-{size}.jpg
```
Sizes: `S` (small), `M` (medium), `L` (large).

### Works Detail (/works/{olid}.json)

Returns canonical work data including:
- `title`, `description` (string or `{ value: string }`)
- `subjects`, `subject_places`, `subject_times`
- `covers` (array of cover IDs)
- `links` (external links)
- `first_publish_date`

### Edition Detail (/books/{olid}.json)

Returns edition-specific data including:
- `title`, `publishers`, `publish_date`
- `isbn_10`, `isbn_13`
- `physical_format` (e.g., "Paperback", "Hardcover")
- `number_of_pages`
- `covers`
- `works` (link to parent work)
- `identifiers` (Goodreads, LibraryThing, Amazon, etc.)

### Rate Limits

- **Documented**: No hard limit, but OpenLibrary asks for responsible use
- **Practical guideline**: 100 requests per 5 minutes (based on community reports and Libreseerr behavior)
- **Recommendation**: Implement `axios-rate-limit` at 1 request per 3 seconds for OpenLibrary calls
- **Caching**: Cache search results for 5 minutes (matches DEFAULT_TTL in ExternalAPI)
- **User-Agent**: OpenLibrary requests a descriptive User-Agent header; use `Allseerr/{version} (https://github.com/allseerr/allseerr)`

### Audiobook Detection

OpenLibrary does not distinguish ebooks from audiobooks natively. Audiobook editions can sometimes be identified by:
- `physical_format` containing "Audio" or "Audio CD"
- Publisher names like "Audible Studios", "Brilliance Audio", "Recorded Books"
- The `identifiers` field may contain `audible` ASINs

For reliable audiobook metadata, Bindery routes through Audnexus. Allseerr should use OpenLibrary for initial search and let Bindery enrich audiobook-specific fields (narrator, duration).

### Implementation Notes

- OpenLibrary `key` values (e.g., `/works/OL12345W`) serve as `foreignBookId` for deduplication
- Author `key` values (e.g., `/authors/OL1234A`) serve as `foreignAuthorId`
- ISBN lookup (`/isbn/{isbn}.json`) returns a 302 redirect to the edition; follow redirects
- Search by ISBN: use the `isbn` query parameter, not the `/isbn/` endpoint

## 2. Bindery API

### Overview

Bindery is a book/audiobook download manager designed as a modern replacement for Readarr. It is relatively new and API documentation may be limited. The following is based on available source code analysis and community documentation.

### Connection

```
Base URL: {hostname}:{port}/api/v1
Authentication: API key via X-Api-Key header or ?apikey= query parameter
```

### Key Endpoints (Expected)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/system/status` | GET | Health check / test connection |
| `/api/v1/book` | GET | List monitored books |
| `/api/v1/book` | POST | Add a book to download queue |
| `/api/v1/book/{id}` | GET | Get book details + download status |
| `/api/v1/book/{id}` | DELETE | Remove a book |
| `/api/v1/author` | GET | List authors |
| `/api/v1/author/lookup` | GET | Search for author by name |
| `/api/v1/book/lookup` | GET | Search for book by title/ISBN |
| `/api/v1/qualityprofile` | GET | List quality profiles |
| `/api/v1/rootfolder` | GET | List root folders |
| `/api/v1/queue` | GET | Current download queue |
| `/api/v1/command` | POST | Trigger commands (e.g., BookSearch) |

### Adding a Book (Expected Request Body)

```json
{
  "title": "The Hitchhiker's Guide to the Galaxy",
  "foreignBookId": "OL12345W",
  "foreignAuthorId": "OL1234A",
  "qualityProfileId": 1,
  "rootFolderPath": "/books",
  "monitored": true,
  "searchForNewBook": true,
  "addOptions": {
    "searchForNewBook": true
  }
}
```

### Audiobook Support

Bindery handles audiobooks through the same API with audiobook-specific quality profiles and root folders. The media type distinction is made through configuration, not separate endpoints.

### Test Connection

```
GET /api/v1/system/status
Expected: 200 OK with version info
```

### Adapter Implementation Notes

- Follows the same pattern as Radarr/Sonarr (Servarr-family API)
- Use `ExternalAPI` base class, not `ServarrBase` (Bindery may differ in specifics)
- Cache quality profiles and root folders for 1 hour (same as ServarrBase)
- If Bindery is unreachable, the adapter should throw a typed error that `BookDownloadService` catches to trigger Readarr fallback

### Research Gaps

- Bindery API documentation is evolving; the adapter should be built with graceful degradation
- Test against a real Bindery instance during development to verify endpoint signatures
- Bindery may use `foreignBookId` from OpenLibrary or its own internal ID scheme

## 3. Readarr API

### Overview

Readarr is a Servarr-family book manager (like Radarr for movies). It uses the same API patterns as Radarr/Sonarr. The Libreseerr project (zamnzim) provides a reference implementation for integration.

### Connection

```
Base URL: {hostname}:{port}/api/v1
Authentication: API key via apikey query parameter (same as Radarr/Sonarr)
```

### Key Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/system/status` | GET | Health check |
| `/api/v1/book` | GET | List all monitored books |
| `/api/v1/book` | POST | Add a book |
| `/api/v1/book/{id}` | GET | Get book details |
| `/api/v1/book/lookup` | GET | Search for a book (`?term=isbn:{isbn}` or `?term={title}`) |
| `/api/v1/author` | GET | List authors |
| `/api/v1/author/lookup` | GET | Search for author (`?term={name}`) |
| `/api/v1/qualityprofile` | GET | Quality profiles |
| `/api/v1/metadataprofile` | GET | Metadata profiles |
| `/api/v1/rootfolder` | GET | Root folders |
| `/api/v1/queue` | GET | Download queue |
| `/api/v1/tag` | GET/POST | Tags |
| `/api/v1/command` | POST | Run commands (BookSearch, AuthorSearch) |

### Adding a Book via Readarr

```json
{
  "title": "The Hitchhiker's Guide to the Galaxy",
  "foreignBookId": "12345",
  "author": {
    "foreignAuthorId": "67890",
    "qualityProfileId": 1,
    "metadataProfileId": 1,
    "rootFolderPath": "/books",
    "monitored": true,
    "tags": []
  },
  "editions": [
    {
      "foreignEditionId": "11111",
      "title": "The Hitchhiker's Guide to the Galaxy",
      "monitored": true
    }
  ],
  "monitored": true,
  "addOptions": {
    "searchForNewBook": true
  }
}
```

### Book Lookup

```
GET /api/v1/book/lookup?term=isbn:9780345391803
GET /api/v1/book/lookup?term=hitchhiker%27s+guide
```

Response includes `foreignBookId`, author info, editions, and images.

### Libreseerr Matching Pattern (Reference)

The Libreseerr project by zamnzim implements the matching strategy we adopt:

1. **Search OpenLibrary** for the user query
2. **Get ISBN(s)** from the OpenLibrary work/edition
3. **Lookup in Readarr** using `isbn:{isbn}` -- this is the primary match
4. **Fallback**: If no ISBN match, search Readarr by `title + author` free text
5. **Use first result** from Readarr lookup (no fuzzy scoring)
6. **Dedup via `foreignBookId`/`foreignAuthorId`** from Readarr's GoodReads/OpenLibrary IDs

### Adapter Implementation Notes

- Extends `ServarrBase` exactly like RadarrAPI and SonarrAPI
- Use cache ID `readarr` (add to `AvailableCacheIds`)
- Reuse `QualityProfile`, `RootFolder`, `Tag` interfaces from `server/api/servarr/base.ts`
- Queue monitoring follows the same pattern as Radarr queue

## 4. Library Server APIs

### 4.1 Grimmory

**Status**: API documentation is sparse. Grimmory is a newer book server.

Expected API pattern (based on community reports):
- REST API with API key authentication
- Library listing, book search, book details
- Metadata includes title, author, ISBN, file path, cover

**Research gap**: Needs hands-on testing with a Grimmory instance. Consider making Grimmory support a stretch goal for Phase 1, with a clear adapter interface that can be filled in later.

### 4.2 Audiobookshelf

**Status**: Well-documented REST API.

```
Base URL: {hostname}:{port}/api
Authentication: Bearer token via Authorization header
   OR: API key via query parameter
```

Key endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/libraries` | GET | List libraries |
| `/api/libraries/{id}/items` | GET | List items in a library |
| `/api/libraries/{id}/search` | GET | Search within a library (`?q={query}`) |
| `/api/items/{id}` | GET | Item details |
| `/api/items/{id}/cover` | GET | Item cover image |
| `/api/ping` | GET | Health check |

Item response includes:
```json
{
  "id": "li_abc123",
  "media": {
    "metadata": {
      "title": "Book Title",
      "authorName": "Author Name",
      "narratorName": "Narrator Name",
      "isbn": "9781234567890",
      "asin": "B01234ABCD",
      "duration": 36000,
      "publisher": "Publisher Name"
    }
  }
}
```

**Matching strategy**: Search by ISBN first, then by title. The `isbn` and `asin` fields enable direct matching. Duration is in seconds.

**Test connection**: `GET /api/ping` returns `{ "success": true }`.

### 4.3 Calibre-Web

**Status**: Calibre-Web has a web-based API for OPDS feeds and some REST endpoints.

```
Base URL: {hostname}:{port}
Authentication: Session-based (login endpoint) or HTTP Basic Auth
```

Key endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/opds` | GET | OPDS catalog (Atom XML feed) |
| `/opds/search/{query}` | GET | OPDS search |
| `/ajax/books` | GET | JSON book list (internal API) |
| `/ajax/book/{id}` | GET | Book details JSON |
| `/ajax/search?query={q}` | GET | JSON search |

OPDS search response includes `<entry>` elements with:
- `<title>`, `<author>`, `<id>` (Calibre ID)
- `<dc:identifier>` for ISBN (`urn:isbn:...`)
- `<link rel="http://opds-spec.org/image">` for cover

**Matching strategy**: Search OPDS by ISBN (`/opds/search/isbn:{isbn}`), fallback to title+author.

**Test connection**: `GET /opds` should return valid Atom XML.

**Note**: Calibre-Web's internal AJAX API is not officially documented and may change between versions. Prefer OPDS where possible.

### 4.4 Kavita

**Status**: Well-documented REST API with OpenAPI spec.

```
Base URL: {hostname}:{port}/api
Authentication: JWT token via Authorization: Bearer header
   Login: POST /api/Account/login with { "username": "...", "password": "..." }
   OR: API key via /api/Plugin/authenticate?apiKey={key}&pluginName=Allseerr
```

Key endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/Plugin/authenticate` | POST | Get JWT from API key |
| `/api/Server/server-info` | GET | Health check |
| `/api/Library` | GET | List libraries |
| `/api/Series/all` | POST | List all series (books are treated as single-issue series) |
| `/api/Series/search` | GET | Search (`?queryString={query}`) |
| `/api/Series/{id}` | GET | Series details |
| `/api/Series/{id}/metadata` | GET | Full metadata including ISBN |

Search response includes:
```json
{
  "series": [
    {
      "id": 1,
      "name": "Book Title",
      "sortName": "book title",
      "localizedName": "Book Title",
      "libraryId": 1,
      "libraryName": "Books",
      "coverImage": "cover-min.jpg"
    }
  ]
}
```

Metadata response includes ISBN:
```json
{
  "isbn": "9781234567890",
  "writers": [{ "id": 1, "name": "Author Name" }],
  "publishers": [{ "id": 1, "name": "Publisher" }]
}
```

**Matching strategy**: Search by title, then verify ISBN from metadata. Kavita does not support direct ISBN search in the search endpoint.

**Test connection**: `GET /api/Server/server-info` after authentication.

## 5. Matching Strategy Implementation

### Overview

The matching strategy follows Libreseerr's pattern: OpenLibrary is the source of truth for user-facing search; library servers are matched via ISBN cascade.

### Algorithm (BookMatchingService)

```
function matchBookInLibrary(bookMedia: BookMedia, adapter: MediaLibraryAdapter):
  1. If bookMedia.isbn13:
     result = adapter.searchByISBN(bookMedia.isbn13)
     if result: return result

  2. If bookMedia.isbn10:
     result = adapter.searchByISBN(bookMedia.isbn10)
     if result: return result

  3. Fallback: title + author search
     result = adapter.searchByTitleAuthor(bookMedia.title, bookMedia.authorName)
     if result: return result (first match, no fuzzy scoring)

  4. Return null (no match found)
```

### ISBN Cascade Details

- ISBN-13 is preferred over ISBN-10 (more unique)
- OpenLibrary returns both `isbn_10` and `isbn_13` arrays on editions
- Some library servers index by ISBN-13, some by ISBN-10 -- try both
- Audiobooks may lack ISBNs; use ASIN where available (Audiobookshelf supports ASIN matching)

### Deduplication

- `foreignBookId`: OpenLibrary work key (e.g., `/works/OL12345W`) stored on `BookMedia`
- `foreignAuthorId`: OpenLibrary author key (e.g., `/authors/OL1234A`)
- Before creating a new `BookMedia` record, check if one already exists with the same `foreignBookId`
- Multiple editions of the same work share the same `foreignBookId` but may have different ISBNs

### Library Server Adapter Interface Extension

Each library adapter must implement these matching methods:

```typescript
interface BookLibraryAdapter extends MediaLibraryAdapter {
  searchByISBN(isbn: string): Promise<LibraryBookResult | null>;
  searchByTitleAuthor(title: string, author: string): Promise<LibraryBookResult | null>;
  searchByASIN(asin: string): Promise<LibraryBookResult | null>;
}
```

## 6. Extending the Unified Search Bar

### Current Architecture

The search bar (`server/routes/search.ts`) calls `findSearchProvider()` from `server/lib/search.ts` to check for prefix-based queries (e.g., `tmdb:`, `imdb:`, `tvdb:`, `year:`). If no provider matches, it falls back to TMDB `searchMulti()`.

### Extension Plan

1. **Add `isbn:` search provider** to `server/lib/search.ts`:
   - Pattern: `/(?<=isbn:)[\dXx-]+/`
   - Calls OpenLibrary `/isbn/{isbn}.json` and returns results in a unified format

2. **Add `book:` search provider**:
   - Pattern: `/(?<=book:).+/`
   - Calls OpenLibrary `/search.json?q={query}`
   - Returns book results with `media_type: 'book'`

3. **New `/api/v1/book/search` route** (separate from main search):
   - Dedicated book/audiobook search endpoint
   - Called by the frontend when the "Books" or "Audiobooks" tab is active
   - Returns `BookSearchResult[]` with full book metadata

4. **Frontend tabs**:
   - Add "Books" and "Audiobooks" tabs to the search results page
   - Default tab: "All" (existing behavior, movies + TV only for now)
   - "Books" tab calls `/api/v1/book/search`
   - "Audiobooks" tab calls `/api/v1/book/search?type=audiobook`
   - The main search bar continues to work as-is for movie/TV

### Response Format Mapping

OpenLibrary results must be mapped to a format compatible with the existing search result patterns:

```typescript
interface BookSearchResult {
  id: string;                    // OpenLibrary work key
  mediaType: MediaType.BOOK | MediaType.AUDIOBOOK;
  title: string;
  authorName: string[];
  authorKey: string[];
  firstPublishYear: number | null;
  publisher: string[];
  isbn: string[];
  coverUrl: string | null;       // OpenLibrary cover URL
  pageCount: number | null;
  editionCount: number;
  subjects: string[];
  // Availability overlay (from local BookMedia)
  mediaStatus: MediaStatus | null;
  requestStatus: MediaRequestStatus | null;
}
```

This keeps book results structurally similar to movie/TV results while carrying book-specific metadata.
