# Quickstart: Testing Music Stubs

**Date**: 2026-04-16 | **Feature**: 004-music-stubs

## Prerequisites

- Node.js and yarn/npm installed
- Allseerr development environment set up (`yarn install` completed)
- Application can start successfully (`yarn dev`)

## 1. Verify Feature Flag Defaults to Disabled

Start the application without setting `ENABLE_MUSIC`:

```bash
yarn dev
```

Check the startup logs. You should see:

```
Music feature flag is disabled — no music routes registered
```

Confirm music routes are not accessible:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5055/api/v1/music/search
# Expected: 404
```

## 2. Enable the Feature Flag

Stop the application and restart with the flag:

```bash
ENABLE_MUSIC=true yarn dev
```

Check the startup logs. You should see:

```
Music feature flag is enabled — stub routes registered
```

## 3. Test Stub API Routes

All routes require authentication. Use an existing session cookie or API key.

```bash
# Search (GET)
curl -H "Cookie: <your-session-cookie>" \
  http://localhost:5055/api/v1/music/search?query=radiohead
# Expected: 501 {"message": "Music support is not yet implemented."}

# Create request (POST)
curl -X POST \
  -H "Cookie: <your-session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"artistName":"Radiohead","albumTitle":"OK Computer"}' \
  http://localhost:5055/api/v1/music/request
# Expected: 501 {"message": "Music support is not yet implemented."}

# List requests (GET)
curl -H "Cookie: <your-session-cookie>" \
  http://localhost:5055/api/v1/music/request
# Expected: 501 {"message": "Music support is not yet implemented."}

# Get request by ID (GET)
curl -H "Cookie: <your-session-cookie>" \
  http://localhost:5055/api/v1/music/request/1
# Expected: 501 {"message": "Music support is not yet implemented."}
```

## 4. Test Adapter Stubs

Open a Node REPL or write a quick test script:

```typescript
import { LidarrAdapter } from '@server/lib/adapters/music/LidarrAdapter';
import { SubsonicAdapter } from '@server/lib/adapters/music/SubsonicAdapter';

const lidarr = new LidarrAdapter();
const subsonic = new SubsonicAdapter();

try {
  await lidarr.submitAlbumRequest({ albumId: 'test' });
} catch (e) {
  console.log(e.name);    // "NotImplementedError"
  console.log(e.message); // "Music support is not yet implemented. See Phase 3 spec."
}

try {
  await subsonic.searchArtists({ query: 'test' });
} catch (e) {
  console.log(e.name);    // "NotImplementedError"
  console.log(e.message); // "Music support is not yet implemented. See Phase 3 spec."
}
```

## 5. Verify MusicRequest Entity

With the application running (migration applied), verify the entity can be instantiated:

```typescript
import { MusicRequest, AudioFormat } from '@server/entity/MusicRequest';
import { MediaRequestStatus, MediaType } from '@server/constants/media';

const request = new MusicRequest({
  status: MediaRequestStatus.PENDING,
  artistName: 'Radiohead',
  albumTitle: 'OK Computer',
  releaseYear: 1997,
  musicbrainzId: 'b1234567-89ab-cdef-0123-456789abcdef',
  requestedFormat: AudioFormat.FLAC,
  mediaType: MediaType.MUSIC,
});

console.log(request.artistName);   // "Radiohead"
console.log(request.mediaType);    // "music"
```

## 6. Verify No Regressions

With the flag OFF (default), run the existing test suite:

```bash
yarn test
```

All existing tests should pass unchanged. No movie, TV, or other media request workflows should be affected.

With the flag ON:

```bash
ENABLE_MUSIC=true yarn test
```

Tests should still pass. The music stubs do not interfere with existing functionality.

## 7. Verify MediaType Enum

```typescript
import { MediaType } from '@server/constants/media';

console.log(MediaType.MUSIC);  // "music"
console.log(Object.values(MediaType));  // ["movie", "tv", "music"]
```

## Checklist

- [ ] Application starts without `ENABLE_MUSIC` -- no music log entries beyond the flag status
- [ ] Music routes return 404 when flag is off
- [ ] Music routes return 501 when flag is on
- [ ] All 501 responses have the correct JSON message body
- [ ] Adapter stubs throw `NotImplementedError` with descriptive message
- [ ] `MusicRequest` entity can be instantiated with all fields
- [ ] `MediaType.MUSIC` exists in the enum
- [ ] Existing tests pass with flag off
- [ ] Existing tests pass with flag on
- [ ] No external HTTP calls made by any music code path
