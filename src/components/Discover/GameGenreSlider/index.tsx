/**
 * Dashboard genre slider for IGDB game genres.
 *
 * Mirrors MovieGenreSlider/TvGenreSlider in chrome and behaviour
 * (slider header → "More" link, SWR fetch, GenreCard placeholder
 * during load). The visual difference is the tile: IGDB has no
 * backdrop image per genre, so we use ``GradientGenreCard`` —
 * a coloured chip with the genre name on top — instead of
 * ``GenreCard``'s TMDB-backdrop+duotone treatment.
 *
 * The slider self-hides when the upstream returns zero genres
 * (e.g. operator has games enabled but the IGDB client lookup
 * failed). ``isEmpty`` on Slider would still render the row
 * shell; passing an empty items array with the gate below
 * removes the header too.
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

const messages = defineMessages('components.Discover.GameGenreSlider', {
  gamegenres: 'Game Genres',
});

interface GameGenreItem {
  id: number;
  name: string;
  backdrops: string[];
}

const GameGenreSlider = () => {
  const intl = useIntl();
  const { data, error } = useSWR<GameGenreItem[]>(
    `/api/v1/discover/genreslider/games`,
    {
      refreshInterval: 0,
      revalidateOnFocus: false,
    }
  );

  // Two-level gate: if the API came back empty (provider not
  // configured / down), don't leave a dead row on the dashboard.
  if (!data && !error) {
    // Loading: render the slider with placeholders.
  } else if (!data || data.length === 0) {
    return null;
  }

  return (
    <>
      <div className="slider-header">
        <Link href="/discover/games" className="slider-title">
          <span>{intl.formatMessage(messages.gamegenres)}</span>
          <ArrowRightCircleIcon />
        </Link>
      </div>
      <Slider
        sliderKey="game-genres"
        isLoading={!data && !error}
        isEmpty={false}
        items={(data ?? []).map((genre) => (
          <GradientGenreCard
            key={`genre-game-${genre.id}`}
            name={genre.name}
            url={`/discover/games?genre=${genre.id}`}
            backdrops={genre.backdrops}
          />
        ))}
        placeholder={<GenreCard.Placeholder />}
        emptyMessage=""
      />
    </>
  );
};

export default React.memo(GameGenreSlider);
