import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { Golf } from '../../shared/types';
import { Icon } from './Icon';

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Bandeau carte zoomable ; la photo du golf, si elle se charge, s'affiche à part sous la carte. */
export function GolfBanner({ golf }: { golf: Golf }) {
  const el = useRef<HTMLDivElement>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const { lat, lng } = golf;
  const hasCoords = lat !== null && lng !== null;

  useEffect(() => {
    setPhotoFailed(false);
  }, [golf.photoUrl]);

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
    }).setView([lat, lng], 14);
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

  const showPhoto = !!golf.photoUrl && !photoFailed;

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
      {showPhoto && (
        <div className="golf-photo">
          <img
            src={golf.photoUrl!}
            alt={`Photo : ${golf.name}`}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setPhotoFailed(true)}
          />
        </div>
      )}
    </>
  );
}
