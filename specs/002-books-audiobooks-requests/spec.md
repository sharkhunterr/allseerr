# Feature Specification: Books and Audiobooks Requests

**Feature Branch**: `002-books-audiobooks-requests`
**Created**: 2026-04-16
**Status**: Draft
**Input**: Phase 1 — Bring books and audiobooks into the same request
workflow that exists for movies and TV. Users search, request, admins
approve, download managers fetch, library servers reflect availability.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Admin Configures Download Manager (Priority: P1)

As a homelab admin, I want to configure Bindery (or Readarr as fallback)
as the download manager for books and audiobooks so that approved
requests are automatically sent for download.

**Why this priority**: Without a configured download manager, no request
can be fulfilled. This is the foundational infrastructure story.

**Independent Test**: Can be tested by navigating to Settings > Books &
Audiobooks > Download Manager, adding a Bindery instance with URL and
API key, testing the connection, saving, and confirming it persists
across a restart.

**Acceptance Scenarios**:

1. **Given** an admin on the Settings page, **When** they navigate to
   Books & Audiobooks > Download Manager, **Then** they see options to
   add Bindery and Readarr instances.
2. **Given** an admin enters a valid Bindery URL and API key, **When**
   they click "Test connection", **Then** they see a success confirmation.
3. **Given** an admin has added a Bindery instance, **When** they assign
   it to handle books, audiobooks, or both, **Then** the assignment is
   saved and respected for future requests.
4. **Given** an admin adds a Readarr instance, **When** they configure
   it as fallback, **Then** it is used only when Bindery is unavailable
   or not configured.
5. **Given** an admin configures quality profiles on an instance, **When**
   a request is forwarded, **Then** the configured format/quality
   preferences are applied.

---

### User Story 2 — Admin Configures Library Servers (Priority: P1)

As a homelab admin, I want to connect one or more book and audiobook
library servers so that Allseerr can check availability and mark
requests as fulfilled.

**Why this priority**: Library server connectivity is required for
availability detection and the complete request lifecycle.

**Independent Test**: Can be tested by adding a Grimmory or
Audiobookshelf instance in Settings, testing the connection, and
confirming Allseerr can query its library contents.

**Acceptance Scenarios**:

1. **Given** an admin on the Settings page, **When** they navigate to
   Books & Audiobooks > Library Servers, **Then** they see options to
   add Grimmory, Audiobookshelf, Calibre-Web, and Kavita instances.
2. **Given** an admin adds a library server instance, **When** they
   specify which media type it handles (books, audiobooks, or both),
   **Then** that assignment is saved and respected.
3. **Given** an admin clicks "Test connection" on a library server,
   **When** the server is reachable and credentials are valid, **Then**
   a success message is displayed.
4. **Given** multiple instances of the same server type are configured,
   **When** Allseerr checks availability, **Then** it queries all
   configured instances.
5. **Given** library servers are configured, **When** Allseerr runs a
   periodic scan, **Then** it updates availability status for all known
   book and audiobook items.

---

### User Story 3 — User Searches for a Book (Priority: P1)

As a user, I want to search for a book by title or author so that I can
find the exact edition I want to request without needing to know the
ISBN.

**Why this priority**: Search is the entry point for the entire request
flow. Without search, users cannot discover and request content.

**Independent Test**: Can be tested by typing a book title in the search
bar and verifying results show cover, title, author, year, publisher,
format, and series information.

**Acceptance Scenarios**:

1. **Given** a user on the search page, **When** they enter a book title,
   **Then** results show cover image, title, author(s), year, publisher,
   format, and series name/position if applicable.
2. **Given** a user searches by author name, **When** results are
   returned, **Then** all books by that author from the metadata source
   are shown.
3. **Given** a user searches by ISBN, **When** the ISBN matches a known
   book, **Then** that book appears in results.
4. **Given** a book already exists in the connected library server,
   **When** it appears in search results, **Then** it is marked "Already
   available" and cannot be re-requested.
5. **Given** more than 20 results match, **When** results are displayed,
   **Then** they are paginated with at least 20 per page.

---

### User Story 4 — User Requests a Book (Priority: P1)

As a user, I want to request a book so that the admin can approve it
and the book appears in my library server.

**Why this priority**: The request action is the core user-facing value
of the feature.

**Independent Test**: Can be tested by searching for a book and clicking
the request button. Verify the request appears in the user's profile and
in the admin dashboard.

**Acceptance Scenarios**:

1. **Given** a user viewing a book in search results, **When** they
   click the request button, **Then** a request is submitted in one
   click.
2. **Given** a user submitting a request, **When** the request form is
   shown, **Then** they can add an optional note (e.g., preferred
   format).
3. **Given** a book has already been requested by any user, **When**
   another user tries to request it, **Then** it shows "Already
   requested" with the current status.
4. **Given** a user has submitted requests, **When** they visit their
   profile, **Then** they see all their pending and completed book
   requests.
5. **Given** a request's status changes, **When** the change occurs,
   **Then** the requesting user receives a notification.

---

### User Story 5 — Admin Approves or Declines a Book Request (Priority: P1)

As an admin, I want to review and approve or decline book requests so
that I control what gets added to my library.

**Why this priority**: Admin approval is the gatekeeper of the request
lifecycle and must work for the flow to complete.

**Independent Test**: Can be tested by submitting a book request as a
user, then logging in as admin and approving it. Verify the request is
forwarded to the download manager.

**Acceptance Scenarios**:

1. **Given** a pending book request exists, **When** an admin views the
   request management dashboard, **Then** the request appears with a
   "Book" type badge.
2. **Given** an admin viewing a pending request, **When** they click
   approve, **Then** the request is forwarded to the configured download
   manager.
3. **Given** an admin viewing a pending request, **When** they click
   decline, **Then** the requester receives a notification with the
   admin's optional reason.
4. **Given** an admin has configured auto-approval for a user, **When**
   that user submits a book request, **Then** it is automatically
   approved without admin intervention.
5. **Given** an admin viewing a request, **When** they click "mark as
   unavailable", **Then** the request status reflects this and the user
   is notified.

---

### User Story 6 — Book Appears as Available After Download (Priority: P2)

As a user, I want my request to be automatically marked as available
once the book has been added to the library server, so that I know when
I can access it.

**Why this priority**: Availability detection completes the request
lifecycle but requires working search, request, and approval first.

**Independent Test**: Can be tested by approving a request, letting the
download manager fetch the book, then verifying the library server scan
updates the request status to "Available".

**Acceptance Scenarios**:

1. **Given** an approved request has been fulfilled by the download
   manager, **When** the library server detects the new book file during
   a scan, **Then** the request status updates to "Available".
2. **Given** a request becomes available, **When** the status changes,
   **Then** the user receives a notification.
3. **Given** a book is marked available, **When** the user views the
   book's detail page, **Then** a direct link to the library server item
   is shown.
4. **Given** a download fails, **When** the failure is detected, **Then**
   the request is marked "Failed" with a visible reason.

---

### User Story 7 — User Searches for an Audiobook (Priority: P2)

As a user, I want to search for an audiobook by title, author, or
narrator so that I can request the specific narrated version I want.

**Why this priority**: Audiobook search is the entry point for the
audiobook request flow but can be delivered after the book flow is
complete.

**Independent Test**: Can be tested by typing an audiobook title or
narrator name in the search bar and verifying results show audiobook-
specific metadata including narrator and duration.

**Acceptance Scenarios**:

1. **Given** a user searching for an audiobook, **When** results are
   returned, **Then** they show cover, title, author, narrator, duration,
   publisher, and Audible ASIN if available.
2. **Given** a work exists as both ebook and audiobook, **When** search
   results are shown, **Then** the two editions are clearly
   distinguished.
3. **Given** an audiobook exists in the connected audiobook library,
   **When** it appears in search results, **Then** it is marked "Already
   available".
4. **Given** a user searches by narrator name, **When** results are
   returned, **Then** audiobooks narrated by that person are shown with
   narrator name displayed prominently.

---

### User Story 8 — User Requests an Audiobook (Priority: P2)

As a user, I want to request an audiobook with the same one-click
experience as requesting a movie.

**Why this priority**: Completes the audiobook request flow after search
is available.

**Independent Test**: Can be tested by searching for an audiobook,
clicking the request button, and verifying it is stored as an audiobook
request (separate from book requests).

**Acceptance Scenarios**:

1. **Given** a user viewing an audiobook in search results, **When**
   they click the request button, **Then** a request is submitted with
   the same one-click flow as books.
2. **Given** multiple formats exist (unabridged vs abridged), **When**
   the user submits a request, **Then** they can specify their preferred
   format.
3. **Given** an audiobook request is submitted, **When** it is stored,
   **Then** it is stored as a separate media type from book requests.

---

### User Story 9 — Audiobook Appears as Available (Priority: P2)

As a user, I want my audiobook request to be marked available once it
appears in my audiobook server.

**Why this priority**: Completes the audiobook lifecycle after the book
availability flow is proven.

**Independent Test**: Can be tested by approving an audiobook request,
letting it be fulfilled, and verifying the audiobook server scan updates
the status.

**Acceptance Scenarios**:

1. **Given** an approved audiobook request has been fulfilled, **When**
   the audiobook server detects the file, **Then** the request status
   updates to "Available".
2. **Given** an audiobook is marked available, **When** the user views
   the detail page, **Then** a direct link to the audiobook server item
   is shown.

---

### User Story 10 — Admin Controls Book/Audiobook Permissions (Priority: P3)

As an admin, I want to control which users can request books and
audiobooks using the existing permission system so that I don't need a
separate access control model.

**Why this priority**: Permission controls enhance governance but basic
request flow works without custom quotas. Existing permission levels
apply by default.

**Independent Test**: Can be tested by configuring separate request
quotas for books and audiobooks, then verifying users are limited
accordingly.

**Acceptance Scenarios**:

1. **Given** the existing Allseerr permission levels, **When** a user
   attempts a book or audiobook request, **Then** the same permission
   model (Admin, Standard, Request-only) applies.
2. **Given** an admin configures separate request quotas for books vs
   audiobooks, **When** a user reaches their book quota, **Then** they
   can still request audiobooks (and vice versa).
3. **Given** an admin configures auto-approval rules for books, **When**
   an audiobook request is submitted, **Then** the audiobook auto-
   approval rules apply independently.

---

### Edge Cases

- What happens when a metadata source (OpenLibrary, Google Books) is
  temporarily unreachable? Search returns a clear error message and
  suggests retrying. Previously cached results remain visible.
- What happens when the download manager rejects a request (e.g.,
  already monitored)? The request status reflects the rejection reason
  and the admin is notified.
- What happens when a book exists in multiple library servers? Allseerr
  marks it as available if found in any configured server. The detail
  page shows links to all servers that have it.
- What happens when the same work exists as both ebook and audiobook?
  They are treated as separate media types with independent request
  lifecycles. A user can request both.
- What happens when a library server is removed from settings while
  requests reference it? Existing requests retain their status.
  Availability checks for that server stop. A warning is shown to the
  admin.
- What happens when a user requests a book with no download manager
  configured? The request is stored with status "Pending Approval" but
  the admin sees a warning that no download manager is available to
  fulfill it.
- What happens when Bindery is down but Readarr is configured as
  fallback? The system attempts Readarr automatically and logs the
  Bindery failure for the admin.

## Clarifications

### Session 2026-04-16

- Q: Unified or segmented search across media types? → A: Unified search bar with media type filter/tabs (default: all types). Extends the existing Seerr search bar.
- Q: How should books/audiobooks be matched between metadata sources and library servers? → A: Follow the Libreseerr (zamnzim) approach — OpenLibrary as the sole user-facing search source; cascading match via ISBN first, then title+author free-text fallback; library server's own metadata (Readarr/Bookshelf) for server-side lookup; `foreignBookId`/`foreignAuthorId` for deduplication. No fuzzy matching — first result from server lookup is used. Same matching logic for ebooks and audiobooks (different server instance, same algorithm).
- Q: Default library server scan interval? → A: 5 minutes default for books/audiobooks. Configurable per server instance by the admin.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to search for books by title,
  author name, or ISBN via the unified search bar with media type
  filter/tabs.
- **FR-002**: System MUST allow users to search for audiobooks by title,
  author name, or narrator name.
- **FR-003**: System MUST display book search results with cover image,
  title, author(s), year, publisher, format, and series info.
- **FR-004**: System MUST display audiobook search results with cover,
  title, author, narrator, duration, publisher, and Audible ASIN when
  available.
- **FR-005**: System MUST mark search results as "Already available"
  when the item exists in a connected library server.
- **FR-006**: System MUST prevent re-requesting items already in the
  library.
- **FR-007**: System MUST paginate search results with at least 20
  items per page.
- **FR-008**: System MUST allow users to submit book and audiobook
  requests in one click from search results.
- **FR-009**: System MUST allow users to add an optional note when
  submitting a request.
- **FR-010**: System MUST detect and display duplicate requests (same
  item already requested) with the current status.
- **FR-011**: System MUST notify users when their request status changes.
- **FR-012**: System MUST display all of a user's pending and completed
  requests in their profile, filtered by media type.
- **FR-013**: System MUST display book and audiobook requests in the
  admin request management dashboard with type badges.
- **FR-014**: System MUST allow admins to approve, decline, or mark
  requests as unavailable.
- **FR-015**: System MUST forward approved requests to the configured
  download manager automatically.
- **FR-016**: System MUST support auto-approval per user for books and
  audiobooks independently.
- **FR-017**: System MUST send a notification to the requester when a
  request is declined, including the admin's optional reason.
- **FR-018**: System MUST update request status to "Available" when the
  library server detects the item during a periodic scan.
- **FR-019**: System MUST show a direct link to the library server item
  on the detail page once available.
- **FR-020**: System MUST mark requests as "Failed" with a visible
  reason when a download fails.
- **FR-021**: System MUST allow admins to configure one or more Bindery
  instances with URL and API key.
- **FR-022**: System MUST allow admins to configure Readarr instances
  as fallback download managers.
- **FR-023**: System MUST allow admins to assign each download manager
  instance to books, audiobooks, or both.
- **FR-024**: System MUST allow admins to test download manager
  connections before saving.
- **FR-025**: System MUST allow admins to configure quality profiles per
  download manager instance.
- **FR-026**: System MUST allow admins to configure library servers
  (Grimmory, Audiobookshelf, Calibre-Web, Kavita) with connection
  details.
- **FR-027**: System MUST allow admins to add multiple instances of the
  same library server type.
- **FR-028**: System MUST allow admins to specify which media type each
  library server handles.
- **FR-029**: System MUST allow admins to test library server connections
  before saving.
- **FR-030**: System MUST periodically scan configured library servers
  to update availability status.
- **FR-031**: System MUST apply existing permission levels (Admin,
  Standard, Request-only) to book and audiobook requests.
- **FR-032**: System MUST allow admins to set separate request quotas
  for books and audiobooks.
- **FR-033**: System MUST allow admins to configure auto-approval rules
  independently for books and audiobooks.
- **FR-034**: System MUST NOT modify or interfere with existing movie
  and TV request workflows.
- **FR-035**: System MUST distinguish between ebook and audiobook
  editions of the same work in search results.
- **FR-036**: System MUST allow audiobook requesters to specify preferred
  format (e.g., unabridged vs abridged).
- **FR-037**: System MUST fall back to Readarr when Bindery is
  unavailable and Readarr is configured.
- **FR-038**: System MUST use OpenLibrary as the primary user-facing
  search source for books and audiobooks (following the Libreseerr
  pattern by zamnzim).
- **FR-039**: System MUST match books to library server entries using
  a cascading strategy: ISBN first, then title+author free-text
  fallback, using the library server's own metadata for server-side
  lookup.
- **FR-040**: System MUST use `foreignBookId` and `foreignAuthorId`
  for deduplication when available from the library server.
- **FR-041**: System MUST use the same matching algorithm for ebooks
  and audiobooks, differentiated only by the target server instance.
- **FR-042**: System MUST default library server scan interval to
  5 minutes for books and audiobooks, configurable per server instance
  by the admin.

### Key Entities

- **BookMedia**: Represents a book in the system — title, author(s),
  ISBN, publisher, year, cover image URL, series name, series position,
  external metadata ID. Linked to availability status from library
  servers.
- **AudiobookMedia**: Represents an audiobook — title, author(s),
  narrator(s), duration, publisher, Audible ASIN, cover image URL,
  external metadata ID. Linked to availability status from audiobook
  servers.
- **MediaRequest** (extended): The existing request entity extended to
  support book and audiobook media types. Includes optional user note,
  preferred format, and the same lifecycle states as movie/TV requests.
- **DownloadManagerInstance**: A configured download manager connection —
  service type (Bindery/Readarr), URL, API key (encrypted at rest),
  assigned media types, quality profile, active/fallback flag.
- **LibraryServerInstance**: A configured library server connection —
  service type (Grimmory/Audiobookshelf/Calibre-Web/Kavita), URL,
  API key (encrypted at rest), assigned media types, scan interval.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can search for a book or audiobook and submit a
  request in under 30 seconds from the search page.
- **SC-002**: Admins can configure a download manager and a library
  server and complete a successful test connection within 10 minutes
  of starting setup.
- **SC-003**: 100% of existing movie and TV request workflows continue
  to work identically — zero regressions.
- **SC-004**: Book and audiobook search results load within 3 seconds
  for typical queries.
- **SC-005**: Request status automatically updates to "Available" within
  one scan interval after the item appears in the library server.
- **SC-006**: 95% of users can complete the book request flow (search to
  submitted request) on their first attempt without help.
- **SC-007**: Duplicate request detection prevents 100% of duplicate
  submissions for the same item.
- **SC-008**: Fallback from Bindery to Readarr occurs automatically
  with no admin intervention when Bindery is unreachable.

## Assumptions

- Admins have at least one of the supported library servers (Grimmory,
  Audiobookshelf, Calibre-Web, or Kavita) already running and
  accessible from the Allseerr instance.
- Admins have Bindery or Readarr installed and configured for book/
  audiobook downloads.
- OpenLibrary is the sole user-facing search source (not Google Books).
  It is publicly accessible and does not require authentication.
- Audnexus metadata is accessed via Bindery, not directly.
- The existing notification system in Allseerr (used for movie/TV
  requests) can be extended to support book and audiobook notifications
  without architectural changes.
- The existing request management dashboard can accommodate additional
  media types with minimal UI changes (type badge, filters).
- Library server scan interval defaults to 5 minutes for books and
  audiobooks, configurable per server instance by the admin.
- Only one OIDC or auth method is needed to access book/audiobook
  features — no separate authentication is required beyond the existing
  Allseerr login.

## Out of Scope

- Comic book or manga requests (separate future feature)
- Magazine or periodical requests (separate future feature)
- In-app reading or playback of books/audiobooks
- Purchasing books from external stores
- Music requests (Phase 3)
- Game ROM requests (Phase 2)
