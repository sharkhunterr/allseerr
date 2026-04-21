import Spinner from '@app/assets/spinner.svg';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import Tag from '@app/components/Common/Tag';
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
  available: 'Available',
  requested: 'Already Requested',
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
}

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const BookDetailPage: NextPage = () => {
  const router = useRouter();
  const intl = useIntl();
  const { addToast } = useToasts();
  const { currentSettings } = useSettings();
  const { bookId } = router.query;
  const [isRequesting, setIsRequesting] = useState(false);

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

  const description =
    typeof data.description === 'string'
      ? data.description
      : data.description?.value;

  const coverUrl =
    data.coverUrl ||
    (data.covers?.[0]
      ? `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg`
      : undefined);

  const isAvailable = data.mediaStatus === MediaStatus.AVAILABLE;
  const isRequested =
    data.mediaStatus !== null &&
    data.mediaStatus !== undefined &&
    data.mediaStatus !== MediaStatus.UNKNOWN;

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
  if (data.year) attributes.push(<span>{data.year}</span>);
  if (data.durationSeconds) {
    attributes.push(<span>{formatDuration(data.durationSeconds)}</span>);
  }
  if (data.language) {
    attributes.push(<span className="uppercase">{data.language}</span>);
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
            {isAvailable && (
              <span className="rounded-full bg-green-500 px-3 py-1 text-xs font-bold text-white">
                {intl.formatMessage(messages.available)}
              </span>
            )}
            {isRequested && !isAvailable && (
              <span className="rounded-full bg-yellow-500 px-3 py-1 text-xs font-bold text-white">
                {intl.formatMessage(messages.requested)}
              </span>
            )}
          </div>
          <h1 data-testid="media-title">
            {data.title}{' '}
            {data.year && (
              <span className="media-year">({data.year})</span>
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
          {isAvailable ? (
            data.libraryServerUrl ? (
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
            ) : (
              <span className="rounded bg-green-600 px-4 py-2 font-bold text-white">
                {intl.formatMessage(messages.available)}
              </span>
            )
          ) : isRequested ? (
            <span className="rounded bg-yellow-600 px-4 py-2 font-bold text-white">
              {intl.formatMessage(messages.requested)}
            </span>
          ) : canRequest ? (
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
          ) : null}
        </div>
      </div>
      <div className="media-overview">
        <div className="media-overview-left">
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
          {(data.authorName ||
            data.authorPhotoUrl ||
            data.authorBio) && (
            <div className="mb-6 overflow-hidden rounded-lg bg-gray-800 shadow-md ring-1 ring-gray-700">
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
                  <div className="text-base font-semibold text-white">
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
                </div>
              </div>
              {data.authorBio && (
                <p className="max-h-32 overflow-hidden px-4 pb-4 text-sm text-gray-300">
                  {/* OpenLibrary bios often have Markdown-like refs — strip
                      the common "*[From X][1]*" footer cruft and link refs. */}
                  {data.authorBio
                    .replace(/\s*\*\[From[^\]]*\]\[\d+\]\.?\*\s*$/s, '')
                    .replace(/\[\d+\]:\s*https?:\/\/[^\s]+/g, '')
                    .trim()}
                </p>
              )}
            </div>
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
            {data.publisher && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.publisher)}</span>
                <span className="media-fact-value">{data.publisher}</span>
              </div>
            )}
            {data.releaseDate && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.releaseDate)}</span>
                <span className="media-fact-value">
                  {intl.formatDate(data.releaseDate, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </div>
            )}
            {data.language && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.language)}</span>
                <span className="media-fact-value uppercase">
                  {data.language}
                </span>
              </div>
            )}
            {isAudiobook && data.key && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.asin)}</span>
                <span className="media-fact-value">{data.key}</span>
              </div>
            )}
            {data.isbn13 && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.isbn13)}</span>
                <span className="media-fact-value font-mono">
                  {data.isbn13}
                </span>
              </div>
            )}
            {data.isbn10 && !data.isbn13 && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.isbn10)}</span>
                <span className="media-fact-value font-mono">
                  {data.isbn10}
                </span>
              </div>
            )}
            {data.pageCount && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.pages)}</span>
                <span className="media-fact-value">{data.pageCount}</span>
              </div>
            )}
            {data.rating && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.rating)}</span>
                <span className="media-fact-value">
                  ★ {data.rating.toFixed(2)}
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
            {data.country && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.country)}</span>
                <span className="media-fact-value">
                  {countryFlag(data.country)}{' '}
                  <span className="uppercase">{data.country}</span>
                </span>
              </div>
            )}
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
