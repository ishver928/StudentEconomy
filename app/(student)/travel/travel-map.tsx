'use client';
// Interactive Leaflet map. Leaflet touches `window`, so it is imported inside an effect and never
// runs during server rendering. Labels are set with textContent (never HTML) because they can be
// user-provided.
import 'leaflet/dist/leaflet.css';
import type * as L from 'leaflet';
import { useEffect, useRef, useState } from 'react';

export type MapPoint = { lat: number; lng: number; label: string };
export type MapData = {
  origin: MapPoint | null;
  originExact: boolean; // false = an approximate area (drawn as a circle)
  dest: MapPoint | null;
  line: [number, number][] | null;
  lineIsEstimate: boolean;
  stations: { lat: number; lng: number; name: string; kind: string }[];
  events: { id: string; lat: number; lng: number; title: string; sub: string; isSample: boolean }[];
  trips: { lat: number; lng: number; label: string; count: number; allSample: boolean }[];
  buddies: { lat: number; lng: number; label: string }[];
};

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const BAY_AREA: [number, number] = [37.78, -122.3];

function pin(Lf: typeof L, emoji: string, bg: string, size = 34) {
  const el = document.createElement('span');
  el.className = 'se-pin';
  el.style.background = bg;
  el.style.width = el.style.height = `${size}px`;
  el.textContent = emoji;
  return Lf.divIcon({ html: el, className: '', iconSize: [size, size], iconAnchor: [size / 2, size], popupAnchor: [0, -size + 4] });
}

function popup(title: string, sub?: string, action?: { label: string; onClick: () => void }) {
  const box = document.createElement('div');
  const t = document.createElement('strong');
  t.textContent = title;
  box.append(t);
  if (sub) {
    const s = document.createElement('div');
    s.textContent = sub;
    s.style.fontSize = '12px';
    box.append(s);
  }
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.className = 'se-map-btn';
    b.onclick = action.onClick;
    box.append(b);
  }
  return box;
}

export function TravelMap({ data, onPickEvent }: { data: MapData; onPickEvent?: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const lib = useRef<typeof L | null>(null);
  const [ready, setReady] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const pick = useRef(onPickEvent);
  useEffect(() => { pick.current = onPickEvent; }, [onPickEvent]);

  useEffect(() => {
    let cancelled = false;
    let errors = 0;
    import('leaflet')
      .then((mod) => {
        if (cancelled || !el.current) return;
        const Lf = (mod.default ?? mod) as typeof L;
        lib.current = Lf;
        const m = Lf.map(el.current, { zoomControl: true, scrollWheelZoom: true }).setView(BAY_AREA, 10);
        const tiles = Lf.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(m);
        tiles.on('tileerror', () => { if (++errors === 6) setTilesFailed(true); });
        tiles.on('tileload', () => { errors = 0; setTilesFailed(false); });
        layer.current = Lf.layerGroup().addTo(m);
        map.current = m;
        setReady(true);
      })
      .catch(() => setLoadFailed(true));
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const Lf = lib.current, m = map.current, g = layer.current;
    if (!ready || !Lf || !m || !g) return;
    g.clearLayers();
    const bounds: [number, number][] = [];

    for (const t of data.trips) {
      Lf.marker([t.lat, t.lng], { icon: pin(Lf, '🎒', '#d7c4f0', 30), title: t.label })
        .bindPopup(popup(`${t.count} student${t.count === 1 ? '' : 's'} heading here`, `${t.label}${t.allSample ? ' · fictional sample' : ''}`))
        .addTo(g);
    }
    for (const e of data.events) {
      Lf.marker([e.lat, e.lng], { icon: pin(Lf, '🎪', '#ffc9a8'), title: e.title })
        .bindPopup(popup(e.title, `${e.sub}${e.isSample ? ' · fictional sample event' : ''}`, pick.current ? { label: 'Plan a trip here', onClick: () => pick.current?.(e.id) } : undefined))
        .addTo(g);
    }
    for (const b of data.buddies) {
      // Approximate areas only: a soft circle, never a point.
      Lf.circle([b.lat, b.lng], { radius: 2500, color: '#5e8a52', weight: 1, fillColor: '#b5d3a8', fillOpacity: 0.35 }).bindTooltip(b.label).addTo(g);
    }
    for (const s of data.stations) {
      Lf.circleMarker([s.lat, s.lng], { radius: s.kind === 'bus' ? 5 : 7, color: '#4a9fcf', weight: 2, fillColor: '#9fd3f0', fillOpacity: 0.9 })
        .bindTooltip(`${s.kind === 'rail' ? '🚉' : s.kind === 'ferry' ? '⛴️' : '🚌'} ${s.name}`).addTo(g);
    }
    if (data.line && data.line.length > 1) {
      Lf.polyline(data.line, { color: '#4a9fcf', weight: 5, opacity: 0.85, dashArray: data.lineIsEstimate ? '8 10' : undefined }).addTo(g);
      bounds.push(...data.line);
    }
    if (data.origin) {
      const o = data.origin;
      if (data.originExact) Lf.marker([o.lat, o.lng], { icon: pin(Lf, '🏠', '#b5d3a8'), title: o.label }).bindPopup(popup('Start', o.label)).addTo(g);
      else Lf.circle([o.lat, o.lng], { radius: 2000, color: '#5e8a52', weight: 2, fillColor: '#b5d3a8', fillOpacity: 0.4 }).bindTooltip(`Start (approximate): ${o.label}`).addTo(g);
      bounds.push([o.lat, o.lng]);
    }
    if (data.dest) {
      Lf.marker([data.dest.lat, data.dest.lng], { icon: pin(Lf, '📍', '#9fd3f0', 40), title: data.dest.label }).bindPopup(popup('Destination', data.dest.label)).addTo(g);
      bounds.push([data.dest.lat, data.dest.lng]);
    }
    if (bounds.length > 1) m.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    else if (bounds.length === 1) m.setView(bounds[0], 13);
  }, [ready, data]);

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-3xl border-2 border-se-charcoal/10 shadow-[0_6px_0_rgb(59_54_51/0.08)]">
      <div ref={el} className="se-map absolute inset-0" role="application" aria-label="Interactive travel map" />
      {!ready && !loadFailed && <div className="absolute inset-0 grid animate-pulse place-items-center bg-se-sky/30 font-bold">🗺️ Loading map…</div>}
      {(loadFailed || tilesFailed) && (
        <p role="status" className="absolute inset-x-3 top-3 z-[500] rounded-2xl bg-white/95 px-3 py-2 text-sm font-semibold shadow">
          🗺️ The map service isn&apos;t responding right now. Your trip options, deals, and travel buddies still work.
        </p>
      )}
    </div>
  );
}
