# API Contracts: Books and Audiobooks

**Date**: 2026-04-16 | **Spec**: spec.md | **Plan**: plan.md

All endpoints are prefixed with `/api/v1`. Authentication follows the existing Allseerr pattern (session cookie or API key header).

---

## 1. Book Search

### GET /api/v1/book/search

Search for books or audiobooks via OpenLibrary.

**Permissions**: Any authenticated user

**Query Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Search term (title, author, ISBN) |
| `type` | string | No | `book` (default) or `audiobook` |
| `page` | number | No | Page number (1-indexed, default 1) |
| `limit` | number | No | Results per page (default 20, max 100) |
| `language` | string | No | ISO 639-1 language code filter |

**Response 200**:

```json
{
  "page": 1,
  "totalPages": 5,
  "totalResults": 97,
  "results": [
    {
      "id": "/works/OL12345W",
      "mediaType": "book",
      "title": "The Hitchhiker's Guide to the Galaxy",
      "authorName": ["Douglas Adams"],
      "authorKey": ["/authors/OL1234A"],
      "firstPublishYear": 1979,
      "publisher": ["Pan Books", "Harmony Books"],
      "isbn": ["9780345391803", "0345391802"],
      "coverUrl": "https://covers.openlibrary.org/b/id/8739161-M.jpg",
      "pageCount": 224,
      "editionCount": 382,
      "subjects": ["Science fiction", "Humorous stories"],
      "language": ["eng"],
      "mediaStatus": null,
      "requestStatus": null
    },
    {
      "id": "/works/OL12345W",
      "mediaType": "book",
      "title": "The Hitchhiker's Guide to the Galaxy",
      "authorName": ["Douglas Adams"],
      "authorKey": ["/authors/OL1234A"],
      "firstPublishYear": 1979,
      "publisher": ["Random House Audio"],
      "isbn": ["9780739322208"],
      "coverUrl": "https://covers.openlibrary.org/b/id/8739162-M.jpg",
      "pageCount": null,
      "editionCount": 382,
      "subjects": ["Science fiction"],
      "language": ["eng"],
      "mediaStatus": "available",
      "requestStatus": null
    }
  ]
}
```

**Response 500**:

```json
{
  "status": 500,
  "message": "Unable to retrieve book search results."
}
```

---

### GET /api/v1/book/:id

Get detailed information about a specific book by OpenLibrary work key.

**Permissions**: Any authenticated user

**Path Parameters**:

| Parameter | Type | Description |
|---|---|---|
| `id` | string | OpenLibrary work key (URL-encoded, e.g., `OL12345W`) |

**Response 200**:

```json
{
  "id": "/works/OL12345W",
  "mediaType": "book",
  "title": "The Hitchhiker's Guide to the Galaxy",
  "description": "The misadventures of Arthur Dent...",
  "authorName": ["Douglas Adams"],
  "authorKey": ["/authors/OL1234A"],
  "firstPublishYear": 1979,
  "subjects": ["Science fiction", "Humorous stories"],
  "coverUrl": "https://covers.openlibrary.org/b/id/8739161-L.jpg",
  "editions": [
    {
      "id": "/books/OL7353617M",
      "title": "The Hitchhiker's Guide to the Galaxy",
      "publisher": "Pan Books",
      "publishDate": "1979",
      "isbn13": "9780345391803",
      "isbn10": "0345391802",
      "format": "Paperback",
      "pageCount": 224,
      "coverUrl": "https://covers.openlibrary.org/b/id/8739161-M.jpg"
    }
  ],
  "mediaStatus": null,
  "requestStatus": null,
  "libraryServerUrl": null,
  "existingRequestId": null
}
```

**Response 404**:

```json
{
  "status": 404,
  "message": "Book not found."
}
```

---

## 2. Book Requests

### POST /api/v1/book/request

Submit a book or audiobook request.

**Permissions**: `REQUEST` or `REQUEST_BOOK` (for books), `REQUEST` or `REQUEST_AUDIOBOOK` (for audiobooks)

**Request Body**:

```json
{
  "mediaType": "book",
  "openLibraryId": "/works/OL12345W",
  "title": "The Hitchhiker's Guide to the Galaxy",
  "authorName": "Douglas Adams",
  "isbn": "9780345391803",
  "foreignBookId": "/works/OL12345W",
  "foreignAuthorId": "/authors/OL1234A",
  "coverUrl": "https://covers.openlibrary.org/b/id/8739161-M.jpg",
  "note": "Prefer EPUB format if possible",
  "preferredFormat": null,
  "serverId": null,
  "profileId": null,
  "rootFolder": null
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `mediaType` | `"book"` or `"audiobook"` | Yes | Media type |
| `openLibraryId` | string | Yes | OpenLibrary work key |
| `title` | string | Yes | Book title |
| `authorName` | string | Yes | Author name(s) |
| `isbn` | string | No | ISBN-13 or ISBN-10 |
| `foreignBookId` | string | Yes | Deduplication key |
| `foreignAuthorId` | string | No | Author dedup key |
| `coverUrl` | string | No | Cover image URL |
| `note` | string | No | Optional user note (FR-009) |
| `preferredFormat` | string | No | `"unabridged"` or `"abridged"` (audiobooks only, FR-036) |
| `serverId` | number | No | Specific download manager instance ID |
| `profileId` | number | No | Quality profile override |
| `rootFolder` | string | No | Root folder override |

**Response 201**:

```json
{
  "id": 42,
  "status": 1,
  "type": "book",
  "createdAt": "2026-04-16T12:00:00.000Z",
  "updatedAt": "2026-04-16T12:00:00.000Z",
  "bookMedia": {
    "id": 7,
    "foreignBookId": "/works/OL12345W",
    "title": "The Hitchhiker's Guide to the Galaxy",
    "authorName": "Douglas Adams",
    "isbn13": "9780345391803",
    "status": 2,
    "coverUrl": "https://covers.openlibrary.org/b/id/8739161-M.jpg"
  },
  "requestedBy": {
    "id": 1,
    "displayName": "User"
  }
}
```

**Response 403**:

```json
{
  "status": 403,
  "message": "You do not have permission to make book requests."
}
```

**Response 409** (duplicate):

```json
{
  "status": 409,
  "message": "Request for this book already exists.",
  "existingRequestId": 41,
  "existingStatus": 1
}
```

---

### GET /api/v1/book/request

List book and audiobook requests.

**Permissions**: `MANAGE_REQUESTS` for all requests, or own requests for any user.

**Query Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `type` | string | No | `book`, `audiobook`, or omit for both |
| `status` | number | No | Filter by MediaRequestStatus value |
| `page` | number | No | Page number (default 1) |
| `limit` | number | No | Results per page (default 20) |
| `userId` | number | No | Filter by requesting user (admin only) |
| `sort` | string | No | `created` (default), `updated`, `status` |
| `order` | string | No | `asc` or `desc` (default) |

**Response 200**:

```json
{
  "page": 1,
  "totalPages": 3,
  "totalResults": 52,
  "results": [
    {
      "id": 42,
      "status": 1,
      "type": "book",
      "createdAt": "2026-04-16T12:00:00.000Z",
      "bookMedia": {
        "id": 7,
        "title": "The Hitchhiker's Guide to the Galaxy",
        "authorName": "Douglas Adams",
        "coverUrl": "https://covers.openlibrary.org/b/id/8739161-M.jpg",
        "status": 2
      },
      "requestedBy": {
        "id": 1,
        "displayName": "User"
      },
      "note": "Prefer EPUB format if possible"
    }
  ]
}
```

---

### PUT /api/v1/book/request/:id

Update a book request (approve, decline, mark unavailable).

**Permissions**: `MANAGE_REQUESTS`

**Path Parameters**:

| Parameter | Type | Description |
|---|---|---|
| `id` | number | Request ID |

**Request Body**:

```json
{
  "status": 2,
  "reason": "Approved - will be available shortly"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `status` | number | Yes | New MediaRequestStatus (2=APPROVED, 3=DECLINED, 4=FAILED, 5=COMPLETED) |
| `reason` | string | No | Admin reason (included in notification for declines, FR-017) |

**Response 200**:

```json
{
  "id": 42,
  "status": 2,
  "type": "book",
  "modifiedBy": {
    "id": 1,
    "displayName": "Admin"
  },
  "updatedAt": "2026-04-16T12:05:00.000Z"
}
```

---

### DELETE /api/v1/book/request/:id

Delete a book request.

**Permissions**: `MANAGE_REQUESTS` or own request while PENDING.

**Response 204**: No content.

---

## 3. Settings: Download Managers

### GET /api/v1/settings/book/download-managers

List configured download manager instances.

**Permissions**: `MANAGE_SETTINGS`

**Response 200**:

```json
[
  {
    "id": 1,
    "name": "Bindery Main",
    "type": "bindery",
    "hostname": "bindery.local",
    "port": 8787,
    "useSsl": false,
    "baseUrl": null,
    "externalUrl": null,
    "mediaTypes": ["book", "audiobook"],
    "activeProfileId": 1,
    "activeProfileName": "Standard",
    "activeDirectory": "/books",
    "isDefault": true,
    "isFallback": false,
    "tags": [],
    "syncEnabled": true,
    "preventSearch": false
  }
]
```

---

### POST /api/v1/settings/book/download-managers

Add a new download manager instance.

**Permissions**: `MANAGE_SETTINGS`

**Request Body**:

```json
{
  "name": "Bindery Main",
  "type": "bindery",
  "hostname": "bindery.local",
  "port": 8787,
  "apiKey": "abc123...",
  "useSsl": false,
  "baseUrl": null,
  "externalUrl": null,
  "mediaTypes": ["book", "audiobook"],
  "activeProfileId": 1,
  "activeProfileName": "Standard",
  "activeDirectory": "/books",
  "isDefault": true,
  "isFallback": false,
  "tags": [],
  "syncEnabled": true,
  "preventSearch": false
}
```

**Response 201**: Created instance object (same shape as GET response item).

---

### PUT /api/v1/settings/book/download-managers/:id

Update an existing download manager instance.

**Permissions**: `MANAGE_SETTINGS`

**Request/Response**: Same shape as POST.

---

### DELETE /api/v1/settings/book/download-managers/:id

Remove a download manager instance.

**Permissions**: `MANAGE_SETTINGS`

**Response 204**: No content.

---

### POST /api/v1/settings/book/download-managers/test

Test connection to a download manager.

**Permissions**: `MANAGE_SETTINGS`

**Request Body**:

```json
{
  "type": "bindery",
  "hostname": "bindery.local",
  "port": 8787,
  "apiKey": "abc123...",
  "useSsl": false,
  "baseUrl": null
}
```

**Response 200** (success):

```json
{
  "success": true,
  "version": "1.2.3",
  "profiles": [
    { "id": 1, "name": "Standard" },
    { "id": 2, "name": "High Quality" }
  ],
  "rootFolders": [
    { "id": 1, "path": "/books", "freeSpace": 107374182400 }
  ]
}
```

**Response 400** (failure):

```json
{
  "success": false,
  "message": "Connection refused: ECONNREFUSED bindery.local:8787"
}
```

---

## 4. Settings: Library Servers

### GET /api/v1/settings/book/library-servers

List configured library server instances.

**Permissions**: `MANAGE_SETTINGS`

**Response 200**:

```json
[
  {
    "id": 1,
    "name": "Audiobookshelf",
    "type": "audiobookshelf",
    "hostname": "abs.local",
    "port": 13378,
    "useSsl": false,
    "baseUrl": null,
    "externalUrl": "https://abs.example.com",
    "mediaTypes": ["audiobook"],
    "scanIntervalSeconds": 300,
    "libraryIds": ["lib_abc123"],
    "enabled": true,
    "lastScan": "2026-04-16T11:55:00.000Z"
  }
]
```

---

### POST /api/v1/settings/book/library-servers

Add a new library server instance.

**Permissions**: `MANAGE_SETTINGS`

**Request Body**:

```json
{
  "name": "Audiobookshelf",
  "type": "audiobookshelf",
  "hostname": "abs.local",
  "port": 13378,
  "apiKey": "token123...",
  "useSsl": false,
  "baseUrl": null,
  "externalUrl": "https://abs.example.com",
  "mediaTypes": ["audiobook"],
  "scanIntervalSeconds": 300,
  "libraryIds": ["lib_abc123"],
  "enabled": true
}
```

**Response 201**: Created instance object.

---

### PUT /api/v1/settings/book/library-servers/:id

Update an existing library server instance.

**Permissions**: `MANAGE_SETTINGS`

**Request/Response**: Same shape as POST.

---

### DELETE /api/v1/settings/book/library-servers/:id

Remove a library server instance.

**Permissions**: `MANAGE_SETTINGS`

**Response 204**: No content.

---

### POST /api/v1/settings/book/library-servers/test

Test connection to a library server.

**Permissions**: `MANAGE_SETTINGS`

**Request Body**:

```json
{
  "type": "audiobookshelf",
  "hostname": "abs.local",
  "port": 13378,
  "apiKey": "token123...",
  "useSsl": false,
  "baseUrl": null
}
```

**Response 200** (success):

```json
{
  "success": true,
  "version": "2.7.0",
  "libraries": [
    { "id": "lib_abc123", "name": "Audiobooks", "mediaType": "audiobook" },
    { "id": "lib_def456", "name": "Podcasts", "mediaType": "podcast" }
  ]
}
```

**Response 400** (failure):

```json
{
  "success": false,
  "message": "Authentication failed: invalid API key"
}
```

---

### POST /api/v1/settings/book/library-servers/:id/scan

Trigger an immediate scan on a library server instance.

**Permissions**: `MANAGE_SETTINGS`

**Response 202**:

```json
{
  "message": "Scan triggered for Audiobookshelf",
  "instanceId": 1
}
```

---

## 5. Book Availability

### GET /api/v1/book/:id/availability

Check current availability of a book across all configured library servers.

**Permissions**: Any authenticated user

**Path Parameters**:

| Parameter | Type | Description |
|---|---|---|
| `id` | string | OpenLibrary work key (e.g., `OL12345W`) |

**Response 200**:

```json
{
  "available": true,
  "servers": [
    {
      "serverName": "Kavita",
      "serverType": "kavita",
      "serverUrl": "https://kavita.example.com/library/1/series/42",
      "format": "EPUB"
    }
  ]
}
```

**Response 200** (not available):

```json
{
  "available": false,
  "servers": []
}
```

---

## 6. ISBN Search Provider (Search Bar Integration)

The existing unified search bar supports prefix-based providers. Two new providers are added:

### isbn: prefix

```
GET /api/v1/search?query=isbn:9780345391803
```

Routes to OpenLibrary ISBN lookup. Returns results in the standard search response format with `media_type: "book"`.

### book: prefix

```
GET /api/v1/search?query=book:hitchhiker
```

Routes to OpenLibrary search. Returns results in the standard search response format.

These providers are registered in `server/lib/search.ts` alongside the existing `tmdb:`, `imdb:`, `tvdb:`, and `year:` providers. Results are returned in a unified format that the frontend can render alongside movie/TV results.

---

## Error Responses

All endpoints follow the existing Allseerr error pattern:

```json
{
  "status": 400 | 403 | 404 | 409 | 500,
  "message": "Human-readable error description"
}
```

| Status | Meaning |
|---|---|
| 400 | Invalid request body or parameters |
| 403 | Insufficient permissions |
| 404 | Resource not found |
| 409 | Conflict (duplicate request) |
| 500 | Internal server error (OpenLibrary unreachable, etc.) |
