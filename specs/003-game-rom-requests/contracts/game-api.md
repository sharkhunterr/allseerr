# API Contracts: Video Game ROM Requests

**Feature Branch**: `003-game-rom-requests` | **Date**: 2026-04-16

All endpoints are under `/api/v1/`. Authentication is required for
all endpoints unless noted otherwise.

---

## 1. Game Search

### 1a. Search Games (via unified search)

Extends the existing `/api/v1/search` endpoint.

```
GET /api/v1/search?query={query}&page={page}&language={lang}&mediaType={type}
```

**Query Parameters**:

| Param | Type | Default | Description |
|---|---|---|---|
| `query` | string | required | Search query |
| `page` | number | 1 | Page number |
| `language` | string | user locale | Language for results |
| `mediaType` | string | `all` | Filter: `all`, `movie`, `tv`, `game` |

**When `mediaType=all`**: TMDB and IGDB are searched in parallel.
Results are merged and returned in a unified response.

**When `mediaType=game`**: Only IGDB is searched. TMDB is skipped.

**Response** (`200 OK`):

```json
{
  "page": 1,
  "totalPages": 5,
  "totalResults": 94,
  "results": [
    {
      "id": 1234,
      "mediaType": "game",
      "name": "Chrono Trigger",
      "coverUrl": "https://images.igdb.com/igdb/image/upload/t_cover_big/abc123.jpg",
      "platforms": [
        { "id": 19, "name": "Super Nintendo Entertainment System", "abbreviation": "SNES" },
        { "id": 7, "name": "Nintendo DS", "abbreviation": "DS" }
      ],
      "firstReleaseDate": 805248000,
      "developers": ["Square"],
      "publishers": ["Square"],
      "genres": ["Role-playing (RPG)", "Turn-based strategy (TBS)"],
      "rating": 94.5,
      "summary": "In this turn-based RPG...",
      "mediaInfo": {
        "igdbId": 1234,
        "platformIgdbId": 19,
        "status": 5,
        "requestStatus": null,
        "rommUrl": null
      }
    }
  ]
}
```

**`mediaInfo`** is populated when a `GameMedia` record exists for the
game/platform combination. Fields:

| Field | Type | Description |
|---|---|---|
| `igdbId` | number | IGDB game ID |
| `platformIgdbId` | number | IGDB platform ID (per-platform entry) |
| `status` | number | `MediaStatus` enum value |
| `requestStatus` | number or null | `MediaRequestStatus` if a request exists |
| `rommUrl` | string or null | Direct link to ROMM entry if available |

For games with multiple platforms, `mediaInfo` is returned per-platform.
The search result includes one entry per game (not per platform), with
all platforms listed and `mediaInfo` for each platform that has a record.

**Error** (`500`):
```json
{ "message": "Unable to retrieve search results." }
```

### 1b. Search Games by IGDB ID

Uses the existing search provider pattern.

```
GET /api/v1/search?query=igdb:1234
```

Returns the specific game by IGDB ID, with all platforms.

### 1c. Get Game Details

```
GET /api/v1/game/{igdbId}?language={lang}
```

**Path Parameters**:

| Param | Type | Description |
|---|---|---|
| `igdbId` | number | IGDB game ID |

**Response** (`200 OK`):

```json
{
  "id": 1234,
  "name": "Chrono Trigger",
  "coverUrl": "https://images.igdb.com/igdb/image/upload/t_cover_big/abc123.jpg",
  "platforms": [
    { "id": 19, "name": "Super Nintendo Entertainment System", "abbreviation": "SNES" },
    { "id": 7, "name": "Nintendo DS", "abbreviation": "DS" }
  ],
  "firstReleaseDate": 805248000,
  "developers": ["Square"],
  "publishers": ["Square"],
  "genres": ["Role-playing (RPG)", "Turn-based strategy (TBS)"],
  "rating": 94.5,
  "summary": "In this turn-based RPG...",
  "slug": "chrono-trigger",
  "screenshots": [
    "https://images.igdb.com/igdb/image/upload/t_screenshot_big/screenshot1.jpg"
  ],
  "mediaInfo": [
    {
      "platformIgdbId": 19,
      "platformName": "SNES",
      "status": 5,
      "requests": [
        {
          "id": 42,
          "status": 2,
          "requestedBy": { "id": 1, "displayName": "user1" },
          "createdAt": "2026-04-10T12:00:00Z",
          "platformName": "SNES",
          "userNote": "No-Intro verified, please",
          "adminNote": null
        }
      ],
      "rommUrl": "https://romm.example.com/rom/42"
    }
  ]
}
```

**Error** (`404`):
```json
{ "message": "Game not found." }
```

### 1d. Get Game Platforms (cached)

```
GET /api/v1/game/platforms
```

Returns the full IGDB platform list for filter dropdowns.

**Response** (`200 OK`):

```json
{
  "platforms": [
    { "id": 19, "name": "Super Nintendo Entertainment System", "abbreviation": "SNES" },
    { "id": 8, "name": "PlayStation 2", "abbreviation": "PS2" },
    { "id": 4, "name": "Nintendo 64", "abbreviation": "N64" }
  ]
}
```

Cached for 24 hours server-side.

---

## 2. Game Requests

### 2a. Create Game Request

```
POST /api/v1/request
```

**Request Body**:

```json
{
  "mediaType": "game",
  "mediaId": 1234,
  "platformIgdbId": 19,
  "platformName": "Super Nintendo Entertainment System",
  "userNote": "PAL region preferred"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `mediaType` | string | yes | Must be `"game"` |
| `mediaId` | number | yes | IGDB game ID |
| `platformIgdbId` | number | yes | IGDB platform ID |
| `platformName` | string | yes | Human-readable platform name |
| `userNote` | string | no | Optional user note (FR-008) |

**Response** (`201 Created`):

```json
{
  "id": 42,
  "status": 1,
  "type": "game",
  "createdAt": "2026-04-16T10:30:00Z",
  "media": {
    "id": 15,
    "tmdbId": 1234,
    "mediaType": "game",
    "status": 2
  },
  "requestedBy": {
    "id": 1,
    "displayName": "user1"
  },
  "gameMeta": {
    "platformIgdbId": 19,
    "platformName": "Super Nintendo Entertainment System",
    "userNote": "PAL region preferred",
    "adminNote": null
  }
}
```

**Validation**:

- Duplicate check: If a request for `(igdbId, platformIgdbId)` already
  exists with status != DECLINED and != COMPLETED, return `409 Conflict`:
  ```json
  { "message": "Request for this game on this platform already exists." }
  ```
- Permission check: User must have `REQUEST` or `REQUEST_GAME` permission.
  Returns `403` if lacking.
- Quota check: If game quota is configured and exceeded, return
  `429 Too Many Requests`:
  ```json
  { "message": "Game request quota exceeded." }
  ```

### 2b. Update Game Request (Admin)

```
PUT /api/v1/request/{requestId}
```

**Request Body**:

```json
{
  "status": 2,
  "adminNote": "Will add next weekend"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `status` | number | yes | New `MediaRequestStatus` value |
| `adminNote` | string | no | Admin note visible to requester (FR-018) |

**Permission**: `MANAGE_REQUESTS` or `ADMIN`.

**Response** (`200 OK`): Updated request object (same shape as 2a response).

**Game-specific behavior**:

- When approved (`status=2`): No download manager is contacted. The
  request simply moves to APPROVED state. The admin dashboard shows
  "Approved - Awaiting Addition" (FR-017).
- When declined (`status=3`): Notification sent with `adminNote` if
  provided (FR-019).

### 2c. Mark Game Request Available (Admin)

```
POST /api/v1/request/{requestId}/available
```

**Request Body**:

```json
{
  "rommUrl": "https://romm.example.com/rom/42"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `rommUrl` | string | no | Direct link to ROMM entry |

**Permission**: `MANAGE_REQUESTS` or `ADMIN`.

This endpoint manually marks a game request as available (FR-029).
Used when ROMM is not configured or the admin wants to override.

**Response** (`200 OK`): Updated request object with status COMPLETED.

---

## 3. Settings: IGDB Configuration

### 3a. Get IGDB Settings

```
GET /api/v1/settings/igdb
```

**Permission**: `ADMIN`.

**Response** (`200 OK`):

```json
{
  "clientId": "abc123...",
  "clientSecret": ""
}
```

Note: `clientSecret` is always returned as empty string for security.
The presence of a configured secret is indicated by a separate flag.

Corrected response:

```json
{
  "clientId": "abc123...",
  "isConfigured": true
}
```

### 3b. Update IGDB Settings

```
PUT /api/v1/settings/igdb
```

**Request Body**:

```json
{
  "clientId": "abc123...",
  "clientSecret": "secret456..."
}
```

**Permission**: `ADMIN`.

**Response** (`200 OK`):

```json
{
  "clientId": "abc123...",
  "isConfigured": true
}
```

### 3c. Test IGDB Connection

```
POST /api/v1/settings/igdb/test
```

**Request Body**:

```json
{
  "clientId": "abc123...",
  "clientSecret": "secret456..."
}
```

Tests the Twitch OAuth2 token exchange. Does NOT save credentials.

**Response** (`200 OK`):

```json
{
  "success": true,
  "message": "IGDB connection successful."
}
```

**Error** (`400`):

```json
{
  "success": false,
  "message": "Invalid Twitch credentials."
}
```

---

## 4. Settings: ROMM Configuration

### 4a. Get ROMM Servers

```
GET /api/v1/settings/romm
```

**Permission**: `ADMIN`.

**Response** (`200 OK`):

```json
[
  {
    "id": 0,
    "name": "Main ROMM Server",
    "hostname": "romm.local",
    "port": 80,
    "useSsl": false,
    "baseUrl": "",
    "authType": "apikey",
    "isDefault": true,
    "pollIntervalMinutes": 15,
    "lastSyncTimestamp": "2026-04-16T10:00:00Z",
    "syncEnabled": true
  }
]
```

Note: `apiKey`, `username`, and `password` are never returned.

### 4b. Add/Update ROMM Server

```
POST /api/v1/settings/romm
```

or

```
PUT /api/v1/settings/romm/{serverId}
```

**Request Body**:

```json
{
  "name": "Main ROMM Server",
  "hostname": "romm.local",
  "port": 80,
  "useSsl": false,
  "baseUrl": "",
  "authType": "apikey",
  "apiKey": "romm-api-key-here",
  "isDefault": true,
  "pollIntervalMinutes": 15,
  "syncEnabled": true
}
```

**Permission**: `ADMIN`.

**Response** (`200 OK` / `201 Created`): The saved ROMM server object
(without sensitive fields).

### 4c. Test ROMM Connection

```
POST /api/v1/settings/romm/test
```

**Request Body**:

```json
{
  "hostname": "romm.local",
  "port": 80,
  "useSsl": false,
  "baseUrl": "",
  "authType": "apikey",
  "apiKey": "romm-api-key-here"
}
```

Calls ROMM's heartbeat/health endpoint. Does NOT save settings.

**Response** (`200 OK`):

```json
{
  "success": true,
  "message": "ROMM connection successful.",
  "version": "3.2.0"
}
```

**Error** (`400`):

```json
{
  "success": false,
  "message": "Unable to connect to ROMM server."
}
```

### 4d. Delete ROMM Server

```
DELETE /api/v1/settings/romm/{serverId}
```

**Permission**: `ADMIN`.

**Response** (`204 No Content`).

### 4e. Trigger Manual ROMM Sync

```
POST /api/v1/settings/romm/{serverId}/sync
```

**Permission**: `ADMIN`.

Triggers an immediate ROMM library scan for the specified server.

**Response** (`200 OK`):

```json
{
  "success": true,
  "message": "ROMM sync started."
}
```

---

## 5. ROMM Polling Job

### Job Specification

| Property | Value |
|---|---|
| Job ID | `romm-scan` |
| Default Schedule | `0 */15 * * * *` (every 15 min) |
| Configurable | Yes, per server instance |
| Failure Handling | Log and retry on next interval |
| Isolation | Independent of all other scan jobs |

### Polling Sequence

```
1. Load ROMM server instances from settings
2. For each instance where syncEnabled=true:
   a. GET /api/platforms -> cache platform ID -> IGDB ID mapping
   b. GET /api/roms?order_by=created_at&order_dir=desc
      (paginate until created_at < lastSyncTimestamp)
   c. For each new ROM:
      i.   Resolve IGDB ID: rom.igdb_id
      ii.  Resolve platform IGDB ID: platform.igdb_id
      iii. Query GameMedia by (igdbId, platformIgdbId)
      iv.  If match found:
           - Update GameMedia.status = AVAILABLE
           - Update GameMedia.rommId = rom.id
           - Update GameMedia.rommUrl = <constructed URL>
           - Find APPROVED MediaRequests referencing this GameMedia
           - Update matching requests to COMPLETED
           - Send notification to each requesting user
   d. Update lastSyncTimestamp = now
3. On error: log and continue to next instance
```

### Constructed ROMM URL

```
{protocol}://{hostname}:{port}{baseUrl}/rom/{rommId}
```

---

## 6. Request Dashboard Extensions

### Existing Endpoint with Game Filter

```
GET /api/v1/request?filter={filter}&take={take}&skip={skip}&sort={sort}&mediaType={type}
```

**New query parameter**:

| Param | Type | Default | Description |
|---|---|---|---|
| `mediaType` | string | `all` | Filter by media type: `all`, `movie`, `tv`, `game` |

**Response**: Existing paginated request list. Game requests include
the `gameMeta` field:

```json
{
  "pageInfo": { "pages": 5, "pageSize": 20, "results": 94, "page": 1 },
  "results": [
    {
      "id": 42,
      "status": 1,
      "type": "game",
      "media": {
        "id": 15,
        "tmdbId": 1234,
        "mediaType": "game",
        "status": 2
      },
      "requestedBy": { "id": 1, "displayName": "user1" },
      "gameMeta": {
        "platformIgdbId": 19,
        "platformName": "SNES",
        "userNote": "PAL region preferred",
        "adminNote": null
      }
    }
  ]
}
```

The `gameMeta` field is only present when `type === 'game'`. For
movie and TV requests, this field is absent.

---

## 7. Notification Payloads

Game request notifications reuse the existing notification system.
The notification payload for games:

```typescript
{
  media: mediaEntity,
  request: requestEntity,
  event: 'Game Request Approved',  // or Pending, Declined, Available
  subject: 'Chrono Trigger (SNES)',
  message: 'In this turn-based RPG...',
  image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc123.jpg',
  extra: [
    { name: 'Platform', value: 'Super Nintendo Entertainment System' },
    { name: 'User Note', value: 'PAL region preferred' },
  ],
}
```
