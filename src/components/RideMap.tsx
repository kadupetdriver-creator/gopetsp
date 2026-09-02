import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type RideMapProps = {
  origin: [number, number];
  destination: [number, number];
  driver?: [number, number] | null;
  className?: string;
};

/**
 * Mapa do trajeto com OpenStreetMap. O Leaflet é carregado só no navegador.
 */
export function RideMap({ origin, destination, driver, className }: RideMapProps) {
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
          scrollWheelZoom: false,
          attributionControl: true,
        }).setView(origin, 13);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: "© OpenStreetMap",
        }).addTo(mapRef.current);
        layersRef.current = L.layerGroup().addTo(mapRef.current);
      }

      const map = mapRef.current;
      const layers = layersRef.current!;
      layers.clearLayers();

      const pin = (emoji: string, color: string) =>
        L.divIcon({
          className: "",
          html: `<span style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9999px;background:${color};box-shadow:0 4px 12px rgba(0,0,0,.25);font-size:16px">${emoji}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

      L.marker(origin, { icon: pin("🏠", "#ffffff"), title: "Embarque" })
        .bindPopup("Embarque")
        .addTo(layers);
      L.marker(destination, { icon: pin("🏁", "#ffffff"), title: "Destino" })
        .bindPopup("Destino")
        .addTo(layers);
      L.polyline([origin, destination], {
        color: "#111111",
        weight: 4,
        opacity: 0.65,
        dashArray: "8 10",
      }).addTo(layers);

      const points: [number, number][] = [origin, destination];
      if (driver) {
        L.marker(driver, { icon: pin("🚐", "#facc15"), title: "Motorista" })
          .bindPopup("Motorista")
          .addTo(layers);
        points.push(driver);
      }

      map.fitBounds(L.latLngBounds(points).pad(0.35), { animate: false });
      setTimeout(() => map.invalidateSize(), 60);
    })();

    return () => {
      cancelled = true;
    };
  }, [origin, destination, driver]);

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
      aria-label="Mapa do trajeto da corrida"
      className={className ?? "h-72 w-full rounded-2xl border border-border sm:h-96"}
    />
  );
}

export default RideMap;
