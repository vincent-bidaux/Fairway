import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { Golf } from '../../shared/types';
import { formatKm, holesLabel } from '../lib';
import type { Zone } from '../store';

interface Props {
  golfs: Golf[];
  zone: Zone | null;
  onOpen: (g: Golf) => void;
}

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export function MapView({ golfs, zone, onOpen }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<number, L.Marker>());
  const [selected, setSelected] = useState<Golf | null>(null);

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

    for (const g of golfs) {
      if (g.lat === null || g.lng === null) continue;
      const m = L.marker([g.lat, g.lng], {
        title: g.name,
        alt: g.name,
        icon: L.divIcon({
          className: 'golf-pin',
          html: `<span>${g.upcomingCount ? g.upcomingCount : ''}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
      });
      m.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        setSelected(g);
      });
      m.addTo(layer);
      markers.current.set(g.id, m);
      bounds.push([g.lat, g.lng]);
    }

    if (circle) map.fitBounds(circle.getBounds(), { padding: [16, 16] });
    else if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    setSelected(null);
  }, [golfs, zone]);

  useEffect(() => {
    markers.current.forEach((m, id) => {
      m.getElement()?.classList.toggle('is-selected', id === selected?.id);
    });
  }, [selected, golfs]);

  return (
    <div className="map-wrap">
      <div ref={el} className="map" role="application" aria-label="Carte des golfs" />
      {selected && (
        <div className="map-card" role="dialog" aria-label={selected.name}>
          <div className="map-card-text">
            <strong>{selected.name}</strong>
            <span>
              {[selected.city, holesLabel(selected.holes), formatKm(selected.distanceKm)].filter(Boolean).join(' · ')}
            </span>
          </div>
          <button type="button" className="btn btn--small" onClick={() => onOpen(selected)}>
            Voir
          </button>
        </div>
      )}
    </div>
  );
}
