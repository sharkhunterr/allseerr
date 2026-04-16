<!--
  Sync Impact Report
  ═══════════════════
  Version change: 0.0.0 (template) → 1.0.0 (initial ratification)

  Modified principles: N/A (first ratification)

  Added sections:
    - Core Principles (5): Backward Compatibility, Adapter Pattern,
      MediaType Enum Authority, Explicit Typing, Incremental Delivery
    - Tech Stack & Architecture (full stack definition, MediaType enum,
      service integration map, adapter interfaces, auth methods,
      game ROM workflow, music stubs)
    - Development Workflow (file conventions, prohibitions, phased delivery)
    - Governance (amendment procedure, versioning, compliance)

  Removed sections: N/A (first ratification)

  Templates requiring updates:
    - .specify/templates/plan-template.md        ✅ compatible (Constitution
      Check section is generic; will be filled per-feature)
    - .specify/templates/spec-template.md         ✅ compatible (no
      constitution-specific references to update)
    - .specify/templates/tasks-template.md        ✅ compatible (phase
      structure aligns with incremental delivery principle)

  Follow-up TODOs: none
-->

# Allseerr Constitution

## Core Principles

### I. Never Break Existing Functionality

Existing movie and TV request workflows, Radarr/Sonarr integrations,
and Plex/Jellyfin/Emby authentication MUST remain fully functional
at all times. Every new feature is strictly additive.

- No refactoring of existing working code without explicit instruction.
- No modification of existing movie/TV entity classes, services, or
  API routes.
- No changes to existing Plex/Jellyfin/Emby authentication flows.
- Every deploy MUST pass the existing test suite before merge.

### II. Provider/Adapter Pattern for All External Services

Every external service integration (download managers, library servers,
metadata sources) MUST be implemented as an adapter behind a typed
TypeScript interface. No service-specific logic outside its adapter file.

- All library server adapters MUST implement `MediaLibraryAdapter`:
  ```typescript
  interface MediaLibraryAdapter {
    readonly mediaTypes: MediaType[];
    readonly name: string;
    checkAvailability(
      externalId: string, type: MediaType
    ): Promise<AvailabilityResult>;
    triggerLibraryScan(externalId?: string): Promise<void>;
    testConnection(): Promise<ConnectionTestResult>;
  }
  ```
- All download manager adapters MUST implement `DownloadManagerAdapter`:
  ```typescript
  interface DownloadManagerAdapter {
    readonly mediaTypes: MediaType[];
    readonly name: string;
    submitRequest(
      request: MediaRequest
    ): Promise<SubmissionResult>;
    checkStatus(externalId: string): Promise<RequestStatus>;
    testConnection(): Promise<ConnectionTestResult>;
  }
  ```
- Services MUST NOT call external APIs directly; all access goes
  through the adapter layer.

### III. MediaType Enum Is the Single Source of Truth

The `MediaType` enum drives all conditional logic across the codebase.
All new media types MUST be declared there first. No hardcoded string
comparisons (e.g., `if (type === 'book')`) outside typed enum usage.

```typescript
export enum MediaType {
  // Existing (DO NOT MODIFY)
  MOVIE = 'movie',
  TV = 'tv',
  // New (additive only)
  BOOK = 'book',
  AUDIOBOOK = 'audiobook',
  GAME = 'game',
  MUSIC = 'music', // Structure only — no business logic in Phase 1-3
}
```

### IV. Explicit Over Implicit

All TypeScript types MUST be explicit. No `any`. No implicit `object`.
Every adapter interface, service method, and API response MUST be
fully typed.

### V. Incremental Delivery

Features are built phase by phase. Each phase is independently
deployable and testable. A phase that is not yet coded MUST NOT
block any existing functionality.

| Phase | Feature | Priority |
|-------|---------|----------|
| 0 | OIDC authentication | P0 |
| 1 | Books + Audiobooks (Bindery/Readarr + Grimmory/ABS) | P1 |
| 2 | Video Game ROMs (ROMM + IGDB) | P2 |
| 3 | Music stubs (Lidarr + Navidrome — structure only) | P3 |

## Tech Stack & Architecture

### Non-Negotiable Stack (inherited from Seerr)

- **Runtime**: Node.js (version from `.nvmrc`)
- **Framework**: Next.js (match existing codebase router style)
- **Language**: TypeScript (strict mode)
- **ORM**: TypeORM
- **Database**: SQLite (default), PostgreSQL (optional, via existing config)
- **Package manager**: pnpm (never npm or yarn)
- **Styling**: Tailwind CSS (match existing component patterns)
- **Auth**: next-auth (extend existing providers, do not replace)
- **Linting**: ESLint + Prettier (existing config, no changes)

### Service Integration Map

| MediaType  | Download Manager       | Library Server(s)                   | Metadata Source             |
|------------|------------------------|--------------------------------------|-----------------------------|
| movie      | Radarr (existing)      | Plex / Jellyfin / Emby (existing)    | TMDB (existing)             |
| tv         | Sonarr (existing)      | Plex / Jellyfin / Emby (existing)    | TMDB (existing)             |
| book       | Bindery (primary), Readarr (fallback) | Grimmory / Calibre-Web / Kavita | OpenLibrary + Google Books |
| audiobook  | Bindery               | Audiobookshelf                       | Audnexus (via Bindery)      |
| game       | None (manual workflow) | ROMM                                 | IGDB                        |
| music      | Lidarr (P3 stub only) | Navidrome/Subsonic (P3 stub only)    | MusicBrainz (P3)            |

### Authentication

Allseerr supports multiple authentication methods in parallel:

- **Plex** — existing, MUST remain functional
- **Jellyfin** — existing, MUST remain functional
- **Emby** — existing, MUST remain functional
- **OIDC** — new, generic provider (Authentik, Keycloak, etc.)

OIDC is optional. If not configured, the login page shows only existing
auth methods. OIDC groups can be mapped to Allseerr permission levels.

### Game ROM Workflow (Special Case)

Video game ROMs have no automated download manager. The workflow is:

1. User requests a game — request stored as `PENDING_APPROVAL`
2. Admin approves — status changes to `APPROVED_AWAITING_DOWNLOAD`
3. Admin or user downloads ROM manually
4. ROMM library scan detects the file — status changes to `AVAILABLE`

This is an intentional design decision. Do not automate the download step.

### Music (Phase 3 — Structure Only)

Music integration is planned but MUST NOT be implemented in Phase 1-3.
Only declare:

- `MediaType.MUSIC` in the enum
- Empty `MusicLibraryAdapter` interface
- Empty `LidarrAdapter` stub class

No music UI, business logic, or settings screens until explicitly
instructed.

## Development Workflow

### File & Folder Conventions

- New adapters: `server/lib/adapters/<mediaType>/<ServiceName>Adapter.ts`
- New services: `server/lib/services/<ServiceName>Service.ts`
- New entities: `server/entity/<EntityName>.ts`
- New API routes: `src/pages/api/v1/<resource>/`
- New settings UI: `src/components/Settings/<FeatureName>/`
- Tests: co-located `__tests__/` next to the file under test

### Prohibitions

The following actions are unconditionally forbidden:

- Modify existing movie/TV entity classes, services, or API routes
- Change existing Plex/Jellyfin/Emby authentication flows
- Use `any` TypeScript type anywhere
- Use `npm` or `yarn` (always `pnpm`)
- Implement music download logic or music UI (Phase 3 stubs only)
- Hardcode URLs, credentials, or API keys in source files
- Bypass the adapter pattern by calling external APIs directly
  from services
- Run database migrations without explicit instruction
- Modify `.eslintrc.js`, `.prettierrc.js`, or `tsconfig.json`

## Governance

This constitution is the highest-authority document for all Allseerr
development. It supersedes ad-hoc decisions and informal conventions.

### Amendment Procedure

1. Propose the change with rationale in a dedicated PR or discussion.
2. Document the change in this file with an updated version number.
3. Update all dependent templates and artifacts per the Sync Impact
   Report checklist.

### Versioning Policy

Constitution versions follow semantic versioning:

- **MAJOR**: Backward-incompatible governance or principle changes
  (removal, redefinition).
- **MINOR**: New principle or section added, or materially expanded
  guidance.
- **PATCH**: Clarifications, wording, typo fixes, non-semantic
  refinements.

### Compliance

All PRs and code reviews MUST verify compliance with the principles
defined herein. Complexity or deviation from these principles MUST be
explicitly justified in the relevant plan or PR description.

**Version**: 1.0.0 | **Ratified**: 2026-04-16 | **Last Amended**: 2026-04-16
