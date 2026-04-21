import Spinner from '@app/assets/spinner.svg';
import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import ConfirmButton from '@app/components/Common/ConfirmButton';
import RequestModal from '@app/components/RequestModal';
import StatusBadge from '@app/components/StatusBadge';
import useDeepLinks from '@app/hooks/useDeepLinks';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { refreshIntervalHelper } from '@app/utils/refreshIntervalHelper';
import {
  ArrowPathIcon,
  CheckIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { NonFunctionProperties } from '@server/interfaces/api/common';
import type { RequestResultsResponse } from '@server/interfaces/api/requestInterfaces';
import type { MovieDetails } from '@server/models/Movie';
import type { TvDetails } from '@server/models/Tv';
import axios from 'axios';
import Link from 'next/link';
import { useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { FormattedRelativeTime, useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.RequestList.RequestItem', {
  seasons: '{seasonCount, plural, one {Season} other {Seasons}}',
  failedretry: 'Something went wrong while retrying the request.',
  failedmodify: 'Something went wrong while modifying the request.',
  requested: 'Requested',
  requesteddate: 'Requested',
  modified: 'Modified',
  modifieduserdate: '{date} by {user}',
  mediaerror: '{mediaType} Not Found',
  editrequest: 'Edit Request',
  deleterequest: 'Delete Request',
  cancelRequest: 'Cancel Request',
  tmdbid: 'TMDB ID',
  tvdbid: 'TheTVDB ID',
  unknowntitle: 'Unknown Title',
  removearr: 'Remove from {arr}',
  profileName: 'Profile',
});

const isMovie = (movie: MovieDetails | TvDetails): movie is MovieDetails => {
  return (movie as MovieDetails).title !== undefined;
};

const isNonTmdbType = (type: string) =>
  type === MediaType.GAME ||
  type === MediaType.BOOK ||
  type === MediaType.AUDIOBOOK;

interface RequestItemErrorProps {
  requestData?: NonFunctionProperties<MediaRequest>;
  revalidateList: () => void;
}

const RequestItemError = ({
  requestData,
  revalidateList,
}: RequestItemErrorProps) => {
  const intl = useIntl();
  const { hasPermission } = useUser();

  const deleteRequest = async () => {
    await axios.delete(`/api/v1/request/${requestData?.id}`);
    revalidateList();
    mutate('/api/v1/request/count');
  };

  return (
    <div className="flex h-64 w-full flex-col justify-center rounded-xl bg-gray-800 py-4 text-gray-400 shadow-md ring-1 ring-red-500 xl:h-28 xl:flex-row">
      <div className="flex w-full flex-col justify-between overflow-hidden sm:flex-row">
        <div className="flex w-full flex-col justify-center overflow-hidden pl-4 pr-4 sm:pr-0 xl:w-7/12 2xl:w-2/3">
          <div className="flex text-lg font-bold text-white xl:text-xl">
            {intl.formatMessage(messages.mediaerror, {
              mediaType: intl.formatMessage(
                requestData?.type
                  ? requestData?.type === 'movie'
                    ? globalMessages.movie
                    : requestData?.type === 'book'
                      ? globalMessages.book
                      : requestData?.type === 'audiobook'
                        ? globalMessages.audiobook
                        : requestData?.type === 'game'
                          ? globalMessages.game
                          : globalMessages.tvshow
                  : globalMessages.request
              ),
            })}
          </div>
        </div>
      </div>
      <div className="z-10 mt-4 flex w-full flex-col justify-center pl-4 pr-4 xl:mt-0 xl:w-96 xl:items-end xl:pl-0">
        {hasPermission(Permission.MANAGE_REQUESTS) && (
          <Button
            className="w-full"
            buttonType="danger"
            onClick={() => deleteRequest()}
          >
            <TrashIcon />
            <span>{intl.formatMessage(messages.deleterequest)}</span>
          </Button>
        )}
      </div>
    </div>
  );
};

/**
 * Helper to get the status badge for non-TMDB request types.
 * Uses the same Badge colors as StatusBadge for consistency.
 */
const NonTmdbStatusBadge = ({ status }: { status: MediaRequestStatus }) => {
  const intl = useIntl();

  switch (status) {
    case MediaRequestStatus.PENDING:
      return (
        <Badge badgeType="warning">
          {intl.formatMessage(globalMessages.pending)}
        </Badge>
      );
    case MediaRequestStatus.APPROVED:
      return (
        <Badge badgeType="success">
          {intl.formatMessage(globalMessages.approved)}
        </Badge>
      );
    case MediaRequestStatus.DECLINED:
      return (
        <Badge badgeType="danger">
          {intl.formatMessage(globalMessages.declined)}
        </Badge>
      );
    case MediaRequestStatus.FAILED:
      return (
        <Badge badgeType="danger">
          {intl.formatMessage(globalMessages.failed)}
        </Badge>
      );
    default:
      return (
        <Badge badgeType="default">
          {intl.formatMessage(globalMessages.pending)}
        </Badge>
      );
  }
};

/**
 * Get display info for non-TMDB requests (game, book, audiobook).
 */
const getNonTmdbInfo = (
  request: RequestResultsResponse['results'][number]
): {
  title: string;
  coverUrl?: string;
  href: string;
  typeLabel: string;
  platform?: string;
} => {
  const gm = request.gameMedia as
    | {
        title: string;
        coverUrl?: string;
        igdbId: number;
        platformName?: string;
        status?: MediaStatus | null;
      }
    | undefined;
  const bm = request.bookMedia as
    | {
        title: string;
        coverUrl?: string;
        openLibraryId?: string;
        foreignBookId?: string;
        covers?: number[];
        status?: MediaStatus | null;
      }
    | undefined;
  const am = request.audiobookMedia as
    | {
        title: string;
        coverUrl?: string;
        openLibraryId?: string;
        foreignBookId?: string;
        covers?: number[];
        status?: MediaStatus | null;
      }
    | undefined;

  if (request.type === MediaType.GAME && gm) {
    return {
      title: gm.title,
      coverUrl: gm.coverUrl,
      href: `/game/${gm.igdbId}`,
      typeLabel: 'Game',
      platform: gm.platformName,
    };
  }
  if (request.type === MediaType.BOOK && bm) {
    const bookId = (bm.openLibraryId || bm.foreignBookId || '').replace(
      '/works/',
      ''
    );
    return {
      title: bm.title,
      coverUrl:
        bm.coverUrl ||
        (bm.covers?.[0]
          ? `https://covers.openlibrary.org/b/id/${bm.covers[0]}-L.jpg`
          : undefined),
      href: `/book/${bookId}`,
      typeLabel: 'Book',
    };
  }
  if (request.type === MediaType.AUDIOBOOK && am) {
    const bookId = (am.openLibraryId || am.foreignBookId || '').replace(
      '/works/',
      ''
    );
    return {
      title: am.title,
      coverUrl:
        am.coverUrl ||
        (am.covers?.[0]
          ? `https://covers.openlibrary.org/b/id/${am.covers[0]}-L.jpg`
          : undefined),
      href: `/book/${bookId}`,
      typeLabel: 'Audiobook',
    };
  }
  return { title: 'Unknown', href: '#', typeLabel: request.type };
};

interface RequestItemProps {
  request: RequestResultsResponse['results'][number];
  revalidateList: () => void;
}

const RequestItem = ({ request, revalidateList }: RequestItemProps) => {
  const { ref, inView } = useInView({
    triggerOnce: true,
  });
  const { addToast } = useToasts();
  const intl = useIntl();
  const { user, hasPermission } = useUser();
  const [showEditModal, setShowEditModal] = useState(false);
  const [updatingType, setUpdatingType] = useState<
    'approve' | 'decline' | null
  >(null);
  const [isRetrying, setRetrying] = useState(false);

  const isNonTmdb = isNonTmdbType(request.type);

  // For TMDB types, fetch movie/tv details
  const url = !isNonTmdb
    ? request.type === 'movie'
      ? `/api/v1/movie/${request.media.tmdbId}`
      : `/api/v1/tv/${request.media.tmdbId}`
    : null;

  const { data: title, error } = useSWR<MovieDetails | TvDetails>(
    inView && url ? url : null
  );

  const { data: requestData, mutate: revalidate } = useSWR<
    NonFunctionProperties<MediaRequest>
  >(`/api/v1/request/${request.id}`, {
    fallbackData: request,
    refreshInterval:
      !isNonTmdb && request.media
        ? refreshIntervalHelper(
            {
              downloadStatus: request.media.downloadStatus,
              downloadStatus4k: request.media.downloadStatus4k,
            },
            15000
          )
        : undefined,
  });

  const modifyRequest = async (type: 'approve' | 'decline') => {
    setUpdatingType(type);
    try {
      await axios.post(`/api/v1/request/${request.id}/${type}`);
      revalidate();
      mutate('/api/v1/request/count');
    } catch {
      addToast(intl.formatMessage(messages.failedmodify), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setUpdatingType(null);
    }
  };

  const deleteRequest = async () => {
    await axios.delete(`/api/v1/request/${request.id}`);
    revalidateList();
    mutate('/api/v1/request/count');
  };

  const deleteMediaFile = async () => {
    if (request.media) {
      await axios.delete(
        `/api/v1/media/${request.media.id}/file?is4k=${request.is4k}`
      );
      await axios.delete(`/api/v1/media/${request.media.id}`);
      revalidateList();
    }
  };

  const retryRequest = async () => {
    setRetrying(true);
    try {
      const result = await axios.post(`/api/v1/request/${request.id}/retry`);
      revalidate(result.data);
    } catch {
      addToast(intl.formatMessage(messages.failedretry), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setRetrying(false);
    }
  };

  const { mediaUrl: plexUrl, mediaUrl4k: plexUrl4k } = useDeepLinks({
    mediaUrl: requestData?.media?.mediaUrl,
    mediaUrl4k: requestData?.media?.mediaUrl4k,
    iOSPlexUrl: requestData?.media?.iOSPlexUrl,
    iOSPlexUrl4k: requestData?.media?.iOSPlexUrl4k,
  });

  // Shared action buttons renderer
  const renderActions = () => (
    <div className="z-10 mt-4 flex w-full flex-col justify-center space-y-2 pl-4 pr-4 xl:mt-0 xl:w-96 xl:items-end xl:pl-0">
      {requestData?.status === MediaRequestStatus.FAILED &&
        hasPermission(Permission.MANAGE_REQUESTS) && (
          <Button
            className="w-full"
            buttonType="primary"
            disabled={isRetrying}
            onClick={() => retryRequest()}
          >
            <ArrowPathIcon
              className={isRetrying ? 'animate-spin' : ''}
              style={{ animationDirection: 'reverse' }}
            />
            <span>
              {intl.formatMessage(
                isRetrying ? globalMessages.retrying : globalMessages.retry
              )}
            </span>
          </Button>
        )}
      {requestData?.status !== MediaRequestStatus.PENDING &&
        hasPermission(Permission.MANAGE_REQUESTS) && (
          <>
            <ConfirmButton
              onClick={() => deleteRequest()}
              confirmText={intl.formatMessage(globalMessages.areyousure)}
              className="w-full"
            >
              <TrashIcon />
              <span>{intl.formatMessage(messages.deleterequest)}</span>
            </ConfirmButton>
            {!isNonTmdb && request.canRemove && (
              <ConfirmButton
                onClick={() => deleteMediaFile()}
                confirmText={intl.formatMessage(globalMessages.areyousure)}
                className="w-full"
              >
                <TrashIcon />
                <span>
                  {intl.formatMessage(messages.removearr, {
                    arr: request.type === 'movie' ? 'Radarr' : 'Sonarr',
                  })}
                </span>
              </ConfirmButton>
            )}
          </>
        )}
      {requestData?.status === MediaRequestStatus.PENDING &&
        hasPermission(Permission.MANAGE_REQUESTS) && (
          <div className="flex w-full flex-row space-x-2">
            <span className="w-full">
              <Button
                className="w-full"
                buttonType="success"
                onClick={() => modifyRequest('approve')}
                disabled={updatingType !== null}
              >
                {updatingType === 'approve' ? <Spinner /> : <CheckIcon />}
                <span>{intl.formatMessage(globalMessages.approve)}</span>
              </Button>
            </span>
            <span className="w-full">
              <Button
                className="w-full"
                buttonType="danger"
                onClick={() => modifyRequest('decline')}
                disabled={updatingType !== null}
              >
                {updatingType === 'decline' ? <Spinner /> : <XMarkIcon />}
                <span>{intl.formatMessage(globalMessages.decline)}</span>
              </Button>
            </span>
          </div>
        )}
      {requestData?.status === MediaRequestStatus.PENDING &&
        !hasPermission(Permission.MANAGE_REQUESTS) &&
        requestData.requestedBy.id === user?.id && (
          <ConfirmButton
            onClick={() => deleteRequest()}
            confirmText={intl.formatMessage(globalMessages.areyousure)}
            className="w-full"
          >
            <XMarkIcon />
            <span>{intl.formatMessage(messages.cancelRequest)}</span>
          </ConfirmButton>
        )}
    </div>
  );

  // Shared request metadata renderer (requested by, modified by)
  const renderMetadata = () => (
    <>
      <div className="card-field">
        {hasPermission([Permission.MANAGE_REQUESTS, Permission.REQUEST_VIEW], {
          type: 'or',
        }) ? (
          <>
            <span className="card-field-name">
              {intl.formatMessage(messages.requested)}
            </span>
            <span className="flex truncate text-sm text-gray-300">
              {intl.formatMessage(messages.modifieduserdate, {
                date: (
                  <FormattedRelativeTime
                    value={Math.floor(
                      (new Date(
                        requestData?.createdAt ?? request.createdAt
                      ).getTime() -
                        Date.now()) /
                        1000
                    )}
                    updateIntervalInSeconds={1}
                    numeric="auto"
                  />
                ),
                user: (
                  <Link
                    href={`/users/${requestData?.requestedBy.id ?? request.requestedBy.id}`}
                    className="group flex items-center truncate"
                  >
                    <span className="avatar-sm ml-1.5">
                      <CachedImage
                        type="avatar"
                        src={
                          requestData?.requestedBy.avatar ??
                          request.requestedBy.avatar
                        }
                        alt=""
                        className="avatar-sm object-cover"
                        width={20}
                        height={20}
                      />
                    </span>
                    <span className="truncate text-sm font-semibold group-hover:text-white group-hover:underline">
                      {requestData?.requestedBy.displayName ??
                        request.requestedBy.displayName}
                    </span>
                  </Link>
                ),
              })}
            </span>
          </>
        ) : (
          <>
            <span className="card-field-name">
              {intl.formatMessage(messages.requesteddate)}
            </span>
            <span className="flex truncate text-sm text-gray-300">
              <FormattedRelativeTime
                value={Math.floor(
                  (new Date(
                    requestData?.createdAt ?? request.createdAt
                  ).getTime() -
                    Date.now()) /
                    1000
                )}
                updateIntervalInSeconds={1}
                numeric="auto"
              />
            </span>
          </>
        )}
      </div>
      {(requestData?.modifiedBy ?? request.modifiedBy) && (
        <div className="card-field">
          <span className="card-field-name">
            {intl.formatMessage(messages.modified)}
          </span>
          <span className="flex truncate text-sm text-gray-300">
            {intl.formatMessage(messages.modifieduserdate, {
              date: (
                <FormattedRelativeTime
                  value={Math.floor(
                    (new Date(
                      requestData?.updatedAt ?? request.updatedAt
                    ).getTime() -
                      Date.now()) /
                      1000
                  )}
                  updateIntervalInSeconds={1}
                  numeric="auto"
                />
              ),
              user: (
                <Link
                  href={`/users/${(requestData?.modifiedBy ?? request.modifiedBy)?.id}`}
                  className="group flex items-center truncate"
                >
                  <span className="avatar-sm ml-1.5">
                    <CachedImage
                      type="avatar"
                      src={
                        (requestData?.modifiedBy ?? request.modifiedBy)
                          ?.avatar ?? ''
                      }
                      alt=""
                      className="avatar-sm object-cover"
                      width={20}
                      height={20}
                    />
                  </span>
                  <span className="truncate text-sm font-semibold group-hover:text-white group-hover:underline">
                    {(requestData?.modifiedBy ?? request.modifiedBy)
                      ?.displayName ?? ''}
                  </span>
                </Link>
              ),
            })}
          </span>
        </div>
      )}
    </>
  );

  // === Non-TMDB request rendering (game, book, audiobook) ===
  if (isNonTmdb) {
    const info = getNonTmdbInfo(request);

    // Show the underlying media's status the same way movies/TV do — that
    // way an APPROVED request reads as "Requested" (blue, PROCESSING) and
    // an AVAILABLE one as green, matching the detail-page badge.
    // Fall back to the request status only for terminal request states
    // that aren't reflected on the media (DECLINED, FAILED).
    const mediaWithStatus = (request.bookMedia ??
      request.audiobookMedia ??
      request.gameMedia) as { status?: MediaStatus | null } | undefined;
    const mediaStatus = mediaWithStatus?.status ?? null;
    const requestStatus = requestData?.status ?? request.status;
    const showRequestBadge =
      requestStatus === MediaRequestStatus.DECLINED ||
      requestStatus === MediaRequestStatus.FAILED;

    return (
      <div
        ref={ref}
        className="relative flex w-full flex-col justify-between overflow-hidden rounded-xl bg-gray-800 py-2 text-gray-400 shadow-md ring-1 ring-gray-700 xl:h-28 xl:flex-row"
      >
        <div className="relative flex w-full flex-col justify-between overflow-hidden sm:flex-row">
          <div className="relative z-10 flex w-full items-center overflow-hidden pl-4 pr-4 sm:pr-0 xl:w-7/12 2xl:w-2/3">
            <Link
              href={info.href}
              className="relative h-auto w-12 flex-shrink-0 scale-100 transform-gpu overflow-hidden rounded-md transition duration-300 hover:scale-105"
            >
              {info.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={info.coverUrl}
                  alt={info.title}
                  className="h-full w-full object-cover"
                  style={{ width: '100%', height: 'auto' }}
                />
              ) : (
                <div className="flex aspect-[2/3] w-full items-center justify-center rounded-md bg-gray-700 text-lg">
                  {request.type === MediaType.GAME
                    ? '🎮'
                    : request.type === MediaType.AUDIOBOOK
                      ? '🎧'
                      : '📖'}
                </div>
              )}
            </Link>
            <div className="flex flex-col justify-center overflow-hidden pl-2 xl:pl-4">
              <div className="pt-0.5 text-xs font-medium text-white sm:pt-1">
                <span
                  className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold uppercase leading-5 text-white shadow ${
                    request.type === MediaType.GAME
                      ? 'border-teal-500 bg-teal-600/80'
                      : request.type === MediaType.AUDIOBOOK
                        ? 'border-pink-500 bg-pink-600/80'
                        : 'border-orange-500 bg-orange-600/80'
                  }`}
                >
                  {info.typeLabel}
                </span>
              </div>
              <Link
                href={info.href}
                className="mr-2 min-w-0 truncate text-lg font-bold text-white hover:underline xl:text-xl"
              >
                {info.title}
              </Link>
              {info.platform && (
                <div className="mt-1">
                  <Badge>{info.platform}</Badge>
                </div>
              )}
            </div>
          </div>
          <div className="z-10 ml-4 mt-4 flex w-full flex-col justify-center gap-1 overflow-hidden pr-4 text-sm sm:ml-2 sm:mt-0 xl:flex-1 xl:pr-0">
            <div className="card-field">
              <span className="card-field-name">
                {intl.formatMessage(globalMessages.status)}
              </span>
              {showRequestBadge ? (
                <NonTmdbStatusBadge status={requestStatus} />
              ) : (
                <StatusBadge
                  status={mediaStatus ?? undefined}
                  title={info.title}
                />
              )}
            </div>
            {renderMetadata()}
          </div>
        </div>
        {renderActions()}
      </div>
    );
  }

  // === TMDB request rendering (movie, tv) - original logic ===
  if (!title && !error) {
    return (
      <div
        className="h-64 w-full animate-pulse rounded-xl bg-gray-800 xl:h-28"
        ref={ref}
      />
    );
  }

  if (!title || !requestData) {
    return (
      <RequestItemError
        requestData={requestData}
        revalidateList={revalidateList}
      />
    );
  }

  return (
    <>
      <RequestModal
        show={showEditModal}
        tmdbId={request.media.tmdbId}
        type={request.type as 'movie' | 'tv' | 'collection'}
        is4k={request.is4k}
        editRequest={request}
        onCancel={() => setShowEditModal(false)}
        onComplete={() => {
          revalidateList();
          setShowEditModal(false);
        }}
      />
      <div className="relative flex w-full flex-col justify-between overflow-hidden rounded-xl bg-gray-800 py-2 text-gray-400 shadow-md ring-1 ring-gray-700 xl:h-28 xl:flex-row">
        {title.backdropPath && (
          <div className="absolute inset-0 z-0 w-full bg-cover bg-center xl:w-2/3">
            <CachedImage
              type="tmdb"
              src={`https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${title.backdropPath}`}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fill
            />
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(90deg, rgba(31, 41, 55, 0.47) 0%, rgba(31, 41, 55, 1) 100%)',
              }}
            />
          </div>
        )}
        <div className="relative flex w-full flex-col justify-between overflow-hidden sm:flex-row">
          <div className="relative z-10 flex w-full items-center overflow-hidden pl-4 pr-4 sm:pr-0 xl:w-7/12 2xl:w-2/3">
            <Link
              href={
                requestData.type === 'movie'
                  ? `/movie/${requestData.media.tmdbId}`
                  : `/tv/${requestData.media.tmdbId}`
              }
              className="relative h-auto w-12 flex-shrink-0 scale-100 transform-gpu overflow-hidden rounded-md transition duration-300 hover:scale-105"
            >
              <CachedImage
                type="tmdb"
                src={
                  title.posterPath
                    ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${title.posterPath}`
                    : '/images/seerr_poster_not_found.png'
                }
                alt=""
                sizes="100vw"
                style={{ width: '100%', height: 'auto', objectFit: 'cover' }}
                width={600}
                height={900}
              />
            </Link>
            <div className="flex flex-col justify-center overflow-hidden pl-2 xl:pl-4">
              <div className="flex items-center gap-2 pt-0.5 text-xs font-medium text-white sm:pt-1">
                <span
                  className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold uppercase leading-5 text-white shadow ${
                    requestData.type === 'movie'
                      ? 'border-blue-500 bg-blue-600/80'
                      : 'border-purple-500 bg-purple-600/80'
                  }`}
                >
                  {requestData.type === 'movie'
                    ? intl.formatMessage(globalMessages.movie)
                    : intl.formatMessage(globalMessages.tvshow)}
                </span>
                <span>
                  {(isMovie(title)
                    ? title.releaseDate
                    : title.firstAirDate
                  )?.slice(0, 4)}
                </span>
              </div>
              <Link
                href={
                  requestData.type === 'movie'
                    ? `/movie/${requestData.media.tmdbId}`
                    : `/tv/${requestData.media.tmdbId}`
                }
                className="mr-2 min-w-0 truncate text-lg font-bold text-white hover:underline xl:text-xl"
              >
                {isMovie(title) ? title.title : title.name}
              </Link>
              {!isMovie(title) && request.seasons.length > 0 && (
                <div className="card-field">
                  <span className="card-field-name">
                    {intl.formatMessage(messages.seasons, {
                      seasonCount: request.seasons.length,
                    })}
                  </span>
                  <div className="hide-scrollbar flex flex-nowrap overflow-x-scroll">
                    {request.seasons.map((season) => (
                      <span key={`season-${season.id}`} className="mr-2">
                        <Badge>
                          {season.seasonNumber === 0
                            ? intl.formatMessage(globalMessages.specials)
                            : season.seasonNumber}
                        </Badge>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="z-10 ml-4 mt-4 flex w-full flex-col justify-center gap-1 overflow-hidden pr-4 text-sm sm:ml-2 sm:mt-0 xl:flex-1 xl:pr-0">
            <div className="card-field">
              <span className="card-field-name">
                {intl.formatMessage(globalMessages.status)}
              </span>
              {requestData.status === MediaRequestStatus.DECLINED ? (
                <Badge badgeType="danger">
                  {intl.formatMessage(globalMessages.declined)}
                </Badge>
              ) : requestData.status === MediaRequestStatus.FAILED ? (
                <Badge
                  badgeType="danger"
                  href={`/${requestData.type}/${requestData.media.tmdbId}?manage=1`}
                >
                  {intl.formatMessage(globalMessages.failed)}
                </Badge>
              ) : requestData.status === MediaRequestStatus.PENDING &&
                requestData.media[requestData.is4k ? 'status4k' : 'status'] ===
                  MediaStatus.DELETED ? (
                <Badge
                  badgeType="warning"
                  href={`/${requestData.type}/${requestData.media.tmdbId}?manage=1`}
                >
                  {intl.formatMessage(globalMessages.pending)}
                </Badge>
              ) : (
                <StatusBadge
                  status={
                    requestData.media[requestData.is4k ? 'status4k' : 'status']
                  }
                  downloadItem={
                    requestData.media[
                      requestData.is4k ? 'downloadStatus4k' : 'downloadStatus'
                    ]
                  }
                  title={isMovie(title) ? title.title : title.name}
                  inProgress={
                    (
                      requestData.media[
                        requestData.is4k ? 'downloadStatus4k' : 'downloadStatus'
                      ] ?? []
                    ).length > 0
                  }
                  is4k={requestData.is4k}
                  tmdbId={requestData.media.tmdbId}
                  mediaType={requestData.type as 'movie' | 'tv'}
                  plexUrl={requestData.is4k ? plexUrl4k : plexUrl}
                  serviceUrl={
                    requestData.is4k
                      ? requestData.media.serviceUrl4k
                      : requestData.media.serviceUrl
                  }
                />
              )}
            </div>
            {renderMetadata()}
            {request.profileName && (
              <div className="card-field">
                <span className="card-field-name">
                  {intl.formatMessage(messages.profileName)}
                </span>
                <span className="flex truncate text-sm text-gray-300">
                  {request.profileName}
                </span>
              </div>
            )}
          </div>
        </div>
        {renderActions()}
      </div>
      {requestData.status === MediaRequestStatus.PENDING &&
        (hasPermission(Permission.MANAGE_REQUESTS) ||
          (requestData.requestedBy.id === user?.id &&
            (requestData.type === 'tv' ||
              hasPermission(Permission.REQUEST_ADVANCED)))) && (
          <span className="hidden w-full">
            <Button
              className="w-full"
              buttonType="primary"
              onClick={() => setShowEditModal(true)}
              disabled={updatingType !== null}
            >
              <PencilIcon />
              <span>{intl.formatMessage(messages.editrequest)}</span>
            </Button>
          </span>
        )}
    </>
  );
};

export default RequestItem;
