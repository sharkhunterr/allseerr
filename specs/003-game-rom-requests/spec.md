# Feature Specification: Video Game ROM Requests

**Feature Branch**: `003-game-rom-requests`
**Created**: 2026-04-16
**Status**: Draft
**Input**: Phase 2 — Add a game request workflow with no automated
download step. Users search and request games, admins approve, and
availability is detected automatically when the ROM appears in ROMM.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Admin Configures ROMM Connection (Priority: P1)

As a homelab admin, I want to connect my ROMM instance to Allseerr so
that game availability can be checked and request statuses updated
automatically.

**Why this priority**: Without a ROMM connection, availability detection
cannot work and the game request lifecycle is incomplete.

**Independent Test**: Can be tested by navigating to Settings > Games >
Library Server, entering ROMM connection details, testing the
connection, saving, and confirming it persists across a restart.

**Acceptance Scenarios**:

1. **Given** an admin on the Settings page, **When** they navigate to
   Games > Library Server, **Then** they see fields for ROMM URL and
   API key or username/password.
2. **Given** an admin enters valid ROMM connection details, **When**
   they click "Test connection", **Then** they see a success
   confirmation.
3. **Given** an admin saves a ROMM connection, **When** they configure
   the polling interval, **Then** the default is 15 minutes and can be
   changed.
4. **Given** an admin on the ROMM settings page, **When** they click
   "Sync now", **Then** a manual library sync is triggered immediately.
5. **Given** ROMM is temporarily unreachable, **When** a poll fails,
   **Then** Allseerr queues the check, retries later, and does not
   affect other media types.

---

### User Story 2 — User Searches for a Game (Priority: P1)

As a user, I want to search for a video game by title or platform so
that I can find and request the specific game and version I want.

**Why this priority**: Search is the entry point for the entire game
request flow. Users cannot request without discovering games first.

**Independent Test**: Can be tested by typing a game title in the search
bar and verifying results show cover art, title, platform(s), release
year, developer, publisher, genre, and user rating.

**Acceptance Scenarios**:

1. **Given** a user on the search page, **When** they enter a game title,
   **Then** results show cover art, title, platform(s), release year,
   developer, publisher, genre, and user rating.
2. **Given** a user searching for a game, **When** they apply a platform
   filter (e.g., SNES, PlayStation 2), **Then** only results for that
   platform are shown.
3. **Given** no platform filter is applied, **When** results are
   displayed, **Then** all platforms are included by default.
4. **Given** a game exists in the connected ROMM library, **When** it
   appears in search results, **Then** it is marked "Already available"
   with a direct link to the ROMM entry.
5. **Given** a game has been requested by any user, **When** it appears
   in search results, **Then** the current request status is shown.

---

### User Story 3 — User Requests a Game (Priority: P1)

As a user, I want to request a game with the same experience as
requesting a movie so that I don't need to contact the admin separately.

**Why this priority**: The request action is the core user-facing value
of this feature.

**Independent Test**: Can be tested by searching for a game and clicking
the request button. Verify the request is stored and visible in the
user's profile and admin dashboard.

**Acceptance Scenarios**:

1. **Given** a user viewing a game in search results, **When** they
   click the request button, **Then** a request is submitted in one
   click.
2. **Given** a game is available on multiple platforms, **When** the
   user submits a request, **Then** they can specify their preferred
   platform.
3. **Given** a user submitting a request, **When** the request form is
   shown, **Then** they can add an optional note (e.g., "PAL region",
   "No-Intro verified dump").
4. **Given** a user viewing the request form, **When** it is displayed,
   **Then** it clearly states: "Games are added manually by the admin.
   There is no automatic download."
5. **Given** the same game on the same platform has already been
   requested, **When** another user tries to request it, **Then** they
   see the existing request status instead of creating a duplicate.
6. **Given** a request's status changes, **When** the change occurs,
   **Then** the requesting user receives a notification.

---

### User Story 4 — User Tracks Game Requests (Priority: P2)

As a user, I want to see all my game requests and their current status
so that I know which games are pending, approved, or available.

**Why this priority**: Request tracking enhances transparency but the
core request flow works without it.

**Independent Test**: Can be tested by submitting game requests, then
visiting the user profile and verifying all requests appear with
correct statuses.

**Acceptance Scenarios**:

1. **Given** a user with game requests, **When** they visit their
   profile, **Then** game requests appear alongside movie, TV, and book
   requests.
2. **Given** a game request with status "Approved", **When** it is
   displayed, **Then** it shows "Approved (awaiting addition)" with a
   brief explanation that the game will be added manually.
3. **Given** a game request marked available, **When** the user views
   it, **Then** a direct link to the ROMM entry is shown.
4. **Given** game requests in various states, **When** the user views
   their profile, **Then** status labels are: Pending, Approved
   (awaiting addition), Available, Declined.

---

### User Story 5 — Admin Reviews and Approves Game Requests (Priority: P1)

As an admin, I want to review game requests in the same dashboard as all
other media requests so that I have a single place to manage everything.

**Why this priority**: Admin approval is required for the request
lifecycle to progress.

**Independent Test**: Can be tested by submitting a game request as a
user, then logging in as admin, finding the request in the dashboard,
and approving it.

**Acceptance Scenarios**:

1. **Given** a pending game request exists, **When** an admin views the
   request management dashboard, **Then** the request appears with a
   "Game" type badge and the platform clearly visible.
2. **Given** an admin viewing a pending game request, **When** they
   click approve, **Then** the request moves to "Approved — Awaiting
   Addition" status.
3. **Given** an admin approving a request, **When** approval is
   confirmed, **Then** the admin can add a note visible to the user
   (e.g., "Will add next weekend").
4. **Given** an admin viewing a pending request, **When** they click
   decline, **Then** the requester receives a notification with the
   admin's optional reason.
5. **Given** an admin viewing the request dashboard, **When** they
   apply a media type filter, **Then** they can filter to show only
   game requests.
6. **Given** an admin viewing a request, **When** they click "mark as
   unavailable", **Then** the status reflects this and the user is
   notified.

---

### User Story 6 — Automatic Availability Detection (Priority: P2)

As an admin, I want Allseerr to automatically mark a game request as
available when ROMM detects the ROM file, so that I don't have to
manually update request statuses.

**Why this priority**: Availability detection completes the lifecycle
automatically but requires a working ROMM connection and approved
requests first.

**Independent Test**: Can be tested by approving a game request, adding
the ROM file to the ROMM library, and verifying that after the next
poll the request status changes to "Available".

**Acceptance Scenarios**:

1. **Given** ROMM is configured and a game request is approved, **When**
   ROMM detects a new game file matching the request (by title and
   platform), **Then** the request status changes to "Available"
   automatically.
2. **Given** a request becomes available, **When** the status changes,
   **Then** the user receives a notification.
3. **Given** a game is marked available, **When** the user views the
   request detail page, **Then** a direct link to the ROMM game entry
   is shown.
4. **Given** ROMM is not configured, **When** an admin wants to mark
   a request as available, **Then** they can do so manually from the
   dashboard.

---

### User Story 7 — Admin Controls Game Permissions (Priority: P3)

As an admin, I want game requests to respect the existing permission
system so that I can restrict game requesting to trusted users if
needed.

**Why this priority**: Permission controls add governance but the default
permission levels already apply. Custom quotas and auto-approval are
refinements.

**Independent Test**: Can be tested by configuring a game request quota,
then verifying a user is blocked after exceeding it.

**Acceptance Scenarios**:

1. **Given** the existing Allseerr permission levels, **When** a user
   attempts a game request, **Then** the same permission model (Admin,
   Standard, Request-only) applies.
2. **Given** an admin configures a separate game request quota, **When**
   a user reaches the quota, **Then** further game requests are blocked
   without affecting other media types.
3. **Given** an admin enables auto-approval for games, **When** a
   trusted user submits a game request, **Then** it is automatically
   approved (default: off, since games require manual addition).

---

### Edge Cases

- What happens when ROMM is unreachable during a scheduled poll?
  Allseerr logs the failure, queues the check, and retries on the next
  interval. No error is surfaced to users. Other media types are
  unaffected.
- What happens when a game in ROMM matches multiple pending requests
  (different users, same game/platform)? All matching requests are
  marked as "Available" simultaneously.
- What happens when a game exists on multiple platforms in ROMM but the
  request specifies one platform? Only the request for the matching
  platform is marked available. Requests for other platforms remain in
  their current state.
- What happens when a user requests a game but no ROMM instance is
  configured? The request is stored normally. The admin sees a warning
  in settings that no library server is configured for games. The admin
  can manually mark requests as available.
- What happens when ROMM removes a game that was previously marked
  available? The request status remains "Available" — Allseerr does not
  revert availability. The admin can manually update the status.
- What happens when the metadata source is unreachable during a game
  search? A clear error message is shown suggesting the user retry.
  Previously viewed results are not affected.
- What happens when the admin changes the ROMM polling interval?
  The new interval takes effect immediately for the next scheduled poll.

## Clarifications

### Session 2026-04-16

- Q: Unified or segmented search across media types? → A: Unified search bar with media type filter/tabs (default: all types). Extends the existing Seerr search bar.
- Q: Does IGDB require authentication for API access? → A: Yes. IGDB requires a Twitch Developer API key (Client ID + Client Secret). Admin must configure these credentials in the Games settings section.
- Q: Default ROMM polling interval? → A: 15 minutes default. Configurable per server instance by the admin.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to search for games by title
  via the unified search bar with media type filter/tabs.
- **FR-002**: System MUST allow users to filter game search results by
  platform (e.g., SNES, PlayStation 2, Game Boy Advance, Nintendo 64).
- **FR-003**: System MUST display game search results with cover art,
  title, platform(s), release year, developer, publisher, genre, and
  user rating.
- **FR-004**: System MUST mark search results as "Already available"
  when the game exists in a connected ROMM library, with a direct link
  to the ROMM entry.
- **FR-005**: System MUST show the current request status on search
  results for games already requested by any user.
- **FR-006**: System MUST allow users to submit game requests in one
  click from search results.
- **FR-007**: System MUST allow users to specify a preferred platform
  when a game is available on multiple platforms.
- **FR-008**: System MUST allow users to add an optional note when
  submitting a game request.
- **FR-009**: System MUST display a clear message on the request form
  stating that games are added manually with no automatic download.
- **FR-010**: System MUST detect and prevent duplicate requests for the
  same game on the same platform, showing the existing request status
  instead.
- **FR-011**: System MUST notify users when their game request status
  changes.
- **FR-012**: System MUST display game requests in the user's profile
  alongside other media type requests.
- **FR-013**: System MUST use game-specific status labels: Pending,
  Approved (awaiting addition), Available, Declined.
- **FR-014**: System MUST include a brief explanation with the "Approved
  (awaiting addition)" status that the game will be added manually.
- **FR-015**: System MUST display game requests in the admin request
  management dashboard with a "Game" type badge and platform visible.
- **FR-016**: System MUST allow admins to approve, decline, or mark
  game requests as unavailable.
- **FR-017**: System MUST transition approved game requests to
  "Approved — Awaiting Addition" status (not to a download manager).
- **FR-018**: System MUST allow admins to add a note visible to the
  requester when approving or declining.
- **FR-019**: System MUST send a notification to the requester when a
  request is declined, including the admin's optional reason.
- **FR-020**: System MUST allow admins to filter the request dashboard
  by media type, including games.
- **FR-021**: System MUST allow admins to configure a ROMM instance
  with URL and API key or username/password.
- **FR-022**: System MUST allow admins to test the ROMM connection
  before saving.
- **FR-023**: System MUST allow admins to configure the ROMM polling
  interval (default: 15 minutes).
- **FR-024**: System MUST allow admins to manually trigger a ROMM
  library sync at any time.
- **FR-025**: System MUST periodically poll ROMM for new entries and
  automatically mark matching requests as "Available".
- **FR-026**: System MUST match ROMM entries to requests by title and
  platform.
- **FR-027**: System MUST show a direct link to the ROMM entry on the
  request detail page when a game is available.
- **FR-028**: System MUST gracefully handle ROMM being unreachable by
  queuing and retrying, without affecting other media types.
- **FR-029**: System MUST allow admins to manually mark game requests
  as available when ROMM is not configured.
- **FR-030**: System MUST apply existing permission levels (Admin,
  Standard, Request-only) to game requests.
- **FR-031**: System MUST allow admins to set a separate request quota
  for games.
- **FR-032**: System MUST allow admins to enable auto-approval for
  games independently of other media types (default: off).
- **FR-033**: System MUST NOT modify or interfere with existing movie,
  TV, book, or audiobook request workflows.
- **FR-034**: System MUST NOT implement any automated ROM downloading.
- **FR-035**: System MUST require admin to configure IGDB/Twitch API
  credentials (Client ID + Client Secret) in the Games settings
  section for game metadata search to function.
- **FR-036**: System MUST default the ROMM polling interval to
  15 minutes, configurable per server instance by the admin.

### Key Entities

- **GameMedia**: Represents a video game — title, platform(s), release
  year, developer, publisher, genre, user rating, cover art URL,
  external metadata ID (IGDB). A game on different platforms is treated
  as distinct entries.
- **MediaRequest** (extended): The existing request entity extended to
  support game media type. Includes preferred platform, optional user
  note, admin note, and game-specific status lifecycle (no download
  step).
- **RommServerInstance**: A configured ROMM connection — URL, API key
  or username/password (encrypted at rest), polling interval (default
  15 min, configurable), last sync timestamp.
- **IgdbCredentials**: IGDB/Twitch API credentials — Client ID, Client
  Secret (encrypted at rest). Required for game metadata search.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can search for a game and submit a request in under
  30 seconds from the search page.
- **SC-002**: Admins can configure a ROMM connection and complete a
  successful test within 5 minutes of starting setup.
- **SC-003**: 100% of existing movie, TV, book, and audiobook request
  workflows continue to work identically — zero regressions.
- **SC-004**: Game search results load within 3 seconds for typical
  queries.
- **SC-005**: Request status automatically updates to "Available" within
  one polling interval after the ROM file appears in ROMM.
- **SC-006**: 95% of users understand from the request form that games
  require manual addition (no confusion about automated downloads).
- **SC-007**: Duplicate request detection prevents 100% of duplicate
  submissions for the same game on the same platform.
- **SC-008**: ROMM connectivity failures do not impact the availability
  or performance of any other media type feature.

## Assumptions

- Admins have a running ROMM instance accessible from the Allseerr
  server over the network.
- ROMM exposes an API that Allseerr can query for game listings and
  new additions.
- Game metadata is sourced from IGDB, which requires a Twitch
  Developer API key (Client ID + Client Secret) for access. The admin
  must configure these credentials in the Games settings.
- The existing notification system in Allseerr can be extended to
  support game request notifications without architectural changes.
- The existing request management dashboard can accommodate the game
  media type with minimal UI changes (type badge, platform display,
  filters).
- Platform names are standardized by the metadata source (IGDB) and
  do not require manual mapping by the admin.
- ROMM organizes games by platform, enabling reliable matching of
  requests to library entries by title and platform.

## Out of Scope

- Automated ROM downloading of any kind
- ROM file verification or checksum validation
- Emulator configuration or launching
- Save state management
- Platform metadata management (ROMM handles this)
- Music requests (Phase 3)
