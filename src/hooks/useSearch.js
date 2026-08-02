// footballprediction/src/hooks/useSearch.js
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { monitoredSearchMatches } from '../services/searchService';

export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export function useSearch(query) {
  const debouncedQuery = useDebounce(query, 300);

  return useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => monitoredSearchMatches(debouncedQuery),
    enabled: debouncedQuery.length >= 2, // Only search if 2+ chars
    staleTime: 60 * 1000, // Cache search results for 1 minute
    gcTime: 5 * 60 * 1000, // Garbage collect after 5 mins
    placeholderData: (prev) => prev, // Keep old results visible while fetching new ones
  });
}
