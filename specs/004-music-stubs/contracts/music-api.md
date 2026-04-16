# API Contract: Music Stub Routes

**Date**: 2026-04-16 | **Feature**: 004-music-stubs

## Overview

All music API routes live under `/api/v1/music/`. They are only registered when `ENABLE_MUSIC=true`. When the flag is disabled, the routes do not exist and requests return HTTP 404 (the framework's default for unmounted routes).

When enabled, every route returns HTTP 501 Not Implemented. No route performs any database query, external HTTP call, or business logic.

## Route File

**File**: `server/routes/music.ts`

## Routes

### Search Music

```
GET /api/v1/music/search
```

**Query Parameters** (accepted but ignored):

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | `string` | Search query (artist or album name) |
| `type` | `string` | Optional: `artist` or `album` |
| `page` | `number` | Pagination page number |

**Response** (always):
```
HTTP 501 Not Implemented
Content-Type: application/json

{
  "message": "Music support is not yet implemented."
}
```

**Auth**: Required (any authenticated user)

---

### Create Music Request

```
POST /api/v1/music/request
```

**Request Body** (accepted but ignored):

| Field | Type | Description |
|-------|------|-------------|
| `artistName` | `string` | Artist name |
| `albumTitle` | `string` | Album title |
| `releaseYear` | `number` | Year of release |
| `musicbrainzId` | `string` | MusicBrainz release UUID |
| `requestedFormat` | `string` | Audio format preference |

**Response** (always):
```
HTTP 501 Not Implemented
Content-Type: application/json

{
  "message": "Music support is not yet implemented."
}
```

**Auth**: Required (any authenticated user)

---

### List Music Requests

```
GET /api/v1/music/request
```

**Query Parameters** (accepted but ignored):

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | `number` | Page number |
| `pageSize` | `number` | Results per page |
| `status` | `string` | Filter by status |

**Response** (always):
```
HTTP 501 Not Implemented
Content-Type: application/json

{
  "message": "Music support is not yet implemented."
}
```

**Auth**: Required (any authenticated user)

---

### Get Music Request by ID

```
GET /api/v1/music/request/:id
```

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `number` | Music request ID |

**Response** (always):
```
HTTP 501 Not Implemented
Content-Type: application/json

{
  "message": "Music support is not yet implemented."
}
```

**Auth**: Required (any authenticated user)

---

## Route Registration

**File**: `server/routes/index.ts` (modified)

The music routes are conditionally mounted:

```typescript
import { isMusicEnabled } from '@server/lib/featureflags';
import musicRoutes from './music';

// ... existing route registrations ...

if (isMusicEnabled()) {
  router.use('/music', isAuthenticated(), musicRoutes);
}
```

## Implementation Pattern

The route file is minimal. Every handler follows the same pattern:

```typescript
import { Router } from 'express';

const musicRoutes = Router();

const notImplemented = (_req: Request, res: Response) => {
  return res.status(501).json({
    message: 'Music support is not yet implemented.',
  });
};

musicRoutes.get('/search', notImplemented);
musicRoutes.post('/request', notImplemented);
musicRoutes.get('/request', notImplemented);
musicRoutes.get('/request/:id', notImplemented);

export default musicRoutes;
```

## Flag-Off Behaviour

When `ENABLE_MUSIC` is unset or `false`:

| Request | Response |
|---------|----------|
| `GET /api/v1/music/search?query=radiohead` | 404 Not Found |
| `POST /api/v1/music/request` | 404 Not Found |
| `GET /api/v1/music/request` | 404 Not Found |
| `GET /api/v1/music/request/1` | 404 Not Found |

The routes are simply never registered in Express, so the framework returns its default 404.

## Flag-On Behaviour

When `ENABLE_MUSIC=true`:

| Request | Response |
|---------|----------|
| `GET /api/v1/music/search?query=radiohead` | 501 `{"message": "Music support is not yet implemented."}` |
| `POST /api/v1/music/request` | 501 `{"message": "Music support is not yet implemented."}` |
| `GET /api/v1/music/request` | 501 `{"message": "Music support is not yet implemented."}` |
| `GET /api/v1/music/request/42` | 501 `{"message": "Music support is not yet implemented."}` |
