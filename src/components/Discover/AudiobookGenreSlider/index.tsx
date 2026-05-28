/**
 * Dashboard genre slider for Hardcover-driven audiobook genres.
 *
 * Mirrors BookGenreSlider — same curated taxonomy, scoped to
 * popular audiobooks. Self-hides when Hardcover isn't the active
 * audiobook provider (Audible / OpenLibrary fall-throughs don't
 * expose comparable genre data).
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

const messages = defineMessages('components.Discover.AudiobookGenreSlider', {
  audiobookgenres: 'Audiobook Genres',
});

interface AudiobookGenreItem {
  id: string;
  name: string;
  backdrops: string[];
}

const AudiobookGenreSlider = () => {
  const intl = useIntl();
  const { data, error } = useSWR<AudiobookGenreItem[]>(
    `/api/v1/discover/genreslider/audiobooks`,
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
        <Link href="/discover/audiobooks" className="slider-title">
          <span>{intl.formatMessage(messages.audiobookgenres)}</span>
          <ArrowRightCircleIcon />
        </Link>
      </div>
      <Slider
        sliderKey="audiobook-genres"
        isLoading={!data && !error}
        isEmpty={false}
        items={(data ?? []).map((genre) => (
          <GradientGenreCard
            key={`genre-audiobook-${genre.id}`}
            name={genre.name}
            url={`/discover/audiobooks?genre=${encodeURIComponent(genre.id)}`}
            backdrops={genre.backdrops}
          />
        ))}
        placeholder={<GenreCard.Placeholder />}
        emptyMessage=""
      />
    </>
  );
};

export default React.memo(AudiobookGenreSlider);
