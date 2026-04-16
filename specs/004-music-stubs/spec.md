# Feature Specification: Music Request Foundation (Structure Only)

**Feature Branch**: `004-music-stubs`
**Created**: 2026-04-16
**Status**: Draft
**Input**: Phase 3 — Lay the structural foundation for future music
request support. Interfaces, adapter stubs, database entity, and
feature-flagged API routes only. No working functionality. Invisible
to end users.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Music Type Exists in the Data Model (Priority: P1)

As a developer, I want `MediaType.MUSIC` to be a first-class media type
in the Allseerr data model so that future music features can be built
without schema migrations.

**Why this priority**: The data model is the foundation that all other
music stubs depend on. Without the entity, interfaces and routes have
nothing to reference.

**Independent Test**: Can be tested by verifying the enum value exists,
instantiating the music request entity, saving it to the database, and
confirming no existing entities or migrations are modified.

**Acceptance Scenarios**:

1. **Given** the Allseerr codebase, **When** a developer inspects the
   MediaType enum, **Then** `MUSIC` is declared as a value.
2. **Given** the music request entity definition, **When** a developer
   instantiates it with all required fields (artist, album title,
   release year, MusicBrainz ID, requested format, standard request
   fields), **Then** it can be saved to the database without errors.
3. **Given** the database migration for the music entity, **When** the
   migration runs, **Then** no existing entities or migrations are
   modified.

---

### User Story 2 — Music Adapter Interfaces Are Defined (Priority: P1)

As a developer, I want typed interfaces for music library adapters and
download managers so that future implementations have a clear contract
to fulfill.

**Why this priority**: Interfaces define the contract that all future
music adapters must satisfy. They must exist before stubs can be
created.

**Independent Test**: Can be tested by verifying the interfaces compile,
extend the correct base interfaces, include all specified methods, and
contain no untyped parameters.

**Acceptance Scenarios**:

1. **Given** the music library adapter interface, **When** a developer
   inspects it, **Then** it extends the base library adapter interface
   and adds methods for searching artists, searching albums, and
   checking album availability.
2. **Given** the music download adapter interface, **When** a developer
   inspects it, **Then** it extends the base download manager adapter
   and adds methods for submitting album requests and track requests.
3. **Given** both interfaces, **When** a developer checks the type
   definitions, **Then** all parameters and return types are fully
   typed with no untyped values.
4. **Given** the adapters index file, **When** a developer checks
   exports, **Then** both music interfaces are exported.

---

### User Story 3 — Adapter Stubs Exist (Priority: P1)

As a developer, I want stub adapter classes for Lidarr and Navidrome
(Subsonic) so that the connection points for future implementation are
clear.

**Why this priority**: Stubs make the adapter pattern concrete for music
and serve as the starting point for future implementation work.

**Independent Test**: Can be tested by instantiating each stub class and
calling any method. Every method must throw a descriptive error. Both
classes must have documentation comments on each method.

**Acceptance Scenarios**:

1. **Given** the Lidarr adapter stub, **When** a developer calls any
   method, **Then** it throws a descriptive error: "Music support is
   not yet implemented. See Phase 3 spec."
2. **Given** the Subsonic adapter stub, **When** a developer calls any
   method, **Then** it throws the same descriptive error.
3. **Given** both stubs, **When** a developer inspects the source,
   **Then** every method has documentation describing the expected
   future behaviour.
4. **Given** the adapter registry, **When** the music feature flag is
   disabled, **Then** neither stub is instantiated.
5. **Given** the adapter registry, **When** the music feature flag is
   enabled, **Then** both stubs are registered and available.

---

### User Story 4 — Music API Routes Exist but Return 501 (Priority: P2)

As a developer, I want the music request API routes to exist in the
routing layer so that future implementation only requires filling in
handler logic.

**Why this priority**: Routes define the external contract for music
features but depend on the entity and interfaces being in place first.

**Independent Test**: Can be tested by enabling the music feature flag
and calling each route. All must return 501 Not Implemented with a
descriptive message.

**Acceptance Scenarios**:

1. **Given** the music feature flag is enabled, **When** a developer
   calls any music API route (search, create request, list requests,
   get request by ID), **Then** it returns HTTP 501 with message:
   "Music support is not yet implemented."
2. **Given** the music feature flag is disabled, **When** a developer
   calls any music API route, **Then** the route is not registered and
   returns HTTP 404.
3. **Given** the API documentation, **When** a developer reviews it,
   **Then** music routes appear with a "planned" status indicator.

---

### User Story 5 — Music Feature Flag Defaults to Disabled (Priority: P1)

As a developer, I want a feature flag that controls all music-related
code paths so that the stubs do not affect production behaviour.

**Why this priority**: The feature flag is the safety mechanism that
prevents any music code from affecting production. It must be in place
before any music stubs are activated.

**Independent Test**: Can be tested by starting the application with
the flag unset (default) and verifying no music routes, settings, UI,
or database queries are active. Then set the flag and verify stubs
activate.

**Acceptance Scenarios**:

1. **Given** the application starts with no explicit flag value, **When**
   the flag is checked, **Then** it defaults to disabled.
2. **Given** the flag is disabled, **When** the application runs, **Then**
   no music routes are registered, no music settings appear, no music
   UI is rendered, and no music database queries are executed.
3. **Given** the flag is enabled, **When** the application runs, **Then**
   music stubs are active (returning 501), and a placeholder is visible
   to admins only with a "Coming soon" indicator.
4. **Given** the flag can be set via an environment variable, **When**
   a developer sets it for testing, **Then** the application respects
   the new value.
5. **Given** the application starts, **When** the flag state is
   determined, **Then** the current state is logged at startup.

---

### Edge Cases

- What happens when a future developer enables the music flag in
  production? All music routes return 501. No data is served, no
  external services are contacted. The only visible change is a
  "Coming soon" placeholder for admins.
- What happens when the music entity migration runs on a database that
  already has movie, TV, book, and game data? The migration is additive
  only — no existing tables or data are modified.
- What happens when a developer calls a stub method without the feature
  flag enabled? The stub class is not instantiated, so the call cannot
  be made through the normal adapter registry path. Direct instantiation
  would throw the NotImplementedError.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST include `MUSIC` as a value in the MediaType
  enum.
- **FR-002**: System MUST define a music request entity with fields for
  artist, album title, release year, MusicBrainz ID, requested format,
  and all standard request fields (status, requesting user, timestamps).
- **FR-003**: System MUST include a database migration for the music
  request entity that does not modify any existing entities or
  migrations.
- **FR-004**: System MUST define a music library adapter interface that
  extends the base library adapter interface and adds methods for
  searching artists, searching albums, and checking album availability.
- **FR-005**: System MUST define a music download adapter interface that
  extends the base download manager adapter and adds methods for
  submitting album requests and track requests.
- **FR-006**: System MUST ensure all music interface methods are fully
  typed with no untyped parameters or return values.
- **FR-007**: System MUST export all music interfaces from the adapters
  index file.
- **FR-008**: System MUST provide a Lidarr adapter stub class that
  implements the music download adapter interface with all methods
  throwing a descriptive NotImplementedError.
- **FR-009**: System MUST provide a Subsonic adapter stub class that
  implements the music library adapter interface with all methods
  throwing a descriptive NotImplementedError.
- **FR-010**: System MUST include documentation comments on every stub
  method describing the expected future behaviour.
- **FR-011**: System MUST register both stubs in the adapter registry
  only when the music feature flag is enabled.
- **FR-012**: System MUST provide API routes for music search, create
  request, list requests, and get request by ID.
- **FR-013**: System MUST return HTTP 501 Not Implemented with a
  descriptive message body from all music API routes.
- **FR-014**: System MUST register music API routes only when the music
  feature flag is enabled.
- **FR-015**: System MUST provide a feature flag (`ENABLE_MUSIC`) that
  defaults to disabled.
- **FR-016**: System MUST ensure that when the feature flag is disabled,
  no music routes are registered, no music settings appear, no music
  UI is rendered, and no music database queries are executed.
- **FR-017**: System MUST allow the feature flag to be set via
  environment variable.
- **FR-018**: System MUST log the music feature flag state at
  application startup.
- **FR-019**: System MUST show a "Coming soon" placeholder visible to
  admins only when the feature flag is enabled.
- **FR-020**: System MUST NOT modify or interfere with existing movie,
  TV, book, audiobook, or game request workflows.
- **FR-021**: System MUST NOT contact any external music service
  (Lidarr, Navidrome, MusicBrainz, or any other).

### Key Entities

- **MusicRequest**: Represents a music request — artist name, album
  title, release year, MusicBrainz ID, requested format (MP3/FLAC/
  etc.), and all standard request fields (status, requesting user,
  created/updated timestamps). This entity is created by the migration
  but not actively used until the feature flag is enabled in a future
  phase.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of existing movie, TV, book, audiobook, and game
  request workflows continue to work identically — zero regressions.
- **SC-002**: The music feature flag defaults to disabled and zero
  music-related behaviour is observable in production when unset.
- **SC-003**: A future developer can enable the feature flag and
  confirm all stubs respond correctly (501 responses, descriptive
  errors) within 5 minutes.
- **SC-004**: All music adapter interfaces compile successfully and
  contain zero untyped parameters.
- **SC-005**: The music request entity can be instantiated and saved
  to the database without errors when the migration has run.
- **SC-006**: Application startup time is not measurably affected by
  the presence of music stubs (less than 100ms increase).

## Assumptions

- The base adapter interfaces (`MediaLibraryAdapter`,
  `DownloadManagerAdapter`) already exist from Phase 1 and Phase 2
  work.
- The adapter registry pattern supports conditional registration based
  on feature flags.
- The existing routing framework supports conditional route
  registration.
- The MusicBrainz ID format is a standard UUID string.
- The "requested format" field uses a simple string enum (MP3, FLAC,
  AAC, OGG, etc.) — the exact values will be finalized during full
  music implementation.
- No end user will interact with any music functionality in this phase.

## Out of Scope

- Any working music search, request, or download flow
- Music settings UI visible to end users
- Integration with Lidarr, Navidrome, MusicBrainz, or any other service
- Track-level vs album-level request model decision (deferred to full
  implementation phase)
- Music-specific notification templates
- Any changes to existing media type handling
