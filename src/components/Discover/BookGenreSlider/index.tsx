/**
 * Dashboard genre slider for Hardcover-driven book genres.
 *
 * Same chrome as Game/Manga genre sliders. The genre list is
 * curated server-side and only populates when Hardcover is the
 * operator's active book provider — OpenLibrary's fall-through
 * doesn't expose a comparable genre taxonomy, so the slider
 * self-hides via the empty-array guard when Hardcover isn't
 * configured.
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

const messages = defineMessages('components.Discover.BookGenreSlider', {
  bookgenres: 'Book Genres',
});

interface BookGenreItem {
  id: string;
  name: string;
  backdrops: string[];
}

const BookGenreSlider = () => {
  const intl = useIntl();
  const { data, error } = useSWR<BookGenreItem[]>(
    `/api/v1/discover/genreslider/books`,
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
        <Link href="/discover/books" className="slider-title">
          <span>{intl.formatMessage(messages.bookgenres)}</span>
          <ArrowRightCircleIcon />
        </Link>
      </div>
      <Slider
        sliderKey="book-genres"
        isLoading={!data && !error}
        isEmpty={false}
        items={(data ?? []).map((genre) => (
          <GradientGenreCard
            key={`genre-book-${genre.id}`}
            name={genre.name}
            url={`/discover/books?genre=${encodeURIComponent(genre.id)}`}
            backdrops={genre.backdrops}
          />
        ))}
        placeholder={<GenreCard.Placeholder />}
        emptyMessage=""
      />
    </>
  );
};

export default React.memo(BookGenreSlider);
