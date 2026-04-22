import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import GameCard from '@app/components/GameCard';
import defineMessages from '@app/utils/defineMessages';
import { MediaStatus } from '@server/constants/media';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('pages.GameCollection', {
  title: 'Collection',
  notFound: 'Collection not found.',
  emptyMembers: 'No games in this collection yet.',
  gameCountFmt: '{count, plural, one {# game} other {# games}}',
  yearRangeFmt: '{min} – {max}',
  platformCountFmt:
    '{name} · {count, plural, one {# game} other {# games}}',
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
    id ? `/api/v1/game/collection/${encodeURIComponent(String(id))}` : null
  );

  // Group members sharing an igdbId into a single card with every
  // platform row they appear on — same UX as the main game search,
  // where cross-platform re-releases collapse into one entry.
  type Group =
    | {
        kind: 'igdb';
        igdbId: number;
        title: string;
        coverUrl?: string;
        releaseYear?: number;
        platforms: {
          id: number;
          name: string;
          mediaStatus?: MediaStatus;
          gameMediaId?: number;
        }[];
      }
    | {
        kind: 'orphan';
        rommId: number;
        title: string;
        coverUrl?: string;
        platformName?: string;
      };

  const { groups, platformBreakdown, yearMin, yearMax } = useMemo(() => {
    const byIgdb = new Map<
      number,
      Extract<Group, { kind: 'igdb' }>
    >();
    const orphans: Extract<Group, { kind: 'orphan' }>[] = [];
    const platformCounts = new Map<string, number>();
    let minYear: number | undefined;
    let maxYear: number | undefined;

    for (const m of data?.members ?? []) {
      if (m.platformName) {
        platformCounts.set(
          m.platformName,
          (platformCounts.get(m.platformName) ?? 0) + 1
        );
      }
      if (typeof m.releaseYear === 'number') {
        if (minYear === undefined || m.releaseYear < minYear)
          minYear = m.releaseYear;
        if (maxYear === undefined || m.releaseYear > maxYear)
          maxYear = m.releaseYear;
      }
      if (!m.igdbId) {
        orphans.push({
          kind: 'orphan',
          rommId: m.rommId,
          title: m.title,
          coverUrl: m.coverUrl,
          platformName: m.platformName,
        });
        continue;
      }
      const existing = byIgdb.get(m.igdbId);
      const platformEntry =
        m.platformIgdbId !== undefined && m.platformName
          ? {
              id: m.platformIgdbId,
              name: m.platformName,
              mediaStatus: m.mediaStatus ?? undefined,
              gameMediaId: m.gameMediaId ?? undefined,
            }
          : undefined;
      if (existing) {
        if (
          platformEntry &&
          !existing.platforms.some((p) => p.id === platformEntry.id)
        ) {
          existing.platforms.push(platformEntry);
        }
        // Keep the earliest releaseYear we've seen across platforms.
        if (
          typeof m.releaseYear === 'number' &&
          (existing.releaseYear === undefined ||
            m.releaseYear < existing.releaseYear)
        ) {
          existing.releaseYear = m.releaseYear;
        }
        // Prefer the first cover we saw; ROMM sometimes returns
        // platform-specific covers that are inconsistent in quality.
        if (!existing.coverUrl && m.coverUrl) {
          existing.coverUrl = m.coverUrl;
        }
      } else {
        byIgdb.set(m.igdbId, {
          kind: 'igdb',
          igdbId: m.igdbId,
          title: m.title,
          coverUrl: m.coverUrl,
          releaseYear: m.releaseYear,
          platforms: platformEntry ? [platformEntry] : [],
        });
      }
    }

    const allGroups: Group[] = [
      ...Array.from(byIgdb.values()),
      ...orphans,
    ];
    const breakdown = Array.from(platformCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      groups: allGroups,
      platformBreakdown: breakdown,
      yearMin: minYear,
      yearMax: maxYear,
    };
  }, [data?.members]);

  if (!data && !error) return <LoadingSpinner />;
  if (error || !data) {
    return (
      <div className="mt-16 text-center text-gray-400">
        {intl.formatMessage(messages.notFound)}
      </div>
    );
  }

  // Virtual collections ship ROMM-generated boilerplate descriptions
  // ("A collection of games in the Castlevania franchise") that add
  // nothing beyond what the title already says. Only show the
  // description for user-created collections.
  const showDescription =
    data.kind !== 'virtual' && !!data.description && data.description.length > 0;

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
          <div className="mt-1 text-sm text-gray-400">
            {intl.formatMessage(messages.gameCountFmt, {
              count: groups.length,
            })}
            {yearMin !== undefined && yearMax !== undefined && (
              <>
                <span className="mx-2 text-gray-600">·</span>
                {yearMin === yearMax
                  ? yearMin
                  : intl.formatMessage(messages.yearRangeFmt, {
                      min: yearMin,
                      max: yearMax,
                    })}
              </>
            )}
          </div>
          {platformBreakdown.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {platformBreakdown.map((p) => (
                <span
                  key={p.name}
                  className="inline-flex items-center rounded-full border border-gray-600 bg-gray-800/80 px-2 py-0.5 text-xs text-gray-200"
                >
                  {intl.formatMessage(messages.platformCountFmt, {
                    name: p.name,
                    count: p.count,
                  })}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {showDescription && (
        <div className="relative mt-4 text-gray-300">
          <p>{data.description}</p>
        </div>
      )}

      <div className="mt-8">
        {groups.length === 0 ? (
          <p className="py-8 text-center text-gray-400">
            {intl.formatMessage(messages.emptyMembers)}
          </p>
        ) : (
          <ul className="cards-vertical">
            {groups.map((g) => {
              if (g.kind === 'orphan') {
                return (
                  <li key={`romm-${g.rommId}`}>
                    <div className="group relative flex cursor-default flex-col overflow-hidden rounded-lg bg-gray-800 shadow-md ring-1 ring-gray-700">
                      <div className="relative aspect-[2/3] w-full overflow-hidden bg-gray-700">
                        {g.coverUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={g.coverUrl}
                            alt={g.title}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-3">
                        <h3 className="truncate text-sm font-semibold text-white">
                          {g.title}
                        </h3>
                        {g.platformName && (
                          <p className="truncate text-xs text-gray-400">
                            {g.platformName}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              }
              return (
                <li key={`igdb-${g.igdbId}`}>
                  <GameCard
                    igdbId={g.igdbId}
                    title={g.title}
                    platforms={g.platforms}
                    releaseYear={g.releaseYear}
                    coverUrl={g.coverUrl}
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
