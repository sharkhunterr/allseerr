---
name: Allseerr project identity
description: Allseerr is a fork of Seerr extended for books, audiobooks, game ROMs, and music with OIDC auth. Phased delivery P0-P3.
type: project
---

Allseerr is a fork of Seerr that extends movie/TV request management
to support books, audiobooks, video game ROMs, and music from a single UI.
OIDC auth is Phase 0 (first priority). Books+audiobooks Phase 1, game ROMs
Phase 2, music stubs Phase 3.

**Why:** User wants a unified multi-media request platform for homelab use,
following the *arr ecosystem philosophy.

**How to apply:** All new work must be additive (never break existing movie/TV
flows), use the adapter pattern for external services, and follow the
MediaType enum as single source of truth. Constitution is at
`.specify/memory/constitution.md`.
