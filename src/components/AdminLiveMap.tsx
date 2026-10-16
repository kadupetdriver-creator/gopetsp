import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type LiveDriver = {
  rideId: string;
  driverName: string;
  petName: string;
  status: string;
  lat: number;
  lng: number;
  updatedAt: string | null;
};

export type AdminLiveMapProps = {
  drivers: LiveDriver[];
  className?: string;
};

const SP_CENTER: [number, number] = [-23.55, -46.63];

/** Mapa da administração com a posição ao vivo de todos os motoristas em corrida. */
export function AdminLiveMap({ drivers, className }: AdminLiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layersRef = useRef<import("leaflet").LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          scrollWheelZoom: true,
          attributionControl: true,
        }).setView(SP_CENTER, 11);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: "© OpenStreetMap",
        }).addTo(mapRef.current);
        layersRef.current = L.layerGroup().addTo(mapRef.current);
      }

      const map = mapRef.current;
      const layers = layersRef.current!;
      layers.clearLayers();

      const points: [number, number][] = [];
      for (const d of drivers) {
        const icon = L.divIcon({
          className: "",
          html: `<span style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9999px;background:#facc15;box-shadow:0 4px 12px rgba(0,0,0,.3);font-size:17px">🚐</span>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        L.marker([d.lat, d.lng], { icon, title: d.driverName })
          .bindPopup(
            `<strong>${d.driverName}</strong><br/>Pet: ${d.petName}<br/>Status: ${d.status}`,
          )
          .addTo(layers);
        points.push([d.lat, d.lng]);
      }

      if (points.length > 0) {
        map.fitBounds(L.latLngBounds(points).pad(0.3), { animate: false });
      }
      setTimeout(() => map.invalidateSize(), 60);
    })();

    return () => {
      cancelled = true;
    };
  }, [drivers]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Mapa ao vivo dos motoristas"
      className={className ?? "h-[28rem] w-full rounded-2xl border border-border"}
    />
  );
}

export default AdminLiveMap;
