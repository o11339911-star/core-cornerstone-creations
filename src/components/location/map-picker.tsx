import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { LocationBoundary } from "@/lib/project-location.functions";

/**
 * Free OpenStreetMap tiles + Leaflet. No paid geocoding service is used:
 * the user places the point and types the address themselves.
 */

const PIN = L.divIcon({
  className: "",
  html: '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:var(--color-primary);border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35)"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export type MapPickerProps = {
  lat: number | null;
  lng: number | null;
  boundary: LocationBoundary;
  editable: boolean;
  drawing?: boolean;
  onPick?: (lat: number, lng: number) => void;
  onDrawPoint?: (lat: number, lng: number) => void;
};

const DEFAULT_CENTER: [number, number] = [24.7136, 46.6753]; // الرياض

export default function MapPicker({
  lat,
  lng,
  boundary,
  editable,
  drawing = false,
  onPick,
  onDrawPoint,
}: MapPickerProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const markerRef = React.useRef<L.Marker | null>(null);
  const polygonRef = React.useRef<L.Polygon | null>(null);
  const handlerRef = React.useRef<(e: L.LeafletMouseEvent) => void>(() => {});

  handlerRef.current = (event: L.LeafletMouseEvent) => {
    if (!editable) return;
    const { lat: la, lng: ln } = event.latlng;
    if (drawing) onDrawPoint?.(la, ln);
    else onPick?.(la, ln);
  };

  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { attributionControl: true }).setView(
      lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER,
      lat != null && lng != null ? 16 : 11,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    map.on("click", (e) => handlerRef.current(e));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lat == null || lng == null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
    else markerRef.current = L.marker([lat, lng], { icon: PIN }).addTo(map);
    map.setView([lat, lng], Math.max(map.getZoom(), 15));
  }, [lat, lng]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    polygonRef.current?.remove();
    polygonRef.current = null;
    const ring = boundary?.coordinates?.[0];
    if (!ring || ring.length < 3) return;
    polygonRef.current = L.polygon(
      ring.map(([x, y]) => [y, x] as [number, number]),
      { color: "#2B4A43", weight: 2, fillOpacity: 0.12 },
    ).addTo(map);
  }, [boundary]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="خريطة تحديد الموقع"
      className="h-64 w-full overflow-hidden rounded-xl border border-border sm:h-80"
    />
  );
}
