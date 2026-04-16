# Developer Quickstart: Video Game ROM Requests

**Feature Branch**: `003-game-rom-requests` | **Date**: 2026-04-16

## Prerequisites

- Node.js (version from `.nvmrc`)
- pnpm (never npm or yarn)
- A Twitch Developer account (for IGDB API access)
- A running ROMM instance (optional, for availability detection testing)

## Getting Started

### 1. Branch Setup

```bash
git checkout develop
git pull origin develop
git checkout -b 003-game-rom-requests
```

### 2. Install Dependencies

```bash
pnpm install
```

No new dependencies are expected for this feature. The existing
`axios`, `node-cache`, and `typeorm` packages cover all needs.

### 3. Obtain IGDB/Twitch Credentials

1. Go to https://dev.twitch.tv/console/apps
2. Click "Register Your Application"
3. Name: anything (e.g., "Allseerr Dev")
4. OAuth Redirect URL: `http://localhost` (not used but required)
5. Category: "Application Integration"
6. Click "Create"
7. Copy the **Client ID**
8. Click "New Secret" and copy the **Client Secret**

These credentials are needed to test game search functionality.

### 4. Set Up a ROMM Instance (Optional)

For testing availability detection, you need a ROMM instance.

**Quick Docker setup**:
```bash
docker run -d \
  --name romm \
  -p 8080:8080 \
  -v romm-data:/romm/library \
  -v romm-config:/romm/config \
  -e ROMM_AUTH_SECRET_KEY=dev-secret \
  zurdi15/romm:latest
```

Once running, configure at `http://localhost:8080` and create an API key.

### 5. Start Development Server

```bash
pnpm dev
```

The app runs at `http://localhost:5055` by default.

## Key Files to Create/Modify

### New Files

| File | Purpose |
|---|---|
| `server/entity/GameMedia.ts` | Game metadata entity |
| `server/entity/GameRequestMeta.ts` | Game-specific request companion data |
| `server/api/igdb/index.ts` | IGDB API adapter |
| `server/api/igdb/interfaces.ts` | IGDB TypeScript interfaces |
| `server/api/romm/index.ts` | ROMM API adapter |
| `server/api/romm/interfaces.ts` | ROMM TypeScript interfaces |
| `server/routes/game.ts` | Game detail and platform routes |
| `server/routes/settings/romm.ts` | ROMM settings routes |
| `server/routes/settings/igdb.ts` | IGDB settings routes |
| `server/lib/scanners/rommScanner.ts` | ROMM polling/scan job |
| `server/lib/settings/migrations/0009_add_game_settings.ts` | Settings migration |

### Files to Extend (Additive Only)

| File | Change |
|---|---|
| `server/constants/media.ts` | Add `GAME = 'game'` to `MediaType` enum |
| `server/lib/permissions.ts` | Add `REQUEST_GAME` and `AUTO_APPROVE_GAME` flags |
| `server/lib/cache.ts` | Add `'igdb'` and `'romm'` cache IDs |
| `server/lib/settings/index.ts` | Add `RommSettings`, `IgdbSettings` interfaces and defaults |
| `server/lib/search.ts` | Add `igdb:` search provider |
| `server/routes/search.ts` | Add `mediaType` query param, parallel IGDB search |
| `server/routes/request.ts` | Handle `mediaType === 'game'` in request creation |
| `server/routes/index.ts` | Register game, ROMM settings, IGDB settings routes |

### Files NOT to Touch

- `server/entity/Media.ts` -- use as-is; game Media rows use `tmdbId` for IGDB ID
- `server/entity/MediaRequest.ts` -- use as-is; game-specific data goes in `GameRequestMeta`
- `server/api/servarr/*` -- existing Radarr/Sonarr code
- `server/routes/movie.ts`, `server/routes/tv.ts` -- existing routes

## Architecture Quick Reference

### Adapter Pattern

External services are accessed through adapters. For this feature:

```
server/api/igdb/index.ts        -- extends ExternalAPI (server/api/externalapi.ts)
server/api/romm/index.ts        -- extends ExternalAPI
```

Each adapter encapsulates authentication, request formatting, and
response parsing. No IGDB or ROMM API calls outside these files.

### Settings Pattern

Settings follow the singleton pattern in `server/lib/settings/index.ts`.
ROMM servers are an array (like `radarr: RadarrSettings[]`). IGDB
credentials are a single object.

Access: `getSettings().romm`, `getSettings().igdb`

### Job Pattern

Scheduled jobs are registered in `server/lib/settings/index.ts` under
the `jobs` record. The ROMM scan job follows the same lifecycle as
`radarr-scan` and `sonarr-scan`.

### Request Flow

```
User searches -> IGDB adapter -> search results
User clicks request -> POST /api/v1/request (mediaType='game')
  -> Creates Media row (mediaType='game', tmdbId=igdbId)
  -> Creates GameMedia row (if not exists)
  -> Creates MediaRequest row (type='game')
  -> Creates GameRequestMeta row (platform, notes)
Admin approves -> PUT /api/v1/request/{id} (status=APPROVED)
  -> No download manager contacted (game-specific behavior)
ROMM scan detects ROM -> Updates GameMedia.status = AVAILABLE
  -> Updates MediaRequest.status = COMPLETED
  -> Sends notification
```

### Search Flow

```
GET /api/v1/search?query=chrono+trigger&mediaType=all
  -> TMDB searchMulti (existing)     }  parallel
  -> IGDB search (new)               }
  -> Merge results, tag with mediaType
  -> Attach mediaInfo (availability/request status)
  -> Return unified response
```

## Testing Checklist

### Manual Testing

1. **IGDB credentials**: Settings > Games > configure Client ID/Secret > Test Connection
2. **Game search**: Type a game title in search bar > verify results with cover art and platform info
3. **Platform filter**: Select a platform filter > verify only matching results appear
4. **Game request**: Click request on a search result > select platform > submit
5. **Duplicate detection**: Try requesting the same game/platform again > verify error
6. **Admin approval**: Log in as admin > find game request > approve with note
7. **ROMM config**: Settings > Games > Library Server > configure ROMM > Test Connection
8. **ROMM sync**: Click "Sync now" > verify ROMM library is scanned
9. **Availability detection**: Add a ROM to ROMM > wait for poll > verify request updates
10. **Notifications**: Verify notification on request creation, approval, availability

### Automated Testing

Tests should be co-located with the code:

```
server/api/igdb/__tests__/igdb.test.ts
server/api/romm/__tests__/romm.test.ts
server/routes/__tests__/game.test.ts
server/lib/scanners/__tests__/rommScanner.test.ts
```

Key test scenarios:

- IGDB token refresh on 401
- IGDB search result mapping
- ROMM connection test (mock)
- ROMM scan with matching/non-matching ROMs
- Game request creation with permission/quota checks
- Duplicate request detection
- GameRequestMeta cascade delete

## Troubleshooting

### "IGDB connection failed"

- Verify Client ID and Secret at https://dev.twitch.tv/console/apps
- Check that the Twitch OAuth2 endpoint is reachable from the server
- Check server logs for the specific error message

### "ROMM connection failed"

- Verify ROMM is running: `curl http://romm-host:port/api/heartbeat`
- Check SSL settings match (useSsl vs actual ROMM config)
- Verify API key or credentials

### "Game search returns no results"

- Ensure IGDB credentials are configured and tested
- Try searching by IGDB ID: `igdb:1234`
- Check server logs for IGDB API errors

### "ROMM scan not detecting games"

- Verify syncEnabled is true for the ROMM server
- Check lastSyncTimestamp in settings (should update after each scan)
- Verify the ROM in ROMM has an `igdb_id` set (needed for matching)
- Check server logs for scan errors with label 'ROMM Scan'
