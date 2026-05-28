/**
 * Dashboard platform slider for IGDB game platforms.
 *
 * Mirrors GameGenreSlider chrome but indexes by platform instead
 * of genre. The platform name is rendered on top of a randomly-
 * picked game cover (per mount) from games tagged with that
 * platform — no hard-coded console images. Tile click links to
 * ``/discover/games?platform=<igdbPlatformId>`` and the discover
 * route accepts that param via the games zod schema.
 */

import GradientGenreCard from '@app/components/Discover/GradientGenreCard';
import GenreCard from '@app/components/GenreCard';
import Slider from '@app/components/Slider';
import defineMessages from '@app/utils/defineMessages';
import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import React from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Discover.GamePlatformSlider', {
  gameplatforms: 'Game Platforms',
});

interface GamePlatformItem {
  id: number;
  name: string;
  backdrops: string[];
}

const GamePlatformSlider = () => {
  const intl = useIntl();
  const { data, error } = useSWR<GamePlatformItem[]>(
    `/api/v1/discover/platformslider/games`,
    {
      refreshInterval: 0,
      revalidateOnFocus: false,
    }
  );

  if (!data && !error) {
    // Loading: render with placeholders.
  } else if (!data || data.length === 0) {
    return null;
  }

  return (
    <>
      <div className="slider-header">
        <Link href="/discover/games" className="slider-title">
          <span>{intl.formatMessage(messages.gameplatforms)}</span>
          <ArrowRightCircleIcon />
        </Link>
      </div>
      <Slider
        sliderKey="game-platforms"
        isLoading={!data && !error}
        isEmpty={false}
        items={(data ?? []).map((p) => (
          <GradientGenreCard
            key={`platform-game-${p.id}`}
            name={p.name}
            url={`/discover/games?platform=${p.id}`}
            backdrops={p.backdrops}
          />
        ))}
        placeholder={<GenreCard.Placeholder />}
        emptyMessage=""
      />
    </>
  );
};

export default React.memo(GamePlatformSlider);
