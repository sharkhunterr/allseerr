/**
 * Dashboard genre slider for AniList manga genres.
 *
 * Same chrome as GameGenreSlider; the only difference is that
 * AniList genres don't have integer IDs — the genre name is its
 * own identifier (the GraphQL filter is ``genre_in: [String]``).
 * So the tile link sends ``?genre=NAME`` (URL-encoded) and the
 * discover endpoint matches it against AniList directly.
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

const messages = defineMessages('components.Discover.MangaGenreSlider', {
  mangagenres: 'Manga Genres',
});

interface MangaGenreItem {
  id: string;
  name: string;
  backdrops: string[];
}

const MangaGenreSlider = () => {
  const intl = useIntl();
  const { data, error } = useSWR<MangaGenreItem[]>(
    `/api/v1/discover/genreslider/manga`,
    {
      refreshInterval: 0,
      revalidateOnFocus: false,
    }
  );

  if (!data && !error) {
    // Loading: render the slider with placeholders.
  } else if (!data || data.length === 0) {
    return null;
  }

  return (
    <>
      <div className="slider-header">
        <Link href="/discover/manga" className="slider-title">
          <span>{intl.formatMessage(messages.mangagenres)}</span>
          <ArrowRightCircleIcon />
        </Link>
      </div>
      <Slider
        sliderKey="manga-genres"
        isLoading={!data && !error}
        isEmpty={false}
        items={(data ?? []).map((genre) => (
          <GradientGenreCard
            key={`genre-manga-${genre.id}`}
            name={genre.name}
            url={`/discover/manga?genre=${encodeURIComponent(genre.id)}`}
            backdrops={genre.backdrops}
          />
        ))}
        placeholder={<GenreCard.Placeholder />}
        emptyMessage=""
      />
    </>
  );
};

export default React.memo(MangaGenreSlider);
