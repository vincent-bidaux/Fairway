import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GolfEvent } from '../../shared/types';
import { formatLongDate, formatTime } from '../lib';
import type { Zone } from '../store';

interface Props {
  events: GolfEvent[];
  zone: Zone | null;
  onOpenGolf: (golfId: number) => void;
}

interface Pin {
  golfId: number;
  name: string;
  city: string;
  lat: number;
  lng: number;
  events: GolfEvent[];
}

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export function EventsMap({ events, zone, onOpenGolf }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<number, L.Marker>());
  const [selected, setSelected] = useState<number | null>(null);

  const pins = useMemo(() => {
    const map = new Map<number, Pin>();
    for (const e of events) {
      if (e.lat === null || e.lng === null) continue;
      const p = map.get(e.golfId);
      if (p) p.events.push(e);
      else map.set(e.golfId, { golfId: e.golfId, name: e.golfName, city: e.golfCity, lat: e.lat, lng: e.lng, events: [e] });
    }
    for (const p of map.values()) p.events.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id);
    return [...map.values()];
  }, [events]);

  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { zoomControl: true }).setView([45.4, 0.2], 7);
    L.tileLayer(TILES, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    map.attributionControl.setPrefix(false);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.on('click', () => setSelected(null));
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markers.current.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    markers.current.clear();
    const bounds: L.LatLngTuple[] = [];
    const tint = getComputedStyle(document.documentElement).getPropertyValue('--tint').trim() || '#1E8E3E';

    let circle: L.Circle | null = null;
    if (zone && zone.mode !== 'depts') {
      circle = L.circle([zone.lat, zone.lng], {
        radius: zone.radius * 1000,
        color: tint,
        weight: 1.5,
        fillColor: tint,
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(layer);
      L.marker([zone.lat, zone.lng], {
        icon: L.divIcon({ className: 'me-dot', html: '<span></span>', iconSize: [18, 18] }),
        interactive: false,
        keyboard: false,
      }).addTo(layer);
    }

    for (const p of pins) {
      const m = L.marker([p.lat, p.lng], {
        title: p.name,
        alt: `${p.name}, ${p.events.length} compétition${p.events.length > 1 ? 's' : ''}`,
        icon: L.divIcon({
          className: 'golf-pin',
          html: `<span>${p.events.length}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
      });
      m.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        setSelected(p.golfId);
      });
      m.addTo(layer);
      markers.current.set(p.golfId, m);
      bounds.push([p.lat, p.lng]);
    }

    if (circle) map.fitBounds(circle.getBounds(), { padding: [16, 16] });
    else if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    setSelected(null);
  }, [pins, zone]);

  useEffect(() => {
    markers.current.forEach((m, id) => {
      m.getElement()?.classList.toggle('is-selected', id === selected);
    });
  }, [selected, pins]);

  const sel = pins.find((p) => p.golfId === selected);
  const next = sel?.events[0];
  const time = next ? formatTime(next.startTime) : null;

  return (
    <div className="map-wrap">
      <div ref={el} className="map" role="application" aria-label="Carte des compétitions" />
      {sel && next && (
        <div className="map-card" role="dialog" aria-label={sel.name}>
          <div className="map-card-text">
            <strong>{sel.name}</strong>
            <span>
              {formatLongDate(next.startDate)}
              {time ? ` · ${time}` : ''} · {next.title}
            </span>
            <span>
              {sel.events.length} compétition{sel.events.length > 1 ? 's' : ''}
            </span>
          </div>
          <button type="button" className="btn btn--small" onClick={() => onOpenGolf(sel.golfId)}>
            Voir
          </button>
        </div>
      )}
    </div>
  );
}
