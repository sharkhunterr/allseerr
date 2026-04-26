import React, { useState } from 'react';

interface SearchLoadingContextValue {
  isSearching: boolean;
  setIsSearching: (value: boolean) => void;
}

/**
 * One boolean that signals "the /search page has at least one active
 * fetch in flight". Owned by the Search page (which combines the
 * loading state of every enabled per-type query) and read by the
 * global SearchInput in the layout so it can render a spinner in
 * place of the magnifying-glass icon while results are still
 * loading. Decoupled because publisher and consumer live in
 * unrelated components.
 */
export const SearchLoadingContext =
  React.createContext<SearchLoadingContextValue>({
    isSearching: false,
    setIsSearching: () => undefined,
  });

interface SearchLoadingProviderProps {
  children?: React.ReactNode;
}

export const SearchLoadingProvider = ({
  children,
}: SearchLoadingProviderProps) => {
  const [isSearching, setIsSearching] = useState(false);
  return (
    <SearchLoadingContext.Provider value={{ isSearching, setIsSearching }}>
      {children}
    </SearchLoadingContext.Provider>
  );
};
