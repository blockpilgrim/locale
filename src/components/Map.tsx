"use client";

// ---------------------------------------------------------------------------
// Map — Interactive Mapbox GL JS map with isochrone overlays and POI markers
// ---------------------------------------------------------------------------
// Dynamic import required: Mapbox GL JS needs `window`. Uses "use client"
// directive and guards against SSR.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { IsochroneResult } from "@/lib/mapbox/isochrone";
import type { PoiResult, PoiCategory } from "@/lib/poi";
import { Skeleton } from "@/components/Skeleton";

/** Escape HTML special characters to prevent XSS via OSM data. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface MapProps {
  /** Center coordinates for the map. */
  coordinates: { latitude: number; longitude: number };
  /** Isochrone walking polygons (5/10/15 min). */
  isochrone: IsochroneResult | null;
  /** Nearby points of interest. */
  pois: PoiResult | null;
  /** Additional CSS classes for the map container. */
  className?: string;
}

// Isochrone layer colors — hardcoded hex required by Mapbox GL JS paint API.
// These mirror the design tokens in globals.css. Update both if tokens change:
//   accent (#2D5A3D), accent-light (#3D7A52), accent-muted (#9DBFAA)
const ISOCHRONE_STYLES: Record<number, { color: string; opacity: number }> = {
  5: { color: "#2D5A3D", opacity: 0.3 },
  10: { color: "#3D7A52", opacity: 0.2 },
  15: { color: "#9DBFAA", opacity: 0.15 },
};

// Category marker colors — hardcoded hex required by Mapbox GL JS marker API.
// These mirror the data visualization tokens in globals.css:
//   data-1 (#5B8C6E), data-2 (#7BA3C4), data-3 (#D4A574),
//   data-4 (#C48B8B), data-5 (#A38DC4), data-6 (#8CB4B4)
const CATEGORY_COLORS: Record<PoiCategory, string> = {
  dining: "#D4A574",
  groceries: "#5B8C6E",
  parks: "#8CB4B4",
  fitness: "#A38DC4",
  nightlife: "#C48B8B",
  healthcare: "#7BA3C4",
  shopping: "#D4A574",
  education: "#5B8C6E",
};

export function Map({
  coordinates,
  isochrone,
  pois,
  className = "",
}: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const hasValidCoordinates =
    coordinates &&
    Number.isFinite(coordinates.latitude) &&
    Number.isFinite(coordinates.longitude);

  // Initialize the map.
  useEffect(() => {
    if (!mapContainer.current || !hasValidCoordinates) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.error("[Map] NEXT_PUBLIC_MAPBOX_TOKEN is not set.");
      return;
    }

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [coordinates.longitude, coordinates.latitude],
      zoom: 14,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Add address marker. Hex mirrors --color-accent token.
    new mapboxgl.Marker({ color: "#2D5A3D" })
      .setLngLat([coordinates.longitude, coordinates.latitude])
      .addTo(map);

    map.on("load", () => {
      setIsLoaded(true);
    });

    mapRef.current = map;

    return () => {
      // Clean up markers and reset state so isochrone/POI effects
      // don't fire against a stale map during reinit.
      setIsLoaded(false);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [coordinates.latitude, coordinates.longitude]);

  // Add isochrone layers once map is loaded.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded || !isochrone) return;

    // Add isochrone source.
    const sourceId = "isochrone-source";
    if (map.getSource(sourceId)) {
      // Source already exists -- remove existing layers and source.
      for (const feature of isochrone.features) {
        const layerId = `isochrone-${feature.properties.contour}`;
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      map.removeSource(sourceId);
    }

    map.addSource(sourceId, {
      type: "geojson",
      data: isochrone as GeoJSON.FeatureCollection,
    });

    // Add layers in reverse order (largest first) so smaller polygons render on top.
    const sortedFeatures = [...isochrone.features].sort(
      (a, b) => b.properties.contour - a.properties.contour,
    );

    for (const feature of sortedFeatures) {
      const minutes = feature.properties.contour;
      const style = ISOCHRONE_STYLES[minutes] ?? {
        color: "#2D5A3D",
        opacity: 0.15,
      };

      map.addLayer({
        id: `isochrone-${minutes}`,
        type: "fill",
        source: sourceId,
        filter: ["==", ["get", "contour"], minutes],
        paint: {
          "fill-color": style.color,
          "fill-opacity": style.opacity,
        },
      });

      // Add outline.
      map.addLayer({
        id: `isochrone-outline-${minutes}`,
        type: "line",
        source: sourceId,
        filter: ["==", ["get", "contour"], minutes],
        paint: {
          "line-color": style.color,
          "line-width": 1.5,
          "line-opacity": 0.5,
        },
      });
    }
  }, [isochrone, isLoaded]);

  // Add POI markers once map is loaded.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded || !pois) return;

    // Clear existing POI markers.
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Add markers for POIs (limit to avoid cluttering).
    const maxMarkers = 60;
    const poiSlice = pois.all.slice(0, maxMarkers);

    for (const poi of poiSlice) {
      const color = CATEGORY_COLORS[poi.category] ?? "#78716C";

      const el = document.createElement("div");
      el.style.width = "10px";
      el.style.height = "10px";
      el.style.borderRadius = "50%";
      el.style.backgroundColor = color;
      el.style.border = "1.5px solid white";
      el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.2)";

      // Escape POI data (from OpenStreetMap, user-contributed) to prevent XSS.
      const safeName = escapeHtml(poi.name || "Unnamed");
      const safeCategory = escapeHtml(poi.category);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([poi.longitude, poi.latitude])
        .setPopup(
          new mapboxgl.Popup({ offset: 10, closeButton: false }).setHTML(
            `<div style="font-family: Inter, sans-serif; font-size: 13px;">
              <strong>${safeName}</strong>
              <br/><span style="color: #78716C; font-size: 12px;">${safeCategory} &middot; ${poi.walkingMinutes} min walk</span>
            </div>`,
          ),
        )
        .addTo(map);

      markersRef.current.push(marker);
    }
  }, [pois, isLoaded]);

  return (
    <div className={`relative overflow-hidden rounded-xl ${className}`}>
      {!hasValidCoordinates ? (
        <div className="flex items-center justify-center rounded-xl border border-border-light bg-warm-50 h-[400px] sm:h-[500px]">
          <p className="text-sm text-ink-muted">Map unavailable</p>
        </div>
      ) : (
        <>
          {!isLoaded && (
            <div className="absolute inset-0 z-10">
              <Skeleton width="w-full" height="h-full" className="rounded-xl" />
            </div>
          )}
          <div
            ref={mapContainer}
            className="h-[400px] w-full sm:h-[500px]"
            aria-label="Interactive neighborhood map"
          />
        </>
      )}
    </div>
  );
}
