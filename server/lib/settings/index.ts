import { MediaServerType } from '@server/constants/server';
import { Permission } from '@server/lib/permissions';
import { runMigrations } from '@server/lib/settings/migrator';
import { randomBytes, randomUUID } from 'crypto';
import fs from 'fs/promises';
import { mergeWith } from 'lodash';
import path from 'path';
import webpush from 'web-push';

// Prevents stale array entries when incoming data has fewer elements
const mergeSettings = <T>(current: T, incoming: Partial<T>): T =>
  mergeWith({}, current, incoming, (_objValue, srcValue) =>
    Array.isArray(srcValue) ? srcValue : undefined
  ) as T;

export interface Library {
  id: string;
  name: string;
  enabled: boolean;
  type: 'show' | 'movie';
  lastScan?: number;
}

export interface Region {
  iso_3166_1: string;
  english_name: string;
  name?: string;
}

export interface Language {
  iso_639_1: string;
  english_name: string;
  name: string;
}

export interface PlexSettings {
  name: string;
  machineId?: string;
  ip: string;
  port: number;
  useSsl?: boolean;
  libraries: Library[];
  webAppUrl?: string;
}

export interface JellyfinSettings {
  name: string;
  ip: string;
  port: number;
  useSsl?: boolean;
  urlBase?: string;
  externalHostname?: string;
  jellyfinForgotPasswordUrl?: string;
  libraries: Library[];
  serverId: string;
  apiKey: string;
}
export interface TautulliSettings {
  hostname?: string;
  port?: number;
  useSsl?: boolean;
  urlBase?: string;
  apiKey?: string;
  externalUrl?: string;
}

export interface DVRSettings {
  id: number;
  name: string;
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl?: string;
  activeProfileId: number;
  activeProfileName: string;
  activeDirectory: string;
  tags: number[];
  is4k: boolean;
  isDefault: boolean;
  externalUrl?: string;
  syncEnabled: boolean;
  preventSearch: boolean;
  tagRequests: boolean;
  overrideRule: number[];
}

export interface RadarrSettings extends DVRSettings {
  minimumAvailability: string;
}

export interface SonarrSettings extends DVRSettings {
  seriesType: 'standard' | 'daily' | 'anime';
  animeSeriesType: 'standard' | 'daily' | 'anime';
  activeAnimeProfileId?: number;
  activeAnimeProfileName?: string;
  activeAnimeDirectory?: string;
  activeAnimeLanguageProfileId?: number;
  activeLanguageProfileId?: number;
  animeTags?: number[];
  enableSeasonFolders: boolean;
  monitorNewItems: 'all' | 'none';
}

export interface BinderySettings extends DVRSettings {
  mediaType: 'book' | 'audiobook';
}

export interface BookshelfSettings extends DVRSettings {
  mediaType: 'book' | 'audiobook';
  metadataProfileId?: number;
}

/**
 * Pressarr — kkodecs/pressarr is the *arr-style periodical /
 * magazine manager. Same dispatch contract as Bindery /
 * Bookshelf except the mediaType is fixed to ``magazine``
 * (pressarr only handles periodicals). POST /api/v1/magazine
 * needs a rootFolderId + qualityProfileId — we surface both
 * through the standard DVRSettings ``activeProfileId`` +
 * ``activeDirectory`` fields (the test endpoint enumerates
 * pressarr's options so the modal can offer dropdowns).
 *
 * Auth is the standard ``X-Api-Key`` header that the rest of
 * the *arr family uses.
 */
export interface PressarrSettings extends DVRSettings {
  mediaType: 'magazine';
}

/**
 * Livrarr — kkodecs/livrarr is an *arr-style ebook + audiobook
 * acquisition service (Rust, single Docker image, Hardcover /
 * OpenLibrary / Audnexus metadata, Prowlarr indexers, qBittorrent
 * or SABnzbd downloaders). It plays the same role as Bindery /
 * Bookshelf for allseerr: when a book or audiobook request is
 * approved the dispatcher posts the work to the default Livrarr
 * instance for the requested mediaType, and Livrarr handles the
 * acquisition + library placement (it pushes finished ebooks to
 * Calibre-Web-Automated and audiobooks to Audiobookshelf).
 *
 * Slimmer than BookshelfSettings: Livrarr has no per-instance
 * quality / metadata profiles and configures its root folder
 * globally inside its own UI, so allseerr only needs URL + API
 * key + the mediaType this instance owns. ``preventSearch``
 * mirrors the same flag on the Servarr DVR types — when set,
 * the work is added in ``monitor`` mode without triggering an
 * immediate search (operator does it from the Livrarr UI).
 */
export interface LivrarrSettings {
  id: number;
  name: string;
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl?: string;
  isDefault: boolean;
  mediaType: 'book' | 'audiobook';
  preventSearch?: boolean;
  externalUrl?: string;
}

/**
 * Romarr — the game *acquisition* service (the Radarr role for ROMs).
 * When a game request is approved the subscriber asks the default
 * Romarr instance to acquire it; ROMM stays the library / "Play"
 * role and IGDB stays the metadata provider.
 *
 * Unlike Radarr/Sonarr/Bindery/Bookshelf, Romarr has no quality
 * profiles or root folders to pick — it resolves its own platform
 * and library from the IGDB id allseerr sends — so this is a slim
 * connection-only service instance. ``apiKey`` must be a Romarr
 * admin API key.
 */
export interface RomarrSettings {
  id: number;
  name: string;
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl?: string;
  isDefault: boolean;
  externalUrl?: string;
}

interface Quota {
  quotaLimit?: number;
  quotaDays?: number;
}

export enum MetadataProviderType {
  TMDB = 'tmdb',
  TVDB = 'tvdb',
}

export interface MetadataSettings {
  tv: MetadataProviderType;
  anime: MetadataProviderType;
  audibleRegion?: string;
}

export interface ProxySettings {
  enabled: boolean;
  hostname: string;
  port: number;
  useSsl: boolean;
  user: string;
  password: string;
  bypassFilter: string;
  bypassLocalAddresses: boolean;
}

export interface MainSettings {
  apiKey: string;
  applicationTitle: string;
  applicationUrl: string;
  cacheImages: boolean;
  defaultPermissions: number;
  defaultQuotas: {
    movie: Quota;
    tv: Quota;
    book: Quota;
    audiobook: Quota;
    game: Quota;
    manga: Quota;
    comic: Quota;
    magazine: Quota;
  };
  hideAvailable: boolean;
  hideBlocklisted: boolean;
  localLogin: boolean;
  mediaServerLogin: boolean;
  newPlexLogin: boolean;
  discoverRegion: string;
  streamingRegion: string;
  originalLanguage: string;
  blocklistRegion: string;
  blocklistLanguage: string;
  blocklistedTags: string;
  blocklistedTagsLimit: number;
  mediaServerType: number;
  partialRequestsEnabled: boolean;
  enableSpecialEpisodes: boolean;
  locale: string;
  youtubeUrl: string;
}

export interface ProxySettings {
  enabled: boolean;
  hostname: string;
  port: number;
  useSsl: boolean;
  user: string;
  password: string;
  bypassFilter: string;
  bypassLocalAddresses: boolean;
}

export interface DnsCacheSettings {
  enabled: boolean;
  forceMinTtl?: number;
  forceMaxTtl?: number;
}

export interface NetworkSettings {
  csrfProtection: boolean;
  forceIpv4First: boolean;
  trustProxy: boolean;
  proxy: ProxySettings;
  dnsCache: DnsCacheSettings;
  apiRequestTimeout: number;
}

interface PublicSettings {
  initialized: boolean;
}

interface FullPublicSettings extends PublicSettings {
  applicationTitle: string;
  applicationUrl: string;
  hideAvailable: boolean;
  hideBlocklisted: boolean;
  localLogin: boolean;
  mediaServerLogin: boolean;
  movie4kEnabled: boolean;
  series4kEnabled: boolean;
  discoverRegion: string;
  streamingRegion: string;
  originalLanguage: string;
  mediaServerType: number;
  jellyfinExternalHost?: string;
  jellyfinForgotPasswordUrl?: string;
  jellyfinServerName?: string;
  partialRequestsEnabled: boolean;
  enableSpecialEpisodes: boolean;
  cacheImages: boolean;
  vapidPublic: string;
  enablePushRegistration: boolean;
  locale: string;
  emailEnabled: boolean;
  userEmailRequired: boolean;
  newPlexLogin: boolean;
  youtubeUrl: string;
  plexClientIdentifier: string;
  oidcEnabled: boolean;
  oidcProviderName: string;
  bookEnabled: boolean;
  audiobookEnabled: boolean;
  gameEnabled: boolean;
  mangaEnabled: boolean;
  comicEnabled: boolean;
  magazineEnabled: boolean;
  // Optional admin-defined notices shown at the top of each request
  // modal. Empty string per scope = no notice. Surfaced via the
  // public settings endpoint so the modals (which run as any user)
  // can read them without an admin-scoped request.
  requestNotices: RequestNotices;
}

export interface NotificationAgentConfig {
  enabled: boolean;
  embedPoster: boolean;
  types?: number;
  options: Record<string, unknown>;
}
export interface NotificationAgentDiscord extends NotificationAgentConfig {
  options: {
    botUsername?: string;
    botAvatarUrl?: string;
    webhookUrl: string;
    webhookRoleId?: string;
    enableMentions: boolean;
  };
}

export interface NotificationAgentSlack extends NotificationAgentConfig {
  options: {
    webhookUrl: string;
  };
}

export interface NotificationAgentEmail extends NotificationAgentConfig {
  options: {
    userEmailRequired: boolean;
    emailFrom: string;
    smtpHost: string;
    smtpPort: number;
    secure: boolean;
    ignoreTls: boolean;
    requireTls: boolean;
    authUser?: string;
    authPass?: string;
    allowSelfSigned: boolean;
    senderName: string;
    pgpPrivateKey?: string;
    pgpPassword?: string;
  };
}

export interface NotificationAgentTelegram extends NotificationAgentConfig {
  options: {
    botUsername?: string;
    botAPI: string;
    chatId: string;
    messageThreadId: string;
    sendSilently: boolean;
  };
}

export interface NotificationAgentPushbullet extends NotificationAgentConfig {
  options: {
    accessToken: string;
    channelTag?: string;
  };
}

export interface NotificationAgentPushover extends NotificationAgentConfig {
  options: {
    accessToken: string;
    userToken: string;
    sound: string;
  };
}

export interface NotificationAgentWebhook extends NotificationAgentConfig {
  options: {
    webhookUrl: string;
    jsonPayload: string;
    authHeader?: string;
    customHeaders?: { key: string; value: string }[];
    supportVariables?: boolean;
  };
}

export interface NotificationAgentGotify extends NotificationAgentConfig {
  options: {
    url: string;
    token: string;
    priority: number;
  };
}

export interface NotificationAgentNtfy extends NotificationAgentConfig {
  options: {
    url: string;
    topic: string;
    authMethodUsernamePassword?: boolean;
    username?: string;
    password?: string;
    authMethodToken?: boolean;
    token?: string;
    priority?: number;
  };
}

export enum NotificationAgentKey {
  DISCORD = 'discord',
  EMAIL = 'email',
  GOTIFY = 'gotify',
  NTFY = 'ntfy',
  PUSHBULLET = 'pushbullet',
  PUSHOVER = 'pushover',
  SLACK = 'slack',
  TELEGRAM = 'telegram',
  WEBHOOK = 'webhook',
  WEBPUSH = 'webpush',
}

interface NotificationAgents {
  discord: NotificationAgentDiscord;
  email: NotificationAgentEmail;
  gotify: NotificationAgentGotify;
  ntfy: NotificationAgentNtfy;
  pushbullet: NotificationAgentPushbullet;
  pushover: NotificationAgentPushover;
  slack: NotificationAgentSlack;
  telegram: NotificationAgentTelegram;
  webhook: NotificationAgentWebhook;
  webpush: NotificationAgentConfig;
}

interface NotificationSettings {
  agents: NotificationAgents;
}

interface JobSettings {
  schedule: string;
}

export type JobId =
  | 'plex-recently-added-scan'
  | 'plex-full-scan'
  | 'plex-watchlist-sync'
  | 'plex-refresh-token'
  | 'radarr-scan'
  | 'sonarr-scan'
  | 'download-sync'
  | 'download-sync-reset'
  | 'jellyfin-recently-added-scan'
  | 'jellyfin-full-scan'
  | 'image-cache-cleanup'
  | 'availability-sync'
  | 'process-blocklisted-tags'
  | 'romm-scan'
  | 'romm-collections-scan'
  | 'audiobookshelf-scan'
  | 'komga-scan'
  | 'grimmory-scan'
  | 'manga-availability-scan'
  | 'comic-availability-scan';

export interface OidcGroupMapping {
  oidcGroup: string;
  permissions: number;
}

export interface AudiobookshelfLibraryMapping {
  libraryId: string;
  name: string;
  mediaType: 'book' | 'audiobook' | 'ignore';
}

export interface BookSettings {
  audiobookshelf: {
    url: string;
    publicUrl: string;
    apiKey: string;
    pollIntervalMinutes: number;
    enabled: boolean;
    libraries: AudiobookshelfLibraryMapping[];
  };
  komga: {
    url: string;
    publicUrl: string;
    apiKey: string;
    pollIntervalMinutes: number;
    enabled: boolean;
  };
  grimmory: {
    url: string;
    publicUrl: string;
    username: string;
    password: string;
    pollIntervalMinutes: number;
    enabled: boolean;
  };
  metadataProviders: {
    // The one source that owns book / series / author IDENTITY across
    // the whole app — search results, detail pages, series pages and
    // author pages all come from here. The other enabled providers
    // below are used for ENRICHMENT only: they fill fields the primary
    // source didn't provide (ISBN, rating, series fallback, …) but can
    // never overwrite anything the primary set. Keeps URLs / covers /
    // titles consistent no matter where the user clicked from.
    primarySource: 'openlibrary' | 'hardcover';
    // Enrichment-only providers below. Enable to fill missing fields
    // in the primary source's response. They never win identity.
    bindery: boolean;
    bookshelf: boolean;
    googleBooks: boolean;
    googleBooksApiKey?: string;
    hardcover: boolean;
    hardcoverApiKey?: string;
    // Preferred ISO-639-1 code ("en", "fr", "de"…) passed to every
    // provider's search. Empty string = no preference.
    preferredLanguage: string;
    // "prefer": matching-language results are pushed to the top but
    // everything else is still returned (safer default — no book
    // disappears from the list if it isn't available in the preferred
    // language).
    // "strict": drop any result that doesn't match the preferred
    // language outright. Use when the library is mono-lingual and
    // foreign editions would be noise.
    languagePolicy: 'prefer' | 'strict';
  };
}

export interface AudiobookSettings {
  metadataProviders: {
    // Single identity source for audiobooks — same split as
    // book.metadataProviders.primarySource. Audible is the de-facto
    // default because it's free and covers the widest catalog; users
    // with a Hardcover account can flip to Hardcover for richer
    // metadata (ratings, tags, narrator). The non-primary provider is
    // enrichment-only.
    primarySource: 'audible' | 'hardcover';
    audible: boolean;
    // Audible regional storefront — ISO-ish 2-letter code consumed by
    // server/api/audible. Moved here from metadataSettings.audibleRegion
    // so the audiobook provider tab owns all its state; the legacy
    // field is kept as a fallback for old configs.
    audibleRegion?: string;
    hardcover: boolean;
    // Hardcover uses a single account so the API key is *shared* with
    // book.metadataProviders.hardcoverApiKey at runtime; we don't store
    // a duplicate here. The boolean above only gates whether Hardcover
    // is considered for audiobooks at all.
    preferredLanguage: string;
    languagePolicy: 'prefer' | 'strict';
  };
}

export interface MangaSettings {
  metadataProviders: {
    // Sole source today (AniList GraphQL, free, no API key). The
    // shape mirrors book.metadataProviders so the UI tab can reuse
    // the primarySource select / enrichment toggle pattern, but
    // currently AniList is the only viable free metadata source
    // for manga at scale.
    primarySource: 'anilist';
    anilist: boolean;
    // Optional Jikan (MyAnimeList REST proxy) enrichment — disabled
    // by default because AniList already carries score / tags /
    // characters and Jikan adds latency without much new content.
    jikan: boolean;
    preferredLanguage: string;
    languagePolicy: 'prefer' | 'strict';
    // Hide adult-tagged manga from search + detail responses.
    // AniList exposes `isAdult` and `tags[].isAdult` flags we
    // honour when this is on.
    hideAdult: boolean;
  };
  // Optional Suwayomi (a.k.a. Tachidesk) download-manager. Behaves
  // like ROMM for games — when not configured, requests fall back
  // to a manual workflow (admin marks AVAILABLE by hand).
  suwayomi: {
    url: string;
    publicUrl: string;
    apiKey: string;
    username: string;
    password: string;
    pollIntervalMinutes: number;
    enabled: boolean;
  };
}

export interface GameSettings {
  igdb: {
    clientId: string;
    clientSecret: string;
  };
  romm: {
    url: string;
    publicUrl: string;
    apiKey: string;
    username: string;
    password: string;
    pollIntervalMinutes: number;
    enabled: boolean;
  };
  // When true, the game request button is only offered for platforms
  // a configured Romarr instance can actually acquire (resolved via
  // IGDB platform id). Default true — undeclared platforms get no
  // request button rather than a request that would fail at dispatch.
  restrictToRomarrPlatforms: boolean;
}

export interface ComicSettings {
  metadataProviders: {
    // ComicVine is the only viable free comics metadata source today
    // (League of Comic Geeks needs a paid partner key, Marvel's API
    // is per-character only). Shape mirrors manga.metadataProviders
    // so the UI tab can reuse the same primarySource select.
    primarySource: 'comicvine';
    comicvine: boolean;
    apiKey: string;
    // Hide adult / mature-flagged volumes from search + detail.
    // ComicVine doesn't expose a dedicated isAdult flag, so we
    // filter on tags / publisher heuristics inside the route layer.
    hideAdult: boolean;
  };
  // Optional Mylar3 download manager. Behaves like Suwayomi for
  // manga / ROMM for games — when not configured, comic requests
  // fall back to the manual workflow.
  mylar: {
    url: string;
    publicUrl: string;
    apiKey: string;
    pollIntervalMinutes: number;
    enabled: boolean;
  };
}

export interface OidcSettings {
  enabled: boolean;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  displayName: string;
  autoCreateUsers: boolean;
  groupClaimName: string;
  defaultPermissions: number;
  groupMappings: OidcGroupMapping[];
}

/**
 * Master on/off switches for each non-TMDB media type. When a
 * type is OFF:
 *  - it disappears from the search tabs (xxxEnabled in
 *    fullPublicSettings ANDs with these flags)
 *  - the search / detail / request routes for that type return 503
 *  - the request modal can't be opened (the detail page returns 404)
 *
 * Defaults to true for every type to preserve existing behaviour
 * for upgrading installs — admins explicitly opt OUT.
 */
export interface MediaTypeToggles {
  book: boolean;
  audiobook: boolean;
  game: boolean;
  manga: boolean;
  comic: boolean;
  magazine: boolean;
}

/** Severity drives the matching <Alert type=…> visual. */
export type RequestNoticeSeverity = 'info' | 'warning' | 'error';

/**
 * One admin-defined notice block. Empty `message` = no notice for
 * that scope (the severity is irrelevant when the message is
 * blank). Severity drives the alert color / icon (info = blue,
 * warning = amber, error = red — matches the existing Alert
 * component's variants).
 */
export interface RequestNoticeEntry {
  message: string;
  severity: RequestNoticeSeverity;
}

/**
 * Optional admin-defined notices that surface as alerts at the top
 * of each request modal AND on the matching content detail page.
 * The `global` field shows on every request regardless of type;
 * per-type fields stack with it (global on top, per-type below).
 */
export interface RequestNotices {
  global: RequestNoticeEntry;
  movie: RequestNoticeEntry;
  tv: RequestNoticeEntry;
  book: RequestNoticeEntry;
  audiobook: RequestNoticeEntry;
  game: RequestNoticeEntry;
  manga: RequestNoticeEntry;
  comic: RequestNoticeEntry;
  magazine: RequestNoticeEntry;
}

export interface AllSettings {
  clientId: string;
  sessionSecret?: string;
  vapidPublic: string;
  vapidPrivate: string;
  main: MainSettings;
  plex: PlexSettings;
  jellyfin: JellyfinSettings;
  tautulli: TautulliSettings;
  radarr: RadarrSettings[];
  sonarr: SonarrSettings[];
  bindery: BinderySettings[];
  bookshelf: BookshelfSettings[];
  livrarr: LivrarrSettings[];
  pressarr: PressarrSettings[];
  romarr: RomarrSettings[];
  public: PublicSettings;
  notifications: NotificationSettings;
  jobs: Record<JobId, JobSettings>;
  network: NetworkSettings;
  metadataSettings: MetadataSettings;
  game: GameSettings;
  book: BookSettings;
  audiobook: AudiobookSettings;
  manga: MangaSettings;
  comic: ComicSettings;
  mediaTypes: MediaTypeToggles;
  requestNotices: RequestNotices;
  oidc: OidcSettings;
  migrations: string[];
}

const SETTINGS_PATH = process.env.CONFIG_DIRECTORY
  ? `${process.env.CONFIG_DIRECTORY}/settings.json`
  : path.join(__dirname, '../../../config/settings.json');

class Settings {
  private data: AllSettings;
  private saveLock: Promise<void> = Promise.resolve();

  constructor(initialSettings?: AllSettings) {
    this.data = {
      clientId: randomUUID(),
      sessionSecret: '',
      vapidPrivate: '',
      vapidPublic: '',
      main: {
        apiKey: '',
        applicationTitle: 'Seerr',
        applicationUrl: '',
        cacheImages: false,
        defaultPermissions: Permission.REQUEST,
        defaultQuotas: {
          movie: {},
          tv: {},
          book: {},
          audiobook: {},
          game: {},
          manga: {},
          comic: {},
          magazine: {},
        },
        hideAvailable: false,
        hideBlocklisted: false,
        localLogin: true,
        mediaServerLogin: true,
        newPlexLogin: true,
        discoverRegion: '',
        streamingRegion: '',
        originalLanguage: '',
        blocklistRegion: '',
        blocklistLanguage: '',
        blocklistedTags: '',
        blocklistedTagsLimit: 50,
        mediaServerType: MediaServerType.NOT_CONFIGURED,
        partialRequestsEnabled: true,
        enableSpecialEpisodes: false,
        locale: 'en',
        youtubeUrl: '',
      },
      plex: {
        name: '',
        ip: '',
        port: 32400,
        useSsl: false,
        libraries: [],
      },
      jellyfin: {
        name: '',
        ip: '',
        port: 8096,
        useSsl: false,
        urlBase: '',
        externalHostname: '',
        jellyfinForgotPasswordUrl: '',
        libraries: [],
        serverId: '',
        apiKey: '',
      },
      tautulli: {},
      metadataSettings: {
        tv: MetadataProviderType.TMDB,
        anime: MetadataProviderType.TMDB,
        audibleRegion: 'us',
      },
      radarr: [],
      sonarr: [],
      bindery: [],
      bookshelf: [],
      livrarr: [],
      pressarr: [],
      romarr: [],
      public: {
        initialized: false,
      },
      notifications: {
        agents: {
          email: {
            enabled: false,
            embedPoster: true,
            options: {
              userEmailRequired: false,
              emailFrom: '',
              smtpHost: '',
              smtpPort: 587,
              secure: false,
              ignoreTls: false,
              requireTls: false,
              allowSelfSigned: false,
              senderName: 'Seerr',
            },
          },
          discord: {
            enabled: false,
            embedPoster: true,
            types: 0,
            options: {
              webhookUrl: '',
              webhookRoleId: '',
              enableMentions: true,
            },
          },
          slack: {
            enabled: false,
            embedPoster: true,
            types: 0,
            options: {
              webhookUrl: '',
            },
          },
          telegram: {
            enabled: false,
            embedPoster: true,
            types: 0,
            options: {
              botAPI: '',
              chatId: '',
              messageThreadId: '',
              sendSilently: false,
            },
          },
          pushbullet: {
            enabled: false,
            embedPoster: false,
            types: 0,
            options: {
              accessToken: '',
            },
          },
          pushover: {
            enabled: false,
            embedPoster: true,
            types: 0,
            options: {
              accessToken: '',
              userToken: '',
              sound: '',
            },
          },
          webhook: {
            enabled: false,
            embedPoster: true,
            types: 0,
            options: {
              webhookUrl: '',
              jsonPayload:
                'IntcbiAgXCJub3RpZmljYXRpb25fdHlwZVwiOiBcInt7bm90aWZpY2F0aW9uX3R5cGV9fVwiLFxuICBcImV2ZW50XCI6IFwie3tldmVudH19XCIsXG4gIFwic3ViamVjdFwiOiBcInt7c3ViamVjdH19XCIsXG4gIFwibWVzc2FnZVwiOiBcInt7bWVzc2FnZX19XCIsXG4gIFwiaW1hZ2VcIjogXCJ7e2ltYWdlfX1cIixcbiAgXCJ7e21lZGlhfX1cIjoge1xuICAgIFwibWVkaWFfdHlwZVwiOiBcInt7bWVkaWFfdHlwZX19XCIsXG4gICAgXCJ0bWRiSWRcIjogXCJ7e21lZGlhX3RtZGJpZH19XCIsXG4gICAgXCJ0dmRiSWRcIjogXCJ7e21lZGlhX3R2ZGJpZH19XCIsXG4gICAgXCJzdGF0dXNcIjogXCJ7e21lZGlhX3N0YXR1c319XCIsXG4gICAgXCJzdGF0dXM0a1wiOiBcInt7bWVkaWFfc3RhdHVzNGt9fVwiXG4gIH0sXG4gIFwie3tyZXF1ZXN0fX1cIjoge1xuICAgIFwicmVxdWVzdF9pZFwiOiBcInt7cmVxdWVzdF9pZH19XCIsXG4gICAgXCJyZXF1ZXN0ZWRCeV9lbWFpbFwiOiBcInt7cmVxdWVzdGVkQnlfZW1haWx9fVwiLFxuICAgIFwicmVxdWVzdGVkQnlfdXNlcm5hbWVcIjogXCJ7e3JlcXVlc3RlZEJ5X3VzZXJuYW1lfX1cIixcbiAgICBcInJlcXVlc3RlZEJ5X2F2YXRhclwiOiBcInt7cmVxdWVzdGVkQnlfYXZhdGFyfX1cIixcbiAgICBcInJlcXVlc3RlZEJ5X3NldHRpbmdzX2Rpc2NvcmRJZFwiOiBcInt7cmVxdWVzdGVkQnlfc2V0dGluZ3NfZGlzY29yZElkfX1cIixcbiAgICBcInJlcXVlc3RlZEJ5X3NldHRpbmdzX3RlbGVncmFtQ2hhdElkXCI6IFwie3tyZXF1ZXN0ZWRCeV9zZXR0aW5nc190ZWxlZ3JhbUNoYXRJZH19XCJcbiAgfSxcbiAgXCJ7e2lzc3VlfX1cIjoge1xuICAgIFwiaXNzdWVfaWRcIjogXCJ7e2lzc3VlX2lkfX1cIixcbiAgICBcImlzc3VlX3R5cGVcIjogXCJ7e2lzc3VlX3R5cGV9fVwiLFxuICAgIFwiaXNzdWVfc3RhdHVzXCI6IFwie3tpc3N1ZV9zdGF0dXN9fVwiLFxuICAgIFwicmVwb3J0ZWRCeV9lbWFpbFwiOiBcInt7cmVwb3J0ZWRCeV9lbWFpbH19XCIsXG4gICAgXCJyZXBvcnRlZEJ5X3VzZXJuYW1lXCI6IFwie3tyZXBvcnRlZEJ5X3VzZXJuYW1lfX1cIixcbiAgICBcInJlcG9ydGVkQnlfYXZhdGFyXCI6IFwie3tyZXBvcnRlZEJ5X2F2YXRhcn19XCIsXG4gICAgXCJyZXBvcnRlZEJ5X3NldHRpbmdzX2Rpc2NvcmRJZFwiOiBcInt7cmVwb3J0ZWRCeV9zZXR0aW5nc19kaXNjb3JkSWR9fVwiLFxuICAgIFwicmVwb3J0ZWRCeV9zZXR0aW5nc190ZWxlZ3JhbUNoYXRJZFwiOiBcInt7cmVwb3J0ZWRCeV9zZXR0aW5nc190ZWxlZ3JhbUNoYXRJZH19XCJcbiAgfSxcbiAgXCJ7e2NvbW1lbnR9fVwiOiB7XG4gICAgXCJjb21tZW50X21lc3NhZ2VcIjogXCJ7e2NvbW1lbnRfbWVzc2FnZX19XCIsXG4gICAgXCJjb21tZW50ZWRCeV9lbWFpbFwiOiBcInt7Y29tbWVudGVkQnlfZW1haWx9fVwiLFxuICAgIFwiY29tbWVudGVkQnlfdXNlcm5hbWVcIjogXCJ7e2NvbW1lbnRlZEJ5X3VzZXJuYW1lfX1cIixcbiAgICBcImNvbW1lbnRlZEJ5X2F2YXRhclwiOiBcInt7Y29tbWVudGVkQnlfYXZhdGFyfX1cIixcbiAgICBcImNvbW1lbnRlZEJ5X3NldHRpbmdzX2Rpc2NvcmRJZFwiOiBcInt7Y29tbWVudGVkQnlfc2V0dGluZ3NfZGlzY29yZElkfX1cIixcbiAgICBcImNvbW1lbnRlZEJ5X3NldHRpbmdzX3RlbGVncmFtQ2hhdElkXCI6IFwie3tjb21tZW50ZWRCeV9zZXR0aW5nc190ZWxlZ3JhbUNoYXRJZH19XCJcbiAgfSxcbiAgXCJ7e2V4dHJhfX1cIjogW11cbn0i',
            },
          },
          webpush: {
            enabled: false,
            embedPoster: true,
            options: {},
          },
          gotify: {
            enabled: false,
            embedPoster: false,
            types: 0,
            options: {
              url: '',
              token: '',
              priority: 0,
            },
          },
          ntfy: {
            enabled: false,
            embedPoster: true,
            types: 0,
            options: {
              url: '',
              topic: '',
              priority: 3,
            },
          },
        },
      },
      jobs: {
        'plex-recently-added-scan': {
          schedule: '0 */5 * * * *',
        },
        'plex-full-scan': {
          schedule: '0 0 3 * * *',
        },
        'plex-watchlist-sync': {
          schedule: '0 */3 * * * *',
        },
        'plex-refresh-token': {
          schedule: '0 0 5 * * *',
        },
        'radarr-scan': {
          schedule: '0 0 4 * * *',
        },
        'sonarr-scan': {
          schedule: '0 30 4 * * *',
        },
        'availability-sync': {
          schedule: '0 0 5 * * *',
        },
        'download-sync': {
          schedule: '0 * * * * *',
        },
        'download-sync-reset': {
          schedule: '0 0 1 * * *',
        },
        'jellyfin-recently-added-scan': {
          schedule: '0 */5 * * * *',
        },
        'jellyfin-full-scan': {
          schedule: '0 0 3 * * *',
        },
        'image-cache-cleanup': {
          schedule: '0 0 5 * * *',
        },
        'process-blocklisted-tags': {
          schedule: '0 30 1 */7 * *',
        },
        'romm-scan': {
          schedule: '0 */15 * * * *',
        },
        'romm-collections-scan': {
          // Weekly by default (Sundays at 04:00). Collections are
          // user-curated and rarely change between ROM additions, so
          // a slower cadence than the main ROMM Library Scan is the
          // right default. User can override from Settings → Jobs.
          schedule: '0 0 4 * * 0',
        },
        'audiobookshelf-scan': {
          schedule: '0 */15 * * * *',
        },
        'komga-scan': {
          schedule: '0 */15 * * * *',
        },
        'grimmory-scan': {
          schedule: '0 */15 * * * *',
        },
        // Poll Suwayomi / Mylar for download progress every 5
        // minutes so the dashboard cards flip from PROCESSING
        // → PARTIALLY_AVAILABLE → AVAILABLE without operator
        // intervention. Frequent enough to feel responsive while
        // the download is actively running; cheap enough that
        // running with an unconfigured Suwayomi / Mylar is a
        // no-op early-return.
        'manga-availability-scan': {
          schedule: '0 */5 * * * *',
        },
        'comic-availability-scan': {
          schedule: '0 */5 * * * *',
        },
      },
      network: {
        csrfProtection: false,
        forceIpv4First: false,
        trustProxy: false,
        proxy: {
          enabled: false,
          hostname: '',
          port: 8080,
          useSsl: false,
          user: '',
          password: '',
          bypassFilter: '',
          bypassLocalAddresses: true,
        },
        dnsCache: {
          enabled: false,
          forceMinTtl: 0,
          forceMaxTtl: -1,
        },
        apiRequestTimeout: 10000,
      },
      game: {
        igdb: {
          clientId: '',
          clientSecret: '',
        },
        romm: {
          url: '',
          publicUrl: '',
          apiKey: '',
          username: '',
          password: '',
          pollIntervalMinutes: 15,
          enabled: false,
        },
        restrictToRomarrPlatforms: true,
      },
      book: {
        audiobookshelf: {
          url: '',
          publicUrl: '',
          apiKey: '',
          pollIntervalMinutes: 15,
          enabled: false,
          libraries: [],
        },
        komga: {
          url: '',
          publicUrl: '',
          apiKey: '',
          pollIntervalMinutes: 15,
          enabled: false,
        },
        grimmory: {
          url: '',
          publicUrl: '',
          username: '',
          password: '',
          pollIntervalMinutes: 15,
          enabled: false,
        },
        metadataProviders: {
          primarySource: 'openlibrary',
          bindery: false,
          bookshelf: false,
          googleBooks: false,
          googleBooksApiKey: '',
          hardcover: false,
          hardcoverApiKey: '',
          preferredLanguage: '',
          languagePolicy: 'prefer',
        },
      },
      audiobook: {
        metadataProviders: {
          primarySource: 'audible',
          audible: true,
          audibleRegion: 'us',
          hardcover: false,
          preferredLanguage: '',
          languagePolicy: 'prefer',
        },
      },
      manga: {
        metadataProviders: {
          primarySource: 'anilist',
          anilist: true,
          jikan: false,
          preferredLanguage: '',
          languagePolicy: 'prefer',
          hideAdult: true,
        },
        suwayomi: {
          url: '',
          publicUrl: '',
          apiKey: '',
          username: '',
          password: '',
          pollIntervalMinutes: 15,
          enabled: false,
        },
      },
      comic: {
        metadataProviders: {
          primarySource: 'comicvine',
          comicvine: false,
          apiKey: '',
          hideAdult: true,
        },
        mylar: {
          url: '',
          publicUrl: '',
          apiKey: '',
          pollIntervalMinutes: 15,
          enabled: false,
        },
      },
      mediaTypes: {
        book: true,
        audiobook: true,
        game: true,
        manga: true,
        comic: true,
        magazine: true,
      },
      requestNotices: {
        global: { message: '', severity: 'info' },
        movie: { message: '', severity: 'info' },
        tv: { message: '', severity: 'info' },
        book: { message: '', severity: 'info' },
        audiobook: { message: '', severity: 'info' },
        game: { message: '', severity: 'info' },
        manga: { message: '', severity: 'info' },
        comic: { message: '', severity: 'info' },
        magazine: { message: '', severity: 'info' },
      },
      oidc: {
        enabled: false,
        issuerUrl: '',
        clientId: '',
        clientSecret: '',
        displayName: 'OIDC',
        autoCreateUsers: true,
        groupClaimName: 'groups',
        defaultPermissions: Permission.REQUEST,
        groupMappings: [],
      },
      migrations: [],
    };
    if (initialSettings) {
      this.data = mergeSettings(this.data, initialSettings);
    }
  }

  get main(): MainSettings {
    return this.data.main;
  }

  set main(data: MainSettings) {
    this.data.main = mergeSettings(this.data.main, data);
  }

  get plex(): PlexSettings {
    return this.data.plex;
  }

  set plex(data: PlexSettings) {
    this.data.plex = mergeSettings(this.data.plex, data);
  }

  get jellyfin(): JellyfinSettings {
    return this.data.jellyfin;
  }

  set jellyfin(data: JellyfinSettings) {
    this.data.jellyfin = mergeSettings(this.data.jellyfin, data);
  }

  get tautulli(): TautulliSettings {
    return this.data.tautulli;
  }

  set tautulli(data: TautulliSettings) {
    this.data.tautulli = mergeSettings(this.data.tautulli, data);
  }

  get metadataSettings(): MetadataSettings {
    return this.data.metadataSettings;
  }

  set metadataSettings(data: MetadataSettings) {
    this.data.metadataSettings = mergeSettings(
      this.data.metadataSettings,
      data
    );
  }

  get radarr(): RadarrSettings[] {
    return this.data.radarr;
  }

  set radarr(data: RadarrSettings[]) {
    this.data.radarr = data;
  }

  get sonarr(): SonarrSettings[] {
    return this.data.sonarr;
  }

  set sonarr(data: SonarrSettings[]) {
    this.data.sonarr = data;
  }

  get bindery(): BinderySettings[] {
    return this.data.bindery;
  }

  set bindery(data: BinderySettings[]) {
    this.data.bindery = data;
  }

  get bookshelf(): BookshelfSettings[] {
    return this.data.bookshelf;
  }

  set bookshelf(data: BookshelfSettings[]) {
    this.data.bookshelf = data;
  }

  get livrarr(): LivrarrSettings[] {
    return this.data.livrarr;
  }

  set livrarr(data: LivrarrSettings[]) {
    this.data.livrarr = data;
  }

  get pressarr(): PressarrSettings[] {
    return this.data.pressarr ?? [];
  }

  set pressarr(data: PressarrSettings[]) {
    this.data.pressarr = data;
  }

  get romarr(): RomarrSettings[] {
    return this.data.romarr;
  }

  set romarr(data: RomarrSettings[]) {
    this.data.romarr = data;
  }

  get game(): GameSettings {
    return this.data.game;
  }

  set game(data: GameSettings) {
    this.data.game = mergeSettings(this.data.game, data);
  }

  get book(): BookSettings {
    return this.data.book;
  }

  set book(data: BookSettings) {
    this.data.book = mergeSettings(this.data.book, data);
  }

  get audiobook(): AudiobookSettings {
    return this.data.audiobook;
  }

  set audiobook(data: AudiobookSettings) {
    this.data.audiobook = mergeSettings(this.data.audiobook, data);
  }

  get manga(): MangaSettings {
    return this.data.manga;
  }

  set manga(data: MangaSettings) {
    this.data.manga = mergeSettings(this.data.manga, data);
  }

  get comic(): ComicSettings {
    return this.data.comic;
  }

  set comic(data: ComicSettings) {
    this.data.comic = mergeSettings(this.data.comic, data);
  }

  get mediaTypes(): MediaTypeToggles {
    // Default-true fallback so older settings.json files (written
    // before this block existed) still get the right shape on read.
    const stored = this.data.mediaTypes;
    return {
      book: stored?.book ?? true,
      audiobook: stored?.audiobook ?? true,
      game: stored?.game ?? true,
      manga: stored?.manga ?? true,
      comic: stored?.comic ?? true,
      magazine: stored?.magazine ?? true,
    };
  }

  set mediaTypes(data: MediaTypeToggles) {
    this.data.mediaTypes = { ...this.mediaTypes, ...data };
  }

  get requestNotices(): RequestNotices {
    const stored = this.data.requestNotices as
      | RequestNotices
      | Record<string, string>
      | undefined;
    // Soft-migrate: an earlier development build of this branch
    // wrote each field as a plain string. Coerce that shape into
    // the new {message, severity} block on read so downstream
    // consumers don't have to care.
    const coerce = (
      value: RequestNoticeEntry | string | undefined
    ): RequestNoticeEntry => {
      if (typeof value === 'string') {
        return { message: value, severity: 'info' };
      }
      if (value && typeof value === 'object') {
        const sev = value.severity;
        return {
          message: value.message ?? '',
          severity:
            sev === 'warning' || sev === 'error' || sev === 'info'
              ? sev
              : 'info',
        };
      }
      return { message: '', severity: 'info' };
    };
    return {
      global: coerce(stored?.global as RequestNoticeEntry | string | undefined),
      movie: coerce(stored?.movie as RequestNoticeEntry | string | undefined),
      tv: coerce(stored?.tv as RequestNoticeEntry | string | undefined),
      book: coerce(stored?.book as RequestNoticeEntry | string | undefined),
      audiobook: coerce(
        stored?.audiobook as RequestNoticeEntry | string | undefined
      ),
      game: coerce(stored?.game as RequestNoticeEntry | string | undefined),
      manga: coerce(stored?.manga as RequestNoticeEntry | string | undefined),
      comic: coerce(stored?.comic as RequestNoticeEntry | string | undefined),
      magazine: coerce(
        stored?.magazine as RequestNoticeEntry | string | undefined
      ),
    };
  }

  set requestNotices(data: RequestNotices) {
    this.data.requestNotices = { ...this.requestNotices, ...data };
  }

  get oidc(): OidcSettings {
    return this.data.oidc;
  }

  set oidc(data: OidcSettings) {
    this.data.oidc = mergeSettings(this.data.oidc, data);
  }

  get public(): PublicSettings {
    return this.data.public;
  }

  set public(data: PublicSettings) {
    this.data.public = mergeSettings(this.data.public, data);
  }

  get fullPublicSettings(): FullPublicSettings {
    // Master toggles short-circuit every per-type Enabled flag below.
    // When a media type is OFF in admin, its tab disappears from
    // search and request endpoints return 503 — without us having to
    // touch the per-provider config.
    const types = this.mediaTypes;
    return {
      ...this.data.public,
      applicationTitle: this.data.main.applicationTitle,
      applicationUrl: this.data.main.applicationUrl,
      hideAvailable: this.data.main.hideAvailable,
      hideBlocklisted: this.data.main.hideBlocklisted,
      localLogin: this.data.main.localLogin,
      mediaServerLogin: this.data.main.mediaServerLogin,
      jellyfinExternalHost: this.data.jellyfin.externalHostname,
      jellyfinForgotPasswordUrl: this.data.jellyfin.jellyfinForgotPasswordUrl,
      movie4kEnabled: this.data.radarr.some(
        (radarr) => radarr.is4k && radarr.isDefault
      ),
      series4kEnabled: this.data.sonarr.some(
        (sonarr) => sonarr.is4k && sonarr.isDefault
      ),
      discoverRegion: this.data.main.discoverRegion,
      streamingRegion: this.data.main.streamingRegion,
      originalLanguage: this.data.main.originalLanguage,
      mediaServerType: this.main.mediaServerType,
      partialRequestsEnabled: this.data.main.partialRequestsEnabled,
      enableSpecialEpisodes: this.data.main.enableSpecialEpisodes,
      cacheImages: this.data.main.cacheImages,
      vapidPublic: this.vapidPublic,
      enablePushRegistration: this.data.notifications.agents.webpush.enabled,
      locale: this.data.main.locale,
      emailEnabled: this.data.notifications.agents.email.enabled,
      userEmailRequired:
        this.data.notifications.agents.email.options.userEmailRequired,
      newPlexLogin: this.data.main.newPlexLogin,
      youtubeUrl: this.data.main.youtubeUrl,
      plexClientIdentifier: this.data.clientId,
      oidcEnabled:
        this.data.oidc.enabled &&
        !!this.data.oidc.issuerUrl &&
        !!this.data.oidc.clientId,
      oidcProviderName: this.data.oidc.displayName || 'OIDC',
      bookEnabled:
        types.book &&
        ((this.data.book.komga.enabled && !!this.data.book.komga.url) ||
          (this.data.book.grimmory.enabled && !!this.data.book.grimmory.url) ||
          (this.data.book.audiobookshelf.enabled &&
            !!this.data.book.audiobookshelf.url &&
            this.data.book.audiobookshelf.libraries.some(
              (l) => l.mediaType === 'book'
            )) ||
          this.data.bindery.some(
            (b) => b.mediaType === 'book' && !!b.hostname
          ) ||
          this.data.bookshelf.some(
            (b) => b.mediaType === 'book' && !!b.hostname
          )),
      audiobookEnabled:
        types.audiobook &&
        ((this.data.book.audiobookshelf.enabled &&
          !!this.data.book.audiobookshelf.url &&
          this.data.book.audiobookshelf.libraries.some(
            (l) => l.mediaType === 'audiobook'
          )) ||
          this.data.bindery.some(
            (b) => b.mediaType === 'audiobook' && !!b.hostname
          ) ||
          this.data.bookshelf.some(
            (b) => b.mediaType === 'audiobook' && !!b.hostname
          )),
      gameEnabled:
        types.game && this.data.game.romm.enabled && !!this.data.game.romm.url,
      mangaEnabled:
        // Manga search needs a metadata source; Suwayomi (download
        // manager) is optional. The tab is visible as long as the
        // user has AniList enabled in Settings → Metadata Providers
        // → Manga.
        types.manga && !!this.data.manga?.metadataProviders?.anilist,
      comicEnabled:
        // Comics search needs an API key (ComicVine is keyed); Mylar3
        // is optional. The tab is visible as long as ComicVine is
        // enabled AND has a key set.
        types.comic &&
        !!this.data.comic?.metadataProviders?.comicvine &&
        !!this.data.comic?.metadataProviders?.apiKey,
      magazineEnabled:
        // Magazines need a Pressarr instance OR Google Books
        // suggestions OR pure manual entry — none of which we
        // can detect cheaply here. Surface the tab whenever
        // ``magazine`` is checked in Settings → Media Types; the
        // discover page itself surfaces the right empty state
        // when neither suggestion nor dispatcher are wired.
        types.magazine,
      requestNotices: this.requestNotices,
    };
  }

  get notifications(): NotificationSettings {
    return this.data.notifications;
  }

  set notifications(data: NotificationSettings) {
    this.data.notifications = mergeSettings(this.data.notifications, data);
  }

  get jobs(): Record<JobId, JobSettings> {
    return this.data.jobs;
  }

  set jobs(data: Record<JobId, JobSettings>) {
    this.data.jobs = mergeSettings(this.data.jobs, data);
  }

  get network(): NetworkSettings {
    return this.data.network;
  }

  set network(data: NetworkSettings) {
    this.data.network = mergeSettings(this.data.network, data);
  }

  get migrations(): string[] {
    return this.data.migrations;
  }

  set migrations(data: string[]) {
    this.data.migrations = data;
  }

  get clientId(): string {
    return this.data.clientId;
  }

  get sessionSecret(): string {
    return this.data.sessionSecret!;
  }

  get vapidPublic(): string {
    return this.data.vapidPublic;
  }

  get vapidPrivate(): string {
    return this.data.vapidPrivate;
  }

  public async regenerateApiKey(): Promise<MainSettings> {
    this.main.apiKey = this.generateApiKey();
    await this.save();
    return this.main;
  }

  private generateApiKey(): string {
    if (process.env.API_KEY) {
      return process.env.API_KEY;
    } else {
      return Buffer.from(`${Date.now()}${randomUUID()}`).toString('base64');
    }
  }

  /**
   * Settings Load
   *
   * This will load settings from file unless an optional argument of the object structure
   * is passed in.
   * @param overrideSettings If passed in, will override all existing settings with these
   * @param raw If true, will load the settings without running migrations or generating missing
   * values
   */
  public async load(
    overrideSettings?: AllSettings,
    raw = false
  ): Promise<Settings> {
    if (overrideSettings) {
      this.data = overrideSettings;
      return this;
    }

    let data;
    try {
      data = await fs.readFile(SETTINGS_PATH, 'utf-8');
    } catch {
      await this.save();
    }

    let change = false;
    if (data && !raw) {
      const parsedJson = JSON.parse(data);
      const migratedData = await runMigrations(parsedJson, SETTINGS_PATH);
      const merged = mergeSettings(this.data, migratedData);

      if (JSON.stringify(merged) !== JSON.stringify(migratedData)) {
        change = true;
      }

      this.data = merged;
    } else if (data) {
      this.data = JSON.parse(data);
    }

    // generate keys and ids if it's missing
    if (!this.data.main.apiKey) {
      this.data.main.apiKey = this.generateApiKey();
      change = true;
    } else if (process.env.API_KEY) {
      if (this.main.apiKey != process.env.API_KEY) {
        this.main.apiKey = process.env.API_KEY;
      }
    }
    if (!this.data.clientId) {
      this.data.clientId = randomUUID();
      change = true;
    }
    if (!this.data.sessionSecret) {
      this.data.sessionSecret = randomBytes(32).toString('hex');
      change = true;
    }
    if (!this.data.vapidPublic || !this.data.vapidPrivate) {
      const vapidKeys = webpush.generateVAPIDKeys();
      this.data.vapidPrivate = vapidKeys.privateKey;
      this.data.vapidPublic = vapidKeys.publicKey;
      change = true;
    }
    if (change) {
      await this.save();
    }

    return this;
  }

  public async save(): Promise<void> {
    const savePromise = this.saveLock.then(async () => {
      const tmp = SETTINGS_PATH + '.tmp';
      await fs.writeFile(tmp, JSON.stringify(this.data, undefined, ' '));
      await fs.rename(tmp, SETTINGS_PATH);
    });

    this.saveLock = savePromise.catch(() => {
      // Keep the chain alive so future saves aren't blocked by past failures
    });

    return savePromise;
  }
}

let settings: Settings | undefined;

export const getSettings = (initialSettings?: AllSettings): Settings => {
  if (!settings) {
    settings = new Settings(initialSettings);
  }

  return settings;
};

export default Settings;
