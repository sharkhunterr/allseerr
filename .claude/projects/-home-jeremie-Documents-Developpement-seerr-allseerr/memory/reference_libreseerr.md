---
name: Libreseerr reference implementation
description: Libreseerr by zamnzim is the reference for book/audiobook search and matching in Allseerr
type: reference
---

Libreseerr (github.com/zamnzim/Libreseerr) is the reference
implementation for how Allseerr should handle book/audiobook search
and matching.

Key patterns to replicate:
- OpenLibrary as sole user-facing search source
- Cascading match: ISBN first, then title+author free-text fallback
- Library server's own metadata for server-side lookup
- `foreignBookId`/`foreignAuthorId` for deduplication
- No fuzzy matching — first result from server lookup
- Same matching logic for ebooks and audiobooks (different server instance)
- Supports Readarr, Bookshelf (Readarr fork), LazyLibrarian backends
- No Bindery integration yet in Libreseerr (Allseerr will add it)
