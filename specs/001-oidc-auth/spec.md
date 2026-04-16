# Feature Specification: OIDC Authentication

**Feature Branch**: `001-oidc-auth`
**Created**: 2026-04-16
**Status**: Draft
**Input**: Phase 0 — Add generic OIDC login as an optional, additional
authentication method alongside existing Plex/Jellyfin/Emby flows.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Admin Configures OIDC Provider (Priority: P1)

As a homelab admin, I want to configure a generic OIDC provider in the
Allseerr settings so that my users can log in using their existing
identity provider credentials without needing separate Allseerr accounts.

**Why this priority**: Without configuration, no other OIDC functionality
can exist. This is the foundational story that enables all others.

**Independent Test**: Can be fully tested by navigating to Settings,
entering OIDC provider details, saving, and confirming the configuration
persists across a container restart.

**Acceptance Scenarios**:

1. **Given** an admin on the Settings page, **When** they navigate to
   Authentication > OIDC, **Then** they see fields for Issuer URL,
   Client ID, Client Secret, and Provider display name.
2. **Given** an admin has entered valid OIDC provider details, **When**
   they click Save, **Then** the configuration is persisted and survives
   a container restart.
3. **Given** an admin has saved OIDC configuration, **When** they toggle
   OIDC off, **Then** OIDC login is disabled but the saved configuration
   is preserved for later re-enabling.
4. **Given** an admin enters an invalid Issuer URL, **When** they attempt
   to save, **Then** a clear error message with guidance is displayed.

---

### User Story 2 — User Logs In via OIDC (Priority: P1)

As a regular user, I want to see a "Sign in with [Provider Name]" button
on the login page so that I can authenticate using my identity provider
credentials without needing a separate Plex/Jellyfin login.

**Why this priority**: This is the core user-facing value of the feature.
Without login capability, OIDC configuration has no purpose.

**Independent Test**: Can be tested by configuring OIDC (US-01), then
visiting the login page and completing a full OIDC login flow. Verify a
new user account is created and the user lands on the dashboard.

**Acceptance Scenarios**:

1. **Given** OIDC is enabled and configured, **When** a user visits the
   login page, **Then** they see a "Sign in with [Provider Name]" button
   alongside existing Plex/Jellyfin/Emby buttons.
2. **Given** OIDC is not configured or disabled, **When** a user visits
   the login page, **Then** only existing auth buttons are shown.
3. **Given** a new user clicks the OIDC button and authenticates
   successfully and auto-create is enabled, **When** they are redirected
   back to Allseerr, **Then** a new account is created and they are
   logged in.
4. **Given** a returning user whose email matches an existing account,
   **When** they authenticate via OIDC, **Then** the session is linked
   to their existing account.
5. **Given** auto-create is disabled and the user has no existing account,
   **When** they attempt OIDC login, **Then** login is rejected with a
   clear message explaining the situation.
6. **Given** OIDC is enabled, **When** any user visits the login page,
   **Then** existing Plex/Jellyfin/Emby login buttons remain visible
   and fully functional.

---

### User Story 3 — Admin Maps OIDC Groups to Permissions (Priority: P2)

As a homelab admin, I want to map OIDC provider groups to Allseerr
permission levels so that my identity provider is the single source of
truth for who can request media and who is an admin.

**Why this priority**: Group mapping adds significant value but is not
required for basic OIDC login. Admins can manually assign permissions
until this is implemented.

**Independent Test**: Can be tested by configuring group mappings in
settings, then logging in with a user whose OIDC claims include specific
groups. Verify the user receives the expected permission level.

**Acceptance Scenarios**:

1. **Given** an admin on the OIDC settings page, **When** they configure
   the group claim name (e.g., `groups`), **Then** the system reads that
   claim from OIDC tokens during login.
2. **Given** an admin maps group "allseerr-admins" to Admin permission,
   **When** a user in that group logs in via OIDC, **Then** they receive
   Admin permissions.
3. **Given** a user belongs to multiple mapped groups, **When** they log
   in, **Then** they receive the highest permission level among their
   groups.
4. **Given** group mapping is not configured, **When** a user logs in
   via OIDC, **Then** they receive the default permission level set by
   the admin.
5. **Given** a user's group membership changed in the identity provider,
   **When** they log in again, **Then** their Allseerr permissions
   reflect the updated groups (re-evaluated on each login).

---

### User Story 4 — Admin Disables OIDC Without Disruption (Priority: P2)

As a homelab admin, I want to disable OIDC at any time so that users who
logged in via OIDC are not permanently locked out of their accounts.

**Why this priority**: Important for operational safety but secondary to
the core login flow. Addresses admin confidence in enabling the feature.

**Independent Test**: Can be tested by creating users via OIDC, then
disabling OIDC and verifying those users' accounts still exist and the
login page no longer shows the OIDC button.

**Acceptance Scenarios**:

1. **Given** an admin disables OIDC, **When** a user visits the login
   page, **Then** the OIDC button is hidden immediately.
2. **Given** OIDC is disabled, **When** checking the database, **Then**
   all user accounts created via OIDC are preserved.
3. **Given** a user who logged in only via OIDC and OIDC is disabled,
   **When** they attempt to log in, **Then** they see a clear message
   explaining they need an admin to link an alternative auth method.
4. **Given** an admin re-enables OIDC, **When** a previously OIDC-linked
   user logs in again, **Then** they regain access to their existing
   account.

---

### User Story 5 — Admin Tests OIDC Before Saving (Priority: P3)

As a homelab admin, I want to test my OIDC configuration before saving
it so that I can catch misconfiguration before my users encounter a
broken login page.

**Why this priority**: Improves admin experience but is not required for
core functionality. Admins can test by attempting a login without this.

**Independent Test**: Can be tested by entering OIDC details in the
settings form and clicking the "Test connection" button. Verify success
or specific error messages are returned without saving the configuration.

**Acceptance Scenarios**:

1. **Given** an admin has entered OIDC provider details, **When** they
   click "Test connection", **Then** the system validates the Issuer URL
   returns a valid OIDC discovery document.
2. **Given** the Issuer URL is valid, **When** the test runs, **Then**
   it validates that the Client ID and Secret can exchange a test token.
3. **Given** the test succeeds, **When** results are displayed, **Then**
   the admin sees a success confirmation.
4. **Given** the test fails, **When** results are displayed, **Then** the
   admin sees a specific error message (not just "failed") indicating
   what went wrong.
5. **Given** an admin runs the test, **When** the test completes, **Then**
   the configuration is NOT saved to the database.

---

### Edge Cases

- What happens when the OIDC provider is temporarily unreachable during
  a login attempt? The user sees a clear error message and can retry or
  use an alternative auth method.
- What happens when the OIDC provider returns a token without an email
  claim? Login is rejected with a message indicating that the identity
  provider must be configured to include the email claim.
- What happens when two different OIDC users share the same email
  address? The second user's session links to the existing account
  (same behavior as matching by email on first login).
- What happens when a user's email changes in the identity provider?
  A new Allseerr account is created on next login (the old account
  remains linked to the old email). Admin can merge accounts manually.
- What happens when the OIDC provider's signing keys rotate? The system
  fetches updated keys from the discovery document automatically.
- What happens when the admin changes the Client Secret while users
  have active sessions? Existing sessions remain valid until expiry;
  new logins use the updated secret.

## Clarifications

### Session 2026-04-16

- Q: Should OIDC login create a standard Allseerr session or respect the OIDC token expiry? → A: Respect OIDC token expiry — session ends when the OIDC token expires, requiring re-authentication via the identity provider.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow admins to configure an OIDC provider
  with Issuer URL, Client ID, Client Secret, and display name.
- **FR-002**: System MUST persist OIDC configuration across application
  restarts, stored in the existing settings persistence mechanism.
- **FR-003**: System MUST provide an on/off toggle for OIDC that
  preserves the saved configuration when disabled.
- **FR-004**: System MUST display a "Sign in with [Provider Name]"
  button on the login page when OIDC is enabled and configured.
- **FR-005**: System MUST NOT display the OIDC login button when OIDC
  is disabled or not configured.
- **FR-006**: System MUST redirect users to the OIDC provider for
  authentication and handle the callback to complete login.
- **FR-007**: System MUST auto-create a new user account on first OIDC
  login when the "auto-create users" setting is enabled.
- **FR-008**: System MUST match returning OIDC users to existing
  accounts by email address.
- **FR-009**: System MUST reject OIDC login for unknown users when
  auto-create is disabled, with a clear message.
- **FR-010**: System MUST NOT modify or interfere with existing
  Plex/Jellyfin/Emby authentication flows.
- **FR-011**: System MUST allow admins to specify which OIDC claim
  contains group information.
- **FR-012**: System MUST allow admins to map OIDC group names to
  Allseerr permission levels (Admin, Standard user, Request-only user).
- **FR-013**: System MUST assign the highest permission level when a
  user belongs to multiple mapped groups.
- **FR-014**: System MUST re-evaluate group-based permissions on each
  login, not cache them between sessions.
- **FR-015**: System MUST assign a configurable default permission level
  to OIDC users when group mapping is not configured.
- **FR-016**: System MUST preserve OIDC-created user accounts when OIDC
  is disabled.
- **FR-017**: System MUST provide a connection test that validates the
  OIDC discovery document and client credentials without saving config.
- **FR-018**: System MUST display specific, actionable error messages
  for all OIDC configuration and login failures.
- **FR-019**: System MUST respect the OIDC token expiry for session
  duration — when the token expires, the user MUST re-authenticate
  via the identity provider rather than maintaining an indefinite
  Allseerr session.

### Key Entities

- **OidcSettings**: OIDC provider configuration — issuer URL, client ID,
  client secret (encrypted at rest), provider display name, enabled flag,
  auto-create users flag, group claim name, default permission level.
- **OidcGroupMapping**: Maps an OIDC group name to an Allseerr permission
  level. Belongs to OidcSettings.
- **User** (existing): Extended with an optional OIDC subject identifier
  field to link accounts to their OIDC identity. Users may have multiple
  auth methods linked (Plex + OIDC, Jellyfin + OIDC, etc.).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete OIDC login (from clicking the button to
  reaching the dashboard) in under 5 seconds, excluding identity provider
  response time.
- **SC-002**: Admins can configure OIDC and complete a successful test
  login within 5 minutes of starting the setup process.
- **SC-003**: 100% of existing Plex/Jellyfin/Emby login flows continue
  to work identically after OIDC is deployed — zero regressions.
- **SC-004**: OIDC group-to-permission mapping correctly assigns
  permissions for 100% of users on every login.
- **SC-005**: Disabling OIDC results in zero data loss — all
  OIDC-created user accounts and their request history are preserved.
- **SC-006**: The OIDC connection test correctly identifies and reports
  configuration errors before the admin saves.

## Assumptions

- The homelab admin has an existing OIDC-compliant identity provider
  (Authentik, Keycloak, Authelia, etc.) already configured and running.
- The identity provider supports standard OIDC Discovery
  (`.well-known/openid-configuration`).
- The identity provider is configured to include the `email` claim in
  ID tokens (required for account matching).
- The identity provider is reachable from the Allseerr server over the
  network (no firewall or DNS issues).
- Only one OIDC provider can be configured at a time (multi-provider
  support is out of scope).
- Per-user permission overrides by admins take precedence over OIDC
  group mappings (groups set the baseline, admins can adjust individually).
- Session management for OIDC users respects the OIDC token expiry.
  This may differ from Plex/Jellyfin session durations.

## Out of Scope

- SAML authentication
- OAuth2 without OIDC (no bare GitHub/Google OAuth)
- Per-user manual permission override via OIDC groups (groups only set
  default; admins can still override individually after first login)
- Automatic user deprovisioning when removed from OIDC provider
- LDAP / Active Directory
- Multiple simultaneous OIDC providers
