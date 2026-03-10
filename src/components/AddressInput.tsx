"use client";

// ---------------------------------------------------------------------------
// AddressInput — Debounced geocoding autocomplete with keyboard navigation
// ---------------------------------------------------------------------------

import { useState, useRef, useEffect, useCallback } from "react";
import type { GeocodeSuggestion } from "@/lib/mapbox/geocoding";

interface AddressInputProps {
  /** Called when the user selects an autocomplete suggestion. */
  onSelect: (suggestion: GeocodeSuggestion) => void;
  /** Placeholder text. */
  placeholder?: string;
  /** Whether the input should be disabled (e.g., while generating). */
  disabled?: boolean;
  /** Additional CSS classes for the outer wrapper. */
  className?: string;
}

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

export function AddressInput({
  onSelect,
  placeholder = "Enter a US address...",
  disabled = false,
  className = "",
}: AddressInputProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch suggestions from the geocode API.
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/geocode?q=${encodeURIComponent(q.trim())}`,
      );

      if (!response.ok) {
        throw new Error(`Geocode API returned ${response.status}`);
      }

      const data = (await response.json()) as { suggestions: GeocodeSuggestion[] };
      setSuggestions(data.suggestions);
      setIsOpen(data.suggestions.length > 0);
      setActiveIndex(-1);
    } catch (err) {
      console.error("[AddressInput] Fetch failed:", err);
      setError("Unable to search addresses. Please try again.");
      setSuggestions([]);
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced input handler.
  const handleInputChange = (value: string) => {
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, DEBOUNCE_MS);
  };

  // Handle suggestion selection.
  const handleSelect = (suggestion: GeocodeSuggestion) => {
    setQuery(suggestion.fullAddress);
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    onSelect(suggestion);
  };

  // Keyboard navigation.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1,
        );
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          handleSelect(suggestions[activeIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  // Scroll active item into view.
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("[role='option']");
      items[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  // Close dropdown on outside click.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        inputRef.current &&
        !inputRef.current.contains(target) &&
        listRef.current &&
        !listRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Clean up debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className={`relative w-full ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          disabled={disabled}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls="address-suggestions"
          aria-activedescendant={
            activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined
          }
          className="w-full rounded-lg border border-border bg-surface px-4 py-3.5 text-base text-ink placeholder:text-ink-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-subtle disabled:cursor-not-allowed disabled:opacity-50"
        />

        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-warm-300 border-t-accent" />
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-2 text-sm text-data-4">{error}</p>
      )}

      {/* Suggestion dropdown */}
      {isOpen && suggestions.length > 0 && (
        <ul
          ref={listRef}
          id="address-suggestions"
          role="listbox"
          className="absolute z-50 mt-1 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg max-h-72"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.id}
              id={`suggestion-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onClick={() => handleSelect(suggestion)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`cursor-pointer px-4 py-3 text-sm transition-colors ${
                index === activeIndex
                  ? "bg-accent-subtle text-ink"
                  : "text-ink-light hover:bg-warm-50"
              }`}
            >
              <span className="block font-medium text-ink">
                {suggestion.name}
              </span>
              {suggestion.fullAddress !== suggestion.name && (
                <span className="block text-xs text-ink-muted mt-0.5">
                  {suggestion.fullAddress}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
