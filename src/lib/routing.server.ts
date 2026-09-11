/** Cálculo de distância por vias (server-only). */

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export type DrivingDistance = { distanceKm: number; durationMinutes: number };

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Distância real por vias (Google Routes API). Se a rota falhar, usa a
 * aproximação geográfica com fator de 1,35 — mesma regra já usada antes.
 */
export async function drivingDistance(
  origin: [number, number],
  destination: [number, number],
  stops: [number, number][] = [],
): Promise<DrivingDistance> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
  if (lovableKey && mapsKey) {
    try {
      const response = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": mapsKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin[0], longitude: origin[1] } } },
          destination: {
            location: { latLng: { latitude: destination[0], longitude: destination[1] } },
          },
          intermediates: stops.map((s) => ({
            location: { latLng: { latitude: s[0], longitude: s[1] } },
          })),
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          languageCode: "pt-BR",
          regionCode: "BR",
          units: "METRIC",
        }),
      });
      if (response.ok) {
        const json = (await response.json()) as {
          routes?: { distanceMeters?: number; duration?: string }[];
        };
        const route = json.routes?.[0];
        if (route?.distanceMeters) {
          const seconds = Number(String(route.duration ?? "0s").replace("s", "")) || 0;
          return {
            distanceKm: Math.max(0.5, Math.round((route.distanceMeters / 1000) * 10) / 10),
            durationMinutes: Math.max(1, Math.round(seconds / 60)),
          };
        }
      }
    } catch {
      // cai no fallback abaixo
    }
  }
  const path: [number, number][] = [origin, ...stops, destination];
  const raw = path
    .slice(1)
    .reduce((sum, point, i) => sum + haversineKm(path[i]!, point), 0);
  const approx = Math.max(1, Math.round(raw * 1.35 * 10) / 10);
  return { distanceKm: approx, durationMinutes: Math.max(5, Math.round((approx / 22) * 60)) };
}
