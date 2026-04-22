import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import GameCard from '@app/components/GameCard';
import defineMessages from '@app/utils/defineMessages';
import { MediaStatus } from '@server/constants/media';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('pages.GameCollection', {
  title: 'Collection',
  notFound: 'Collection not found.',
  emptyMembers: 'No games in this collection yet.',
  gameCountFmt: '{count, plural, one {# game} other {# games}}',
});

interface CollectionMember {
  igdbId?: number;
  rommId: number;
  title: string;
  platformName?: string;
  platformIgdbId?: number;
  coverUrl?: string;
  releaseYear?: number;
  mediaStatus?: MediaStatus | null;
  gameMediaId?: number | null;
  rommUrl?: string | null;
}

interface CollectionDetail {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  romCount?: number;
  kind?: 'user' | 'virtual';
  members: CollectionMember[];
}

const GameCollectionPage: NextPage = () => {
  const router = useRouter();
  const intl = useIntl();
  const { id } = router.query;

  const { data, error } = useSWR<CollectionDetail>(
    id ? `/api/v1/game/collection/${id}` : null
  );

  if (!data && !error) return <LoadingSpinner />;
  if (error || !data) {
    return (
      <div className="mt-16 text-center text-gray-400">
        {intl.formatMessage(messages.notFound)}
      </div>
    );
  }

  return (
    <div className="media-page" style={{ height: 493 }}>
      <PageTitle title={[data.name, intl.formatMessage(messages.title)]} />

      <div
        className="media-page-bg-image"
        style={{
          backgroundImage: data.coverUrl
            ? `linear-gradient(180deg, rgba(17, 24, 39, 0.47) 0%, rgba(17, 24, 39, 1) 100%), url(${data.coverUrl})`
            : undefined,
        }}
      />

      <div className="media-header">
        <div className="media-title">
          <div className="media-status">
            <span className="inline-flex items-center rounded-full border border-emerald-500 bg-emerald-600/80 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md">
              Game
            </span>
            <span className="ml-2 inline-flex items-center rounded-full border border-indigo-500 bg-indigo-600/80 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md">
              Collection
            </span>
          </div>
          <h1 className="mt-2">{data.name}</h1>
          <div className="text-sm text-gray-400">
            {intl.formatMessage(messages.gameCountFmt, {
              count: data.romCount ?? data.members.length,
            })}
          </div>
        </div>
      </div>

      {data.description && (
        <div className="relative mt-4 text-gray-300">
          <p>{data.description}</p>
        </div>
      )}

      <div className="mt-8">
        {data.members.length === 0 ? (
          <p className="py-8 text-center text-gray-400">
            {intl.formatMessage(messages.emptyMembers)}
          </p>
        ) : (
          <ul className="cards-vertical">
            {data.members.map((m) => {
              // Build a single synthetic platform entry from the ROMM
              // per-rom metadata so GameCard's existing rendering
              // (status dot + label) reuses cleanly. Rom id stays as
              // the stable React key.
              const platform =
                m.platformIgdbId !== undefined && m.platformName
                  ? [
                      {
                        id: m.platformIgdbId,
                        name: m.platformName,
                        mediaStatus: m.mediaStatus ?? undefined,
                        gameMediaId: m.gameMediaId ?? undefined,
                      },
                    ]
                  : [];
              if (!m.igdbId) {
                // No IGDB mapping → we can't link to a detail page.
                // Render a minimal non-clickable card so the member
                // still shows up.
                return (
                  <li key={`romm-${m.rommId}`}>
                    <div className="group relative flex cursor-default flex-col overflow-hidden rounded-lg bg-gray-800 shadow-md ring-1 ring-gray-700">
                      <div className="relative aspect-[2/3] w-full overflow-hidden bg-gray-700">
                        {m.coverUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.coverUrl}
                            alt={m.title}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-3">
                        <h3 className="truncate text-sm font-semibold text-white">
                          {m.title}
                        </h3>
                        {m.platformName && (
                          <p className="truncate text-xs text-gray-400">
                            {m.platformName}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              }
              return (
                <li key={`igdb-${m.igdbId}-${m.platformIgdbId ?? 0}`}>
                  <GameCard
                    igdbId={m.igdbId}
                    title={m.title}
                    platforms={platform}
                    releaseYear={m.releaseYear}
                    coverUrl={m.coverUrl}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="extra-bottom-space relative" />
    </div>
  );
};

export default GameCollectionPage;
