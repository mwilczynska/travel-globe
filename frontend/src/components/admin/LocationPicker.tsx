import { useState, useEffect, useRef } from 'react';

interface LocationResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

interface LocationPickerProps {
  value: string;
  latitude?: number;
  longitude?: number;
  onChange: (location: { name: string; latitude?: number; longitude?: number }) => void;
  disabled?: boolean;
}

export function LocationPicker({ value, latitude, longitude, onChange, disabled }: LocationPickerProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<LocationResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Update local query when value prop changes
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchLocations = async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setIsSearching(true);

    try {
      const response = await fetch(`/api/geocoding/search?q=${encodeURIComponent(searchQuery)}`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setResults(data.results || []);
        setShowDropdown(true);
      }
    } catch (error) {
      console.error('Location search error:', error);
    }

    setIsSearching(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);

    // Update parent with just the name (no coordinates) while typing
    onChange({ name: newValue });

    // Debounce the search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchLocations(newValue);
    }, 300);
  };

  const handleSelectLocation = (result: LocationResult) => {
    setQuery(result.displayName);
    setShowDropdown(false);
    setResults([]);

    onChange({
      name: result.displayName,
      latitude: result.latitude,
      longitude: result.longitude,
    });
  };

  const hasCoordinates = latitude !== undefined && longitude !== undefined;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-colors pr-10"
          placeholder="Search for a city or place..."
          disabled={disabled}
        />

        {/* Status indicators */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {isSearching && (
            <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          )}
          {hasCoordinates && !isSearching && (
            <span className="text-green-500" title={`${latitude?.toFixed(4)}, ${longitude?.toFixed(4)}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </span>
          )}
        </div>
      </div>

      {/* Coordinates display */}
      {hasCoordinates && (
        <p className="mt-1 text-xs text-green-600">
          Coordinates: {latitude?.toFixed(4)}, {longitude?.toFixed(4)}
        </p>
      )}

      {/* Search results dropdown */}
      {showDropdown && results.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {results.map((result, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSelectLocation(result)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
            >
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-sm text-gray-700 line-clamp-2">{result.displayName}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
