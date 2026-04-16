# Phase 0 Research: Video Game ROM Requests

**Feature Branch**: `003-game-rom-requests` | **Date**: 2026-04-16

## 1. IGDB API (via Twitch)

### Authentication Flow

IGDB is owned by Twitch and requires Twitch OAuth2 client credentials
for access. The flow is machine-to-machine (no user interaction).

1. Admin registers an app at https://dev.twitch.tv/console/apps
2. Admin obtains a **Client ID** and **Client Secret**.
3. Allseerr exchanges these for a bearer token via:

```
POST https://id.twitch.tv/oauth2/token
  ?client_id={CLIENT_ID}
  &client_secret={CLIENT_SECRET}
  &grant_type=client_credentials
```

Response:
```json
{
  "access_token": "abc123...",
  "expires_in": 5184000,
  "token_type": "bearer"
}
```

- Tokens expire after ~60 days. Allseerr must cache the token and
  refresh it proactively (e.g., at 75% lifetime or on 401 response).
- Every IGDB API request requires two headers:
  - `Client-ID: {CLIENT_ID}`
  - `Authorization: Bearer {ACCESS_TOKEN}`

### Search Endpoint

IGDB uses a custom query language (Apicalypse) over POST:

```
POST https://api.igdb.com/v4/games
Body: search "Chrono Trigger"; fields name,cover.url,platforms.name,
      platforms.abbreviation,first_release_date,involved_companies.company.name,
      involved_companies.developer,involved_companies.publisher,
      genres.name,total_rating,summary,slug;
      limit 20;
```

Key fields for Allseerr:

| IGDB Field | Allseerr Use |
|---|---|
| `id` | External metadata ID (unique per game, NOT per platform) |
| `name` | Game title |
| `cover.url` | Cover art (prefix with `https:`, replace `t_thumb` with `t_cover_big`) |
| `platforms[].name` / `platforms[].abbreviation` | Platform display and filter |
| `platforms[].id` | Platform matching key for ROMM |
| `first_release_date` | Release year (Unix timestamp, convert) |
| `involved_companies[]` | Filter by `developer: true` / `publisher: true` |
| `genres[].name` | Genre tags |
| `total_rating` | User rating (0-100 scale) |
| `summary` | Game description |
| `slug` | URL-safe identifier |

### Platform Filtering

Platform filtering at the IGDB level:

```
POST https://api.igdb.com/v4/games
Body: search "Mario"; fields ...; where platforms = (19,33);
```

Platform IDs are IGDB-specific integers (e.g., 19 = SNES, 8 = PS2).
Allseerr should fetch the platform list once and cache it:

```
POST https://api.igdb.com/v4/platforms
Body: fields id,name,abbreviation,slug; limit 500;
```

### Rate Limits

- 4 requests per second per Client ID.
- Implement rate limiting in the IGDB adapter (use existing
  `ExternalAPI` rateLimit option).

### Design Decision: IGDB ID + Platform = Unique Request Key

A single IGDB game ID can span multiple platforms. The request
uniqueness key must be `(igdbId, platformId)`. This is analogous to
how a movie has one TMDB ID but requests track it uniquely.

---

## 2. ROMM API

### Overview

ROMM (ROM Manager) is a self-hosted ROM library manager. It exposes a
REST API for listing platforms, games, and their metadata.

### Authentication

ROMM supports two authentication methods:

1. **API Key** (header-based): `Authorization: Bearer {API_KEY}`
2. **Username/Password** (basic auth or session-based, depending on
   ROMM version)

Allseerr should support both, with API key as the recommended method.
Credentials are stored encrypted in `settings.json` (follow the same
pattern as Radarr/Sonarr apiKey storage).

### Key Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/platforms` | GET | List all platforms in the library |
| `/api/platforms/{id}/roms` | GET | List all ROMs for a platform |
| `/api/roms` | GET | List all ROMs (paginated, filterable) |
| `/api/roms/{id}` | GET | Get ROM details |
| `/api/heartbeat` | GET | Connection test / health check |

### ROM Object Structure (relevant fields)

```json
{
  "id": 42,
  "igdb_id": 1234,
  "name": "Chrono Trigger",
  "slug": "chrono-trigger",
  "platform_id": 5,
  "platform_name": "Super Nintendo",
  "platform_slug": "snes",
  "file_name": "Chrono Trigger (USA).sfc",
  "file_size_bytes": 4194304,
  "path_cover_s": "/assets/romm/resources/chrono-trigger/cover/small.jpg",
  "path_cover_l": "/assets/romm/resources/chrono-trigger/cover/big.jpg",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

### Platform Object Structure

```json
{
  "id": 5,
  "igdb_id": 19,
  "name": "Super Nintendo",
  "slug": "snes",
  "rom_count": 42
}
```

Key insight: ROMM platforms have an `igdb_id` field, which maps
directly to IGDB platform IDs. This enables reliable matching.

### Listing New Additions

ROMM does not have a dedicated "recently added" endpoint. Two strategies:

1. **Sort by created_at**: `GET /api/roms?order_by=created_at&order_dir=desc`
2. **Full diff**: Fetch all ROM IDs, compare against last known set.

Strategy 1 is preferred for efficiency. The poller stores the
`lastSyncTimestamp` and fetches only ROMs with `created_at` after that
timestamp. If ROMM does not support date filtering directly, fetch the
most recent page and stop when encountering already-known entries.

---

## 3. Game-to-Request Matching Strategy

### The Matching Problem

When ROMM reports a ROM, Allseerr must determine which pending/approved
requests it fulfills. The matching key is:

**Primary**: `igdbId` (from ROMM ROM object) + `platformId` (IGDB platform ID, mapped via ROMM platform's `igdb_id`)

**Fallback** (when ROMM ROM lacks `igdb_id`): Fuzzy title match +
platform match. This is a last resort and should be flagged for admin
review.

### Matching Algorithm

```
for each new ROM in ROMM:
  1. Get the ROM's igdb_id and platform.igdb_id
  2. If igdb_id is present:
     - Query GameMedia where igdbId = rom.igdb_id
       AND platformIgdbId = rom.platform.igdb_id
     - If match found, check for APPROVED requests on that GameMedia
     - Mark matching requests as AVAILABLE
  3. If igdb_id is absent:
     - Normalize ROM name (strip region tags, file extensions, etc.)
     - Search GameMedia by normalized title + platform
     - If confident match (exact normalized title), auto-mark
     - If fuzzy match, flag for admin review
```

### GameMedia Identity Model

```
GameMedia {
  id (PK, auto)
  igdbId (int, indexed)           -- IGDB game ID
  platformIgdbId (int, indexed)   -- IGDB platform ID
  platformName (string)           -- Human-readable, e.g., "Super Nintendo"
  title (string)
  ...metadata fields...
}

Unique constraint: (igdbId, platformIgdbId)
```

This means "Super Mario World on SNES" and "Super Mario World on GBA"
are two distinct GameMedia rows, which aligns with distinct requests.

---

## 4. Polling/Scan Architecture for ROMM

### Design

Follow the existing job scheduler pattern used by Radarr/Sonarr scans.
The existing `jobs` configuration in `settings.json` maps job IDs to
cron schedules.

New job: `romm-scan`

- **Default schedule**: `0 */15 * * * *` (every 15 minutes)
- **Configurable**: Admin sets the interval in Games > Library Server
  settings; stored as a cron expression in `settings.json`.

### Scan Flow

```
RommScanJob.run():
  1. Load all configured ROMM server instances from settings
  2. For each instance:
     a. Fetch platforms from ROMM (cache for 1 hour)
     b. Fetch recently added ROMs (since lastSyncTimestamp)
     c. For each new ROM:
        - Run matching algorithm (Section 3)
        - If match found with APPROVED request:
            - Update GameMedia status to AVAILABLE
            - Update MediaRequest status to COMPLETED
            - Store rommEntryUrl on GameMedia
            - Send notification to requesting user
     d. Update lastSyncTimestamp on the server instance
  3. On failure:
     - Log error with label 'ROMM Scan'
     - Do NOT throw (other media type jobs must not be affected)
     - Retry on next interval
```

### Manual Sync

Expose `POST /api/v1/settings/romm/{serverId}/sync` for the admin
"Sync now" button. This runs the same scan logic immediately,
outside the cron schedule.

### Failure Isolation

ROMM connectivity failures must be completely isolated:

- The ROMM scan job runs in its own try/catch.
- It shares no state with Radarr/Sonarr/Plex scan jobs.
- A failed ROMM poll does not delay or block any other job.
- Errors are logged but not surfaced to end users.

---

## 5. Extending Unified Search for Games

### Current Architecture

The search route (`server/routes/search.ts`) calls TMDB's
`searchMulti` and maps results. The search provider pattern in
`server/lib/search.ts` supports prefix-based providers (e.g.,
`tmdb:`, `imdb:`, `tvdb:`).

### Extension Strategy

The unified search must include game results alongside movie/TV results.
Two approaches were considered:

**Option A: Parallel search** (recommended) -- When the user searches,
Allseerr fires TMDB search and IGDB search in parallel. Results are
merged, tagged with their `mediaType`, and returned as a single
paginated list.

**Option B: Tab-only** -- Only search IGDB when the user selects the
"Games" tab. This is simpler but breaks the "unified" expectation.

**Decision**: Option A for the default "All" tab; Option B behavior
naturally follows when the user selects the "Games" tab (only IGDB
results). When the user selects "Movies" or "TV" tabs, IGDB search
is skipped.

### Implementation Details

1. Add `igdb:` search provider to `server/lib/search.ts` for direct
   IGDB ID lookup (e.g., `igdb:1234`).

2. Modify the search route to accept a `mediaType` query parameter:
   - `mediaType=all` (default): search TMDB + IGDB in parallel
   - `mediaType=movie` or `mediaType=tv`: search TMDB only
   - `mediaType=game`: search IGDB only

3. Game search results are mapped to a `GameSearchResult` type that
   includes `media_type: 'game'` for consistent frontend handling.

4. The `Media.getRelatedMedia` lookup is extended to also check
   `GameMedia` when results include games, so availability/request
   status badges work.

### Search Result Type

```typescript
interface GameSearchResult {
  id: number;              // IGDB game ID
  media_type: 'game';
  name: string;
  cover_url: string | null;
  platforms: { id: number; name: string; abbreviation: string }[];
  first_release_date: number | null;  // Unix timestamp
  developers: string[];
  publishers: string[];
  genres: string[];
  total_rating: number | null;
  summary: string | null;
}
```

### Cache Strategy

- IGDB search results: 6 hours TTL (same as TMDB).
- IGDB platform list: 24 hours TTL.
- IGDB auth token: cache until 75% of `expires_in`, then refresh.
- ROMM platform/ROM lists: 5 minutes TTL (aligns with poll interval).

---

## 6. Key Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| IGDB rate limit (4 req/s) | Search latency under load | Rate limiter in adapter; cache aggressively |
| ROMM API changes between versions | Scan failures | Version check on connection test; adapter abstraction |
| IGDB token expiry mid-session | Failed searches | Proactive refresh at 75% lifetime; retry on 401 |
| ROMM ROMs lacking igdb_id | Unmatched requests | Fallback to title+platform fuzzy match; admin review flag |
| Large ROMM libraries (10k+ ROMs) | Slow initial sync | Paginated fetching; incremental sync after first full scan |
| Twitch account requirement for IGDB | Admin setup friction | Clear documentation in quickstart and settings UI |

---

## 7. Research Summary

| Decision | Choice | Rationale |
|---|---|---|
| Metadata source | IGDB (via Twitch OAuth2) | Industry standard for game metadata; rich platform data |
| Library server | ROMM REST API | Self-hosted ROM manager with IGDB ID mapping |
| Request uniqueness | `(igdbId, platformIgdbId)` | Same game on different platforms = different requests |
| Matching strategy | IGDB ID primary, fuzzy title fallback | ROMM stores `igdb_id`; fallback for unmatched ROMs |
| Polling architecture | Cron job (existing pattern) | Consistent with Radarr/Sonarr scan jobs |
| Search integration | Parallel TMDB+IGDB with mediaType filter | Unified experience; tab filtering for focused search |
| Auth token management | Cache with proactive refresh | Avoid mid-session failures; handle 401 gracefully |
