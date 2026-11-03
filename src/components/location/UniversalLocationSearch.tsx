import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SearchResultPlace, PlaceCategory, SearchProviderDiagnostic } from '../../types/search';
import {
  searchPlaces,
  discoverPlaces,
  getSearchProviderDiagnostics,
  checkServerStatus
} from '../../services/search/placesSearchService';
import {
  Search,
  MapPin,
  Zap,
  Utensils,
  Coffee,
  Hotel,
  Landmark,
  ShoppingBag,
  Building2,
  Navigation,
  Plus,
  X,
  Loader2,
  AlertCircle,
  Globe2,
  CheckCircle2,
  Plane,
  Train,
  Bus,
  GraduationCap,
  Cross,
  Church,
  Crosshair
} from 'lucide-react';
import { getCurrentGpsPosition } from '../../services/gps/geolocationService';
import { reverseGeocode } from '../../services/search/placesSearchService';

export interface UniversalLocationSearchProps {
  placeholder?: string;
  initialValue?: string;
  autoFocus?: boolean;
  center?: [number, number]; // Proximity bias
  showCategoryChips?: boolean;
  targetMode?: 'origin' | 'destination' | 'waypoint' | 'general';
  variant?: 'inline' | 'embedded';
  onClose?: () => void;
  onSelectPlace: (
    place: SearchResultPlace,
    actionType?: 'via' | 'charging' | 'origin' | 'destination'
  ) => void;
  className?: string;
}

export const renderCategoryIcon = (category: PlaceCategory | string, isCharging: boolean) => {
  if (isCharging) return <Zap className="w-4 h-4 text-status-warning" />;
  switch (category) {
    case 'restaurant':
      return <Utensils className="w-4 h-4 text-orange-400" />;
    case 'cafe':
      return <Coffee className="w-4 h-4 text-amber-500" />;
    case 'hotel':
      return <Hotel className="w-4 h-4 text-indigo-400" />;
    case 'attraction':
      return <Landmark className="w-4 h-4 text-purple-400" />;
    case 'religious':
      return <Church className="w-4 h-4 text-amber-400" />;
    case 'shopping':
    case 'mall':
      return <ShoppingBag className="w-4 h-4 text-pink-400" />;
    case 'airport':
      return <Plane className="w-4 h-4 text-sky-400" />;
    case 'railway_station':
      return <Train className="w-4 h-4 text-blue-400" />;
    case 'bus_station':
      return <Bus className="w-4 h-4 text-teal-400" />;
    case 'hospital':
      return <Cross className="w-4 h-4 text-rose-400" />;
    case 'university':
    case 'school':
      return <GraduationCap className="w-4 h-4 text-violet-400" />;
    case 'highway':
      return <Navigation className="w-4 h-4 text-emerald-400" />;
    case 'office':
    case 'building':
      return <Building2 className="w-4 h-4 text-cyan-400" />;
    case 'city':
    case 'town':
    case 'village':
    case 'locality':
      return <Building2 className="w-4 h-4 text-emerald-400" />;
    default:
      return <MapPin className="w-4 h-4 text-brand-primary" />;
  }
};

export const UniversalLocationSearch: React.FC<UniversalLocationSearchProps> = ({
  placeholder = 'Search cities, addresses, landmarks, hotels, or chargers...',
  initialValue = '',
  autoFocus = false,
  center,
  showCategoryChips = true,
  targetMode = 'general',
  variant = 'inline',
  onClose,
  onSelectPlace,
  className = ''
}) => {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<SearchResultPlace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [diagnostic, setDiagnostic] = useState<SearchProviderDiagnostic>(getSearchProviderDiagnostics());

  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check backend server proxy status on mount
  useEffect(() => {
    checkServerStatus().then(() => {
      setDiagnostic(getSearchProviderDiagnostics());
    });
  }, []);

  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [autoFocus]);

  // Click outside listener for inline variant
  useEffect(() => {
    if (variant !== 'inline') return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [variant, onClose]);

  // Execute debounced suggest search
  const executeSearch = useCallback(
    async (searchQuery: string) => {
      const trimmed = searchQuery.trim();
      if (trimmed.length < 2) {
        setResults([]);
        setIsLoading(false);
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const found = await searchPlaces({
          query: trimmed,
          center,
          limit: 10,
          signal: controller.signal
        });

        setResults(found);
        setSelectedIndex(found.length > 0 ? 0 : -1);
        setIsOpen(true);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setErrorMessage('Location search failed. Please verify your connection.');
      } finally {
        setIsLoading(false);
      }
    },
    [center]
  );

  // Full comprehensive search on Enter or Search button click (Task 5)
  const handleFullSearch = useCallback(
    async (searchQuery: string) => {
      const trimmed = searchQuery.trim();
      if (trimmed.length < 2) return;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const found = await discoverPlaces({
          query: trimmed,
          center,
          limit: 15,
          signal: controller.signal
        });

        setResults(found);
        setSelectedIndex(found.length > 0 ? 0 : -1);
        setIsOpen(true);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setErrorMessage('Full location search failed. Please verify connection.');
      } finally {
        setIsLoading(false);
      }
    },
    [center]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) {
        executeSearch(query);
      } else {
        setResults([]);
        setIsLoading(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [query, executeSearch]);

  // Filter results by active category chip
  const filteredResults = results.filter((r) => {
    if (activeCategoryFilter === 'all') return true;
    if (activeCategoryFilter === 'charging') return r.isChargingStation;
    if (activeCategoryFilter === 'food') return r.category === 'restaurant' || r.category === 'cafe';
    if (activeCategoryFilter === 'hotel') return r.category === 'hotel';
    if (activeCategoryFilter === 'city')
      return r.category === 'city' || r.category === 'town' || r.category === 'locality';
    return true;
  });

  const handleCommitSelection = (
    place: SearchResultPlace,
    actionType?: 'via' | 'charging' | 'origin' | 'destination'
  ) => {
    setQuery(place.name);
    setIsOpen(false);
    onSelectPlace(place, actionType);
    onClose?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      if (results.length > 0) setIsOpen(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < filteredResults.length) {
        const item = filteredResults[selectedIndex];
        handleCommitSelection(item);
      } else if (query.trim().length >= 2) {
        // Trigger full search on enter if nothing explicitly selected
        handleFullSearch(query);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      onClose?.();
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`} onKeyDown={handleKeyDown}>
      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <button
          type="button"
          onClick={() => handleFullSearch(query)}
          title="Search all places"
          className="absolute left-3 top-1/2 -translate-y-1/2 p-0.5 text-content-muted hover:text-brand-primary transition-colors"
        >
          <Search className="w-4 h-4" />
        </button>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2 rounded-xl bg-surface-subtle border border-edge-default text-xs text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all shadow-inner"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setResults([]);
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-content-tertiary hover:text-content-primary transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : isLoading ? (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-primary animate-spin" />
        ) : null}
      </div>

      {/* Floating Suggestions Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-surface-panel border border-edge-default rounded-xl shadow-dropdown p-2 text-xs space-y-2 animate-in fade-in zoom-in-95 duration-120 max-h-96 overflow-hidden flex flex-col">
          {/* Category Filter Chips */}
          {showCategoryChips && (
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] custom-scrollbar shrink-0">
              {[
                { id: 'all', label: 'All' },
                { id: 'city', label: '🏙️ Cities' },
                { id: 'charging', label: '⚡ Charging' },
                { id: 'food', label: '🍴 Dining' },
                { id: 'hotel', label: '🏨 Hotels' }
              ].map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setActiveCategoryFilter(chip.id)}
                  className={`px-2 py-0.5 rounded-md border font-medium whitespace-nowrap transition-colors ${
                    activeCategoryFilter === chip.id
                      ? 'bg-brand-primary text-slate-950 border-brand-primary font-semibold'
                      : 'bg-surface-subtle text-content-secondary border-edge-subtle hover:text-content-primary'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          {/* Error notice */}
          {errorMessage && (
            <div className="p-2 rounded-lg bg-status-dangerSubtle border border-status-danger/30 text-status-danger text-[11px] flex items-center gap-1.5 shrink-0">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Use Current Location (GPS) button */}
          <button
            type="button"
            onClick={async () => {
              setIsLoading(true);
              setErrorMessage(null);
              try {
                const pos = await getCurrentGpsPosition({ timeout: 10000, enableHighAccuracy: true });
                const rev = await reverseGeocode([pos.latitude, pos.longitude]);
                const place: SearchResultPlace = {
                  id: `gps-${Date.now()}`,
                  name: rev.name || 'My Current Location',
                  subTitle: `GPS ±${pos.accuracy}m • ${rev.address}`,
                  address: rev.address || `Lat: ${pos.latitude.toFixed(4)}, Lon: ${pos.longitude.toFixed(4)}`,
                  coordinates: [pos.latitude, pos.longitude],
                  category: 'poi',
                  isChargingStation: false,
                  source: 'gps'
                };
                handleCommitSelection(place, targetMode === 'origin' ? 'origin' : undefined);
              } catch (err: unknown) {
                setErrorMessage((err as any)?.message || 'Failed to acquire device GPS coordinates.');
              } finally {
                setIsLoading(false);
              }
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-[11px] font-semibold flex items-center gap-2 transition-colors shrink-0"
          >
            <Crosshair className="w-3.5 h-3.5 shrink-0 animate-pulse text-blue-500" />
            <span>Use My Current Location (GPS)</span>
          </button>

          {/* Full Search Action Button (Task 5) */}
          {query.trim().length >= 2 && (
            <button
              type="button"
              onClick={() => handleFullSearch(query)}
              className="w-full text-left px-2.5 py-1.5 rounded-lg bg-brand-primary/10 hover:bg-brand-primary/20 border border-brand-primary/30 text-brand-primary text-[11px] font-medium flex items-center justify-between transition-colors shrink-0"
            >
              <div className="flex items-center gap-1.5 truncate">
                <Search className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Search all global places for &ldquo;{query}&rdquo;</span>
              </div>
              <span className="text-[10px] text-brand-primary/70 font-mono shrink-0 ml-1">↵ Enter</span>
            </button>
          )}

          {/* Results List */}
          <div className="overflow-y-auto space-y-1 custom-scrollbar pr-0.5 flex-1 max-h-64">
            {isLoading && results.length === 0 ? (
              <div className="py-6 text-center text-xs text-content-tertiary flex flex-col items-center gap-1.5">
                <Loader2 className="w-4 h-4 text-brand-primary animate-spin" />
                <span>Searching locations...</span>
              </div>
            ) : filteredResults.length > 0 ? (
              filteredResults.map((place, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={place.id}
                    onClick={() => {
                      setSelectedIndex(idx);
                      if (targetMode !== 'waypoint') {
                        handleCommitSelection(
                          place,
                          targetMode === 'origin'
                            ? 'origin'
                            : targetMode === 'destination'
                            ? 'destination'
                            : 'via'
                        );
                      }
                    }}
                    className={`p-2 rounded-lg border transition-all flex items-center justify-between gap-2.5 cursor-pointer ${
                      isSelected
                        ? 'bg-surface-hover border-brand-primary/50 shadow-sm'
                        : 'bg-surface-card border-edge-subtle hover:bg-surface-hover/80 hover:border-edge-default'
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <div className="p-1.5 rounded-md bg-surface-subtle shrink-0 mt-0.5 border border-edge-subtle">
                        {renderCategoryIcon(place.category, place.isChargingStation)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-content-primary truncate text-xs">
                            {place.name}
                          </span>
                          <span className="text-[9px] px-1 py-0.2 rounded bg-surface-subtle text-content-secondary border border-edge-subtle capitalize">
                            {place.category.replace('_', ' ')}
                          </span>
                          {place.verificationState === 'verified_station' && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-status-successSubtle text-status-success border border-status-success/30 font-medium">
                              Verified
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-content-secondary truncate mt-0.5">
                          {place.address}
                        </p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      {targetMode === 'waypoint' ? (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCommitSelection(place, 'via');
                            }}
                            title="Add as via stop (No charging)"
                            className="px-2 py-1 rounded-md bg-surface-subtle hover:bg-surface-panel border border-edge-default text-[10px] font-medium text-content-primary flex items-center gap-1 transition-colors"
                          >
                            <Navigation className="w-2.5 h-2.5 text-brand-primary" />
                            <span>Via</span>
                          </button>
                          {place.isChargingStation && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCommitSelection(place, 'charging');
                              }}
                              title="Add as charging stop"
                              className="px-2 py-1 rounded-md bg-status-warningSubtle hover:bg-status-warning/20 border border-status-warning/40 text-[10px] font-semibold text-status-warning flex items-center gap-1 transition-colors"
                            >
                              <Zap className="w-2.5 h-2.5" />
                              <span>Charge</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCommitSelection(
                              place,
                              targetMode === 'origin'
                                ? 'origin'
                                : targetMode === 'destination'
                                ? 'destination'
                                : 'via'
                            );
                          }}
                          className="px-2.5 py-1 rounded-md bg-brand-primary text-slate-950 font-semibold text-[10px] flex items-center gap-1 hover:brightness-110 transition-all shadow-sm"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Select</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : query.trim().length >= 2 ? (
              <div className="py-5 text-center text-xs text-content-tertiary">
                <MapPin className="w-5 h-5 mx-auto mb-1 text-content-muted opacity-50" />
                <p>No quick suggestions for &ldquo;{query}&rdquo;</p>
                <p className="text-[10px] text-content-muted mt-0.5">
                  Click &ldquo;Search all global places&rdquo; above or press Enter to search the full map database.
                </p>
              </div>
            ) : (
              <div className="py-4 text-center text-[11px] text-content-tertiary">
                <span>Type at least 2 characters to search across maps...</span>
              </div>
            )}
          </div>

          {/* Truthful Provider Status Footer (Task 10) */}
          <div className="pt-1.5 border-t border-edge-subtle flex items-center justify-between text-[10px] text-content-tertiary shrink-0 px-1">
            <div className="flex items-center gap-1.5 truncate">
              {diagnostic.hasKey ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-status-success shrink-0" />
                  <span className="text-status-success font-medium truncate">
                    Global search connected ({diagnostic.provider})
                  </span>
                </>
              ) : (
                <>
                  <Globe2 className="w-3 h-3 text-status-warning shrink-0" />
                  <span className="text-status-warning font-medium truncate" title={diagnostic.message}>
                    Local catalogue only (API key unconfigured)
                  </span>
                </>
              )}
            </div>
            {!diagnostic.hasKey && (
              <span className="text-[9px] text-content-muted shrink-0 ml-1">
                Set TOMTOM_API_KEY
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
