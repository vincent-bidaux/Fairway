import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { Golf } from '../../shared/types';
import { Icon } from './Icon';

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Bandeau carte zoomable, cadré assez près pour voir le tracé du parcours. */
export function GolfBanner({ golf }: { golf: Golf }) {
  const el = useRef<HTMLDivElement>(null);
  const { lat, lng } = golf;
  const hasCoords = lat !== null && lng !== null;

  useEffect(() => {
    if (!el.current || lat === null || lng === null) return;
    // Zoomable (pinch, double-tap, +/- buttons) and pannable; the mouse wheel stays off so page scrolling is never hijacked.
    const map = L.map(el.current, {
      zoomControl: false,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: true,
      touchZoom: true,
      boxZoom: false,
      keyboard: false,
    }).setView([lat, lng], 16); // close enough to see the course layout (fairways, greens)
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer(TILES, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    map.attributionControl.setPrefix(false);
    L.marker([lat, lng], {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: 'golf-pin', html: '<span></span>', iconSize: [30, 30], iconAnchor: [15, 15] }),
    }).addTo(map);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      map.remove();
    };
  }, [lat, lng]);


  return (
    <>
      <div className="golf-banner">
        {hasCoords ? (
          <div ref={el} className="golf-banner-map" aria-label={`Carte : ${golf.name}`} />
        ) : (
          <div className="golf-banner-empty">
            <Icon name="golf" size={40} />
          </div>
        )}
      </div>
    </>
  );
}

/** Large photo of the course (bottom of the golf page). Renders nothing if missing or blocked. */
export function GolfPhoto({ golf }: { golf: Golf }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [golf.photoUrl]);
  if (!golf.photoUrl || failed) return null;
  return (
    <div className="golf-photo golf-photo-section">
      <img
        src={golf.photoUrl}
        alt={`Photo : ${golf.name}`}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
