import Spinner from '@app/assets/spinner.svg';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import Tag from '@app/components/Common/Tag';
import StatusBadge from '@app/components/StatusBadge';
import useSettings from '@app/hooks/useSettings';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  BookOpenIcon,
  MusicalNoteIcon,
  PlayIcon,
} from '@heroicons/react/24/solid';
import { MediaStatus, MediaType } from '@server/constants/media';
import axios from 'axios';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';

const messages = defineMessages('pages.BookDetail', {
  requestBook: 'Request Book',
  requestAudiobook: 'Request Audiobook',
  requestSuccess: 'Request submitted successfully!',
  requestFailed: 'Failed to submit request.',
  notFound: 'Not found.',
  overview: 'Overview',
  overviewunavailable: 'Overview unavailable.',
  subjects: 'Subjects',
  openInLibrary: 'Open in Library',
  playOnAudiobookshelf: 'Play on Audiobookshelf',
  author: 'Author',
  narrator: 'Narrator',
  duration: 'Duration',
  publisher: 'Publisher',
  releaseDate: 'Release Date',
  language: 'Language',
  asin: 'ASIN',
  isbn13: 'ISBN-13',
  isbn10: 'ISBN-10',
  pages: 'Pages',
  partOfSeries: 'Part of',
  seriesBook: 'Book {position} of {total}',
  viewSeries: 'View all books in this series',
  rating: 'Rating',
  readers: 'Readers',
  readersCountFmt: '{count} saved · {read} read',
  country: 'Country',
  moods: 'Moods',
  contentWarnings: 'Content Warnings',
  characters: 'Characters',
  aboutAuthor: 'About the author',
  authorLivedFmt: '{birth}{dash}{death}',
  edition: 'Edition',
  editionOriginal: 'Original edition',
  otherLanguages: 'Other languages',
  editionLangUnknown: 'Unknown language',
});

// Convert an ISO-3166-1 alpha-2 country code to its flag emoji
// (regional indicator symbols, each = "🇦" + (letter - A) offset).
const countryFlag = (code: string): string => {
  if (!/^[A-Z]{2}$/i.test(code)) return '';
  return code
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join('');
};

interface Edition {
  id: number;
  title?: string;
  subtitle?: string;
  isbn13?: string;
  isbn10?: string;
  year?: number;
  releaseDate?: string;
  pageCount?: number;
  format?: string;
  coverUrl?: string;
  publisher?: string;
  country?: string;
  language?: string;
}

interface BookDetailData {
  key: string;
  title: string;
  subtitle?: string;
  description?: string | { value: string };
  covers?: number[];
  coverUrl?: string;
  subjects?: string[];
  authorName?: string;
  authorKey?: string;
  authorPhotoUrl?: string;
  authorBio?: string;
  authorBirthDate?: string;
  authorDeathDate?: string;
  narratorName?: string;
  year?: number;
  publisher?: string;
  durationSeconds?: number;
  language?: string;
  releaseDate?: string;
  isbn13?: string;
  isbn10?: string;
  pageCount?: number;
  country?: string;
  series?: {
    key: string;
    name: string;
    position?: string;
    seedCount: number;
    linkable?: boolean;
  }[];
  rating?: number;
  ratingsCount?: number;
  readersCount?: number;
  readCount?: number;
  moods?: string[];
  contentWarnings?: string[];
  characters?: string[];
  mediaType?: MediaType;
  mediaStatus?: MediaStatus | null;
  bookMediaId?: number | null;
  libraryServerUrl?: string | null;
  editions?: Edition[];
  preferredLanguage?: string;
}

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

/**
 * Groups editions by language for the <select>. The configured
 * preferred language bubbles to the top (its own optgroup), then a
 * disabled separator option, then one optgroup per other language
 * with the label "Other languages — <name>". Every group is sorted
 * by year descending so the most recent printing appears first.
 */
interface EditionSelectProps {
  editions: Edition[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  preferredLanguage?: string;
  localeCode: string;
  unknownLanguageLabel: string;
  otherLanguagesLabel: string;
  originalLabel: string;
}

const EditionSelect = ({
  editions,
  selectedId,
  onSelect,
  preferredLanguage,
  localeCode,
  unknownLanguageLabel,
  otherLanguagesLabel,
  originalLabel,
}: EditionSelectProps) => {
  // Resolve a human-readable language name from a 2-letter code using
  // the browser's own Intl.DisplayNames — falls back to the
  // uppercase code when unavailable / unknown.
  const langName = (code?: string): string => {
    if (!code) return unknownLanguageLabel;
    try {
      const dn = new Intl.DisplayNames([localeCode, 'en'], {
        type: 'language',
      });
      return dn.of(code) ?? code.toUpperCase();
    } catch {
      return code.toUpperCase();
    }
  };

  const editionLabel = (ed: Edition): string => {
    const bits: string[] = [];
    if (ed.year) bits.push(String(ed.year));
    if (ed.format) bits.push(ed.format);
    if (ed.publisher) bits.push(ed.publisher);
    return bits.length > 0
      ? bits.join(' · ')
      : ed.title ?? originalLabel;
  };

  const sortByYearDesc = (a: Edition, b: Edition) =>
    (b.year ?? 0) - (a.year ?? 0);

  // Bucket editions by language (lowercased 2-letter code, or '' for unknown).
  const byLang = new Map<string, Edition[]>();
  for (const ed of editions) {
    const key = ed.language?.toLowerCase() ?? '';
    const bucket = byLang.get(key) ?? [];
    bucket.push(ed);
    byLang.set(key, bucket);
  }
  for (const bucket of byLang.values()) bucket.sort(sortByYearDesc);

  const prefKey = preferredLanguage?.toLowerCase();
  const preferredBucket =
    prefKey && byLang.has(prefKey) ? byLang.get(prefKey)! : [];
  if (prefKey) byLang.delete(prefKey);

  // Order remaining language groups by the newest edition's year desc
  // so the reader sees the most active translations first. Unknown-
  // language bucket falls to the very end.
  const otherBuckets = [...byLang.entries()]
    .filter(([, arr]) => arr.length > 0)
    .sort(([langA, arrA], [langB, arrB]) => {
      if (!langA) return 1;
      if (!langB) return -1;
      return (arrB[0]?.year ?? 0) - (arrA[0]?.year ?? 0);
    });

  return (
    <select
      id="edition-select"
      value={selectedId ?? ''}
      onChange={(e) => onSelect(Number(e.target.value) || null)}
      className="rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
    >
      {preferredBucket.length > 0 && (
        <optgroup label={langName(prefKey)}>
          {preferredBucket.map((ed) => (
            <option key={ed.id} value={ed.id}>
              {editionLabel(ed)}
            </option>
          ))}
        </optgroup>
      )}
      {preferredBucket.length > 0 && otherBuckets.length > 0 && (
        // Separator — a disabled option renders with dimmed text in
        // native <select> across all major browsers.
        <option disabled>────────────────────────</option>
      )}
      {otherBuckets.map(([lang, group]) => (
        <optgroup
          key={lang || 'unknown'}
          label={
            preferredBucket.length > 0
              ? `${otherLanguagesLabel} — ${langName(lang)}`
              : langName(lang)
          }
        >
          {group.map((ed) => (
            <option key={ed.id} value={ed.id}>
              {editionLabel(ed)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
};

const BookDetailPage: NextPage = () => {
  const router = useRouter();
  const intl = useIntl();
  const { addToast } = useToasts();
  const { currentSettings } = useSettings();
  const { bookId } = router.query;
  const [isRequesting, setIsRequesting] = useState(false);
  const [selectedEditionId, setSelectedEditionId] = useState<number | null>(
    null
  );

  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<BookDetailData>(bookId ? `/api/v1/book/${bookId}` : null);

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (error || !data) {
    return (
      <div className="mt-16 text-center text-gray-400">
        {intl.formatMessage(messages.notFound)}
      </div>
    );
  }

  const isAudiobook = data.mediaType === MediaType.AUDIOBOOK;
  const canRequest = isAudiobook
    ? currentSettings.audiobookEnabled
    : currentSettings.bookEnabled;

  const editions = data.editions ?? [];
  // Default edition: most recent in the user's preferred language if
  // we have one; otherwise most recent overall. Beats "editions[0]"
  // which was the earliest release (often out-of-stock originals).
  const getDefaultEdition = (): Edition | undefined => {
    if (editions.length === 0) return undefined;
    const prefKey = data.preferredLanguage?.toLowerCase();
    if (prefKey) {
      const prefs = editions
        .filter((e) => e.language?.toLowerCase() === prefKey)
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
      if (prefs.length > 0) return prefs[0];
    }
    return [...editions].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];
  };
  const selectedEdition =
    editions.find((e) => e.id === selectedEditionId) ??
    getDefaultEdition();

  // Edition-aware overrides. Book-level fields are the default, but
  // any field the selected edition supplies wins — lets the user flip
  // between hardcover / paperback / translations and see the cover,
  // ISBN, publisher, page count, release year update live. The
  // description stays at the book level (Hardcover doesn't store it
  // per edition).
  const description =
    typeof data.description === 'string'
      ? data.description
      : data.description?.value;

  const coverUrl =
    selectedEdition?.coverUrl ||
    data.coverUrl ||
    (data.covers?.[0]
      ? `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg`
      : undefined);

  const displayedIsbn13 = selectedEdition?.isbn13 ?? data.isbn13;
  const displayedIsbn10 = selectedEdition?.isbn10 ?? data.isbn10;
  const displayedPageCount = selectedEdition?.pageCount ?? data.pageCount;
  const displayedPublisher = selectedEdition?.publisher ?? data.publisher;
  const displayedYear = selectedEdition?.year ?? data.year;
  const displayedReleaseDate =
    selectedEdition?.releaseDate ?? data.releaseDate;
  const displayedLanguage = selectedEdition?.language ?? data.language;

  const isAvailable = data.mediaStatus === MediaStatus.AVAILABLE;
  const showRequestButton =
    !data.mediaStatus ||
    data.mediaStatus === MediaStatus.UNKNOWN ||
    data.mediaStatus === MediaStatus.DELETED;

  const handleRequest = async () => {
    setIsRequesting(true);
    try {
      await axios.post('/api/v1/book/request', {
        mediaType: isAudiobook ? MediaType.AUDIOBOOK : MediaType.BOOK,
        openLibraryId: data.key,
        title: data.title,
        authorName: data.authorName ?? 'Unknown',
        foreignBookId: data.key,
        foreignAuthorId: data.authorKey,
        isbn13: data.isbn13,
        isbn10: data.isbn10,
        narratorName: data.narratorName,
        asin: isAudiobook ? data.key : undefined,
        coverUrl,
        year: data.year,
        publisher: data.publisher,
      });
      addToast(intl.formatMessage(messages.requestSuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
      revalidate();
    } catch {
      addToast(intl.formatMessage(messages.requestFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsRequesting(false);
    }
  };

  const attributes: React.ReactNode[] = [];
  if (displayedYear) attributes.push(<span>{displayedYear}</span>);
  if (data.durationSeconds) {
    attributes.push(<span>{formatDuration(data.durationSeconds)}</span>);
  }
  if (displayedLanguage) {
    attributes.push(<span className="uppercase">{displayedLanguage}</span>);
  }

  return (
    <div className="media-page" style={{ height: 493 }}>
      <PageTitle title={data.title} />
      <div className="media-header">
        <div className="media-poster">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt={data.title}
              style={{ width: '100%', height: 'auto' }}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg bg-gray-700">
              {isAudiobook ? (
                <MusicalNoteIcon className="h-16 w-16 text-gray-500" />
              ) : (
                <BookOpenIcon className="h-16 w-16 text-gray-500" />
              )}
            </div>
          )}
        </div>
        <div className="media-title">
          <div className="media-status">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold text-white ${
                isAudiobook ? 'bg-purple-600' : 'bg-indigo-600'
              }`}
            >
              {isAudiobook ? 'Audiobook' : 'Book'}
            </span>
            <StatusBadge
              status={data.mediaStatus ?? undefined}
              title={data.title}
            />
          </div>
          <h1 data-testid="media-title">
            {data.title}{' '}
            {displayedYear && (
              <span className="media-year">({displayedYear})</span>
            )}
          </h1>
          {data.subtitle && (
            <p className="text-lg text-gray-400">{data.subtitle}</p>
          )}
          {data.authorName && (
            <p className="text-sm text-gray-300">
              {intl.formatMessage(messages.author)}: {data.authorName}
            </p>
          )}
          {data.narratorName && (
            <p className="text-sm text-indigo-400">
              {intl.formatMessage(messages.narrator)}: {data.narratorName}
            </p>
          )}
          {attributes.length > 0 && (
            <span className="media-attributes">
              {attributes
                .map((t, k) => <span key={k}>{t}</span>)
                .reduce((prev, curr) => (
                  <>
                    {prev}
                    <span>|</span>
                    {curr}
                  </>
                ))}
            </span>
          )}
        </div>
        <div className="media-actions">
          {isAvailable && data.libraryServerUrl && (
            <a
              href={data.libraryServerUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button buttonType="primary">
                <PlayIcon />
                <span>
                  {intl.formatMessage(
                    isAudiobook
                      ? messages.playOnAudiobookshelf
                      : messages.openInLibrary
                  )}
                </span>
              </Button>
            </a>
          )}
          {showRequestButton && canRequest && (
            <Button
              buttonType="primary"
              disabled={isRequesting}
              onClick={handleRequest}
            >
              {isRequesting ? (
                <Spinner />
              ) : (
                intl.formatMessage(
                  isAudiobook ? messages.requestAudiobook : messages.requestBook
                )
              )}
            </Button>
          )}
        </div>
      </div>
      <div className="media-overview">
        <div className="media-overview-left">
          {editions.length > 1 && (
            <div className="mb-4 flex flex-col gap-1">
              <label
                htmlFor="edition-select"
                className="text-xs uppercase tracking-wide text-gray-400"
              >
                {intl.formatMessage(messages.edition)}
              </label>
              <EditionSelect
                editions={editions}
                selectedId={selectedEdition?.id ?? null}
                onSelect={setSelectedEditionId}
                preferredLanguage={data.preferredLanguage}
                unknownLanguageLabel={intl.formatMessage(
                  messages.editionLangUnknown
                )}
                otherLanguagesLabel={intl.formatMessage(
                  messages.otherLanguages
                )}
                originalLabel={intl.formatMessage(messages.editionOriginal)}
                localeCode={intl.locale}
              />
            </div>
          )}
          <h2>{intl.formatMessage(messages.overview)}</h2>
          <p>
            {description || intl.formatMessage(messages.overviewunavailable)}
          </p>
          {data.subjects && data.subjects.length > 0 && (
            <div className="mt-6">
              {data.subjects.slice(0, 15).map((subject) => (
                <span key={subject} className="mb-2 mr-2 inline-flex last:mr-0">
                  <Tag>{subject}</Tag>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="media-overview-right">
          {(data.authorName || data.authorPhotoUrl || data.authorBio) && (
            <button
              type="button"
              disabled={!data.authorKey}
              onClick={() =>
                data.authorKey && router.push(`/book/author/${data.authorKey}`)
              }
              className="group mb-6 block w-full cursor-pointer overflow-hidden rounded-lg bg-gray-800 text-left shadow-md ring-1 ring-gray-700 transition hover:ring-indigo-400 disabled:cursor-default disabled:hover:ring-gray-700"
            >
              <div className="flex items-start gap-4 p-4">
                <div className="flex-shrink-0">
                  {data.authorPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.authorPhotoUrl}
                      alt={data.authorName ?? ''}
                      className="h-20 w-20 rounded-full object-cover ring-2 ring-indigo-500/40"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-700 text-2xl font-semibold text-gray-300">
                      {data.authorName?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs uppercase tracking-wide text-gray-400">
                    {intl.formatMessage(messages.aboutAuthor)}
                  </div>
                  <div className="text-base font-semibold text-white group-hover:text-indigo-300">
                    {data.authorName}
                  </div>
                  {(data.authorBirthDate || data.authorDeathDate) && (
                    <div className="text-xs text-gray-400">
                      {intl.formatMessage(messages.authorLivedFmt, {
                        birth: data.authorBirthDate ?? '?',
                        dash: data.authorDeathDate ? ' – ' : '',
                        death: data.authorDeathDate ?? '',
                      })}
                    </div>
                  )}
                  {data.country && (
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400">
                      <span className="text-base leading-none">
                        {countryFlag(data.country)}
                      </span>
                      <span className="uppercase">{data.country}</span>
                    </div>
                  )}
                </div>
              </div>
              {data.authorBio && (
                <p className="max-h-32 overflow-hidden px-4 pb-4 text-sm text-gray-300">
                  {data.authorBio}
                </p>
              )}
            </button>
          )}
          {data.series && data.series.length > 0 && (
            <>
              {data.series.map((s) => {
                const isLinkable = s.linkable !== false;
                const card = (
                  <div className="group relative z-0 mb-6 scale-100 transform-gpu cursor-pointer overflow-hidden rounded-lg bg-gray-800 bg-cover bg-center shadow-md ring-1 ring-gray-700 transition duration-300 hover:scale-105 hover:ring-gray-500">
                    {coverUrl && (
                      <div className="absolute inset-0 z-0">
                        <img
                          // eslint-disable-next-line @next/next/no-img-element
                          src={coverUrl}
                          alt=""
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                        />
                        <div
                          className="absolute inset-0"
                          style={{
                            backgroundImage:
                              'linear-gradient(180deg, rgba(31, 41, 55, 0.47) 0%, rgba(31, 41, 55, 0.80) 100%)',
                          }}
                        />
                      </div>
                    )}
                    <div className="relative z-10 flex h-full items-center justify-between p-4 text-gray-200 transition duration-300 group-hover:text-white">
                      <div>
                        <div>{s.name}</div>
                        {s.position && (
                          <div className="text-xs text-gray-400">
                            {s.seedCount > 0
                              ? intl.formatMessage(messages.seriesBook, {
                                  position: s.position,
                                  total: s.seedCount,
                                })
                              : `#${s.position}`}
                          </div>
                        )}
                      </div>
                      {isLinkable && (
                        <Button buttonSize="sm">
                          {intl.formatMessage(globalMessages.view)}
                        </Button>
                      )}
                    </div>
                  </div>
                );
                return isLinkable ? (
                  <button
                    key={s.key}
                    type="button"
                    className="block w-full text-left"
                    onClick={() => router.push(`/book/series/${s.key}`)}
                  >
                    {card}
                  </button>
                ) : (
                  <div key={s.key}>{card}</div>
                );
              })}
            </>
          )}
          <div className="media-facts">
            {data.authorName && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.author)}</span>
                <span className="media-fact-value">{data.authorName}</span>
              </div>
            )}
            {data.narratorName && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.narrator)}</span>
                <span className="media-fact-value">{data.narratorName}</span>
              </div>
            )}
            {data.durationSeconds && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.duration)}</span>
                <span className="media-fact-value">
                  {formatDuration(data.durationSeconds)}
                </span>
              </div>
            )}
            {displayedPublisher && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.publisher)}</span>
                <span className="media-fact-value">{displayedPublisher}</span>
              </div>
            )}
            {displayedReleaseDate && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.releaseDate)}</span>
                <span className="media-fact-value">
                  {intl.formatDate(displayedReleaseDate, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </div>
            )}
            {displayedLanguage && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.language)}</span>
                <span className="media-fact-value uppercase">
                  {displayedLanguage}
                </span>
              </div>
            )}
            {isAudiobook && data.key && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.asin)}</span>
                <span className="media-fact-value">{data.key}</span>
              </div>
            )}
            {displayedIsbn13 && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.isbn13)}</span>
                <span className="media-fact-value font-mono">
                  {displayedIsbn13}
                </span>
              </div>
            )}
            {displayedIsbn10 && !displayedIsbn13 && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.isbn10)}</span>
                <span className="media-fact-value font-mono">
                  {displayedIsbn10}
                </span>
              </div>
            )}
            {displayedPageCount && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.pages)}</span>
                <span className="media-fact-value">{displayedPageCount}</span>
              </div>
            )}
            {data.rating && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.rating)}</span>
                <span className="media-fact-value">
                  ★ {data.rating.toFixed(2)}
                  <span className="text-gray-400"> / 5</span>
                  {data.ratingsCount ? (
                    <span className="ml-2 text-xs text-gray-400">
                      ({data.ratingsCount.toLocaleString()})
                    </span>
                  ) : null}
                </span>
              </div>
            )}
            {data.readersCount !== undefined && data.readersCount > 0 && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.readers)}</span>
                <span className="media-fact-value">
                  {intl.formatMessage(messages.readersCountFmt, {
                    count: data.readersCount.toLocaleString(),
                    read: (data.readCount ?? 0).toLocaleString(),
                  })}
                </span>
              </div>
            )}
            {/* Country moved to the author card (right column) as a
                flag + code chip — it's a property of the original work
                / author, not of the edition the user picks. */}
            {data.moods && data.moods.length > 0 && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.moods)}</span>
                <span className="media-fact-value flex flex-wrap gap-1">
                  {data.moods.map((m) => (
                    <span
                      key={`mood-${m}`}
                      className="rounded-full bg-pink-900/40 px-2 py-0.5 text-xs text-pink-200"
                    >
                      {m}
                    </span>
                  ))}
                </span>
              </div>
            )}
            {data.contentWarnings && data.contentWarnings.length > 0 && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.contentWarnings)}</span>
                <span className="media-fact-value flex flex-wrap gap-1">
                  {data.contentWarnings.map((w) => (
                    <span
                      key={`cw-${w}`}
                      className="rounded-full bg-red-900/40 px-2 py-0.5 text-xs text-red-200"
                    >
                      {w}
                    </span>
                  ))}
                </span>
              </div>
            )}
            {data.characters && data.characters.length > 0 && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.characters)}</span>
                <span className="media-fact-value">
                  {data.characters.join(', ')}
                </span>
              </div>
            )}
            {data.subjects && data.subjects.length > 0 && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.subjects)}</span>
                <span className="media-fact-value">
                  {data.subjects.slice(0, 5).map((s) => (
                    <span key={s} className="block">
                      {s}
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="extra-bottom-space relative" />
    </div>
  );
};

export default BookDetailPage;
