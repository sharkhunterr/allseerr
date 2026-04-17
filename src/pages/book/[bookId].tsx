import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import Tag from '@app/components/Common/Tag';
import defineMessages from '@app/utils/defineMessages';
import { BookOpenIcon } from '@heroicons/react/24/solid';
import { MediaStatus } from '@server/constants/media';
import axios from 'axios';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';

const messages = defineMessages('pages.BookDetail', {
  request: 'Request Book',
  requestAudiobook: 'Request Audiobook',
  available: 'Available',
  requested: 'Already Requested',
  requestSuccess: 'Book requested successfully!',
  requestFailed: 'Failed to request book.',
  notFound: 'Book not found.',
  overview: 'Overview',
  overviewunavailable: 'Overview unavailable.',
  subjects: 'Subjects',
  openInLibrary: 'Open in Library',
});

interface BookDetailData {
  key: string;
  title: string;
  description?: string | { value: string };
  covers?: number[];
  subjects?: string[];
  mediaStatus?: MediaStatus | null;
  bookMediaId?: number | null;
  libraryServerUrl?: string | null;
}

const BookDetailPage: NextPage = () => {
  const router = useRouter();
  const intl = useIntl();
  const { addToast } = useToasts();
  const { bookId } = router.query;
  const [isRequesting, setIsRequesting] = useState(false);

  const { data, error } = useSWR<BookDetailData>(
    bookId ? `/api/v1/book/${bookId}` : null
  );

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

  const description =
    typeof data.description === 'string'
      ? data.description
      : data.description?.value;

  const coverUrl = data.covers?.[0]
    ? `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg`
    : undefined;

  const isAvailable = data.mediaStatus === MediaStatus.AVAILABLE;
  const isRequested =
    data.mediaStatus !== null &&
    data.mediaStatus !== undefined &&
    data.mediaStatus !== MediaStatus.UNKNOWN;

  const handleRequest = async () => {
    setIsRequesting(true);
    try {
      await axios.post('/api/v1/book/request', {
        mediaType: 'book',
        openLibraryId: data.key,
        title: data.title,
        authorName: 'Unknown',
        foreignBookId: data.key,
      });
      addToast(intl.formatMessage(messages.requestSuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
    } catch {
      addToast(intl.formatMessage(messages.requestFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsRequesting(false);
    }
  };

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
              <BookOpenIcon className="h-16 w-16 text-gray-500" />
            </div>
          )}
        </div>
        <div className="media-title">
          <div className="media-status">
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
          <h1 data-testid="media-title">{data.title}</h1>
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
                  {intl.formatMessage(messages.openInLibrary)}
                </Button>
              </a>
            ) : null
          ) : isRequested ? (
            <span className="rounded bg-yellow-600 px-4 py-2 font-bold text-white">
              {intl.formatMessage(messages.requested)}
            </span>
          ) : (
            <Button
              buttonType="primary"
              disabled={isRequesting}
              onClick={handleRequest}
            >
              {isRequesting ? (
                <LoadingSpinner />
              ) : (
                intl.formatMessage(messages.request)
              )}
            </Button>
          )}
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
          <div className="media-facts">
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
