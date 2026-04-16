import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
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

  if (error) {
    return (
      <div className="mt-16 text-center text-gray-400">
        {intl.formatMessage(messages.notFound)}
      </div>
    );
  }

  if (!data) {
    return <LoadingSpinner />;
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
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PageTitle title={data.title} />
      <div className="flex flex-col gap-8 md:flex-row">
        <div className="w-full flex-shrink-0 md:w-64">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt={data.title}
              className="w-full rounded-lg shadow-lg"
            />
          ) : (
            <div className="flex aspect-[2/3] w-full items-center justify-center rounded-lg bg-gray-700">
              <BookOpenIcon className="h-16 w-16 text-gray-500" />
            </div>
          )}
        </div>

        <div className="flex-1">
          <h1 className="text-3xl font-bold text-white">{data.title}</h1>

          {description && (
            <p className="mt-4 leading-relaxed text-gray-300">
              {description}
            </p>
          )}

          {data.subjects && data.subjects.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {data.subjects.slice(0, 10).map((subject) => (
                <span
                  key={subject}
                  className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-300"
                >
                  {subject}
                </span>
              ))}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            {isAvailable ? (
              <>
                <span className="rounded bg-green-600 px-4 py-2 font-bold text-white">
                  {intl.formatMessage(messages.available)}
                </span>
                {data.libraryServerUrl && (
                  <a
                    href={data.libraryServerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-500"
                  >
                    Open in Library
                  </a>
                )}
              </>
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
      </div>
    </div>
  );
};

export default BookDetailPage;
