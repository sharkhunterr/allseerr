/**
 * Game-controller icon, inline SVG.
 *
 * heroicons (v2) ships no gaming-controller glyph, and the
 * sidebar was using ``PuzzlePieceIcon`` which reads as
 * jigsaw / casual game more than "video game". This component
 * renders a stylised d-pad + face-buttons controller silhouette
 * that visually maps to "video games" instantly.
 *
 * Props mirror the heroicons API surface (``className``,
 * ``aria-hidden``, etc.) so it drops in anywhere a heroicon
 * SVG would.
 */

import type { ReactElement, SVGProps } from 'react';

const GameControllerIcon = (
  props: SVGProps<SVGSVGElement>
): ReactElement => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {/* Controller body — pill-shaped enclosure with the two grips
        flaring outward. */}
    <path d="M8 7h8a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5h-1a2 2 0 0 1-1.6-.8L13 16h-2l-.4.2A2 2 0 0 1 9 17H8a5 5 0 0 1-5-5v0a5 5 0 0 1 5-5Z" />
    {/* Left d-pad cross — horizontal + vertical strokes. */}
    <path d="M7 11h2.5" />
    <path d="M8.25 9.75v2.5" />
    {/* Right face buttons — two circles. */}
    <circle cx="15.5" cy="10.5" r="0.75" fill="currentColor" />
    <circle cx="17.5" cy="12.5" r="0.75" fill="currentColor" />
  </svg>
);

export default GameControllerIcon;
