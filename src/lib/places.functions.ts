import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

function gatewayHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lovableKey || !mapsKey) throw new Error("Conexão Google Maps não configurada.");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": mapsKey,
    "Content-Type": "application/json",
  };
}

async function readError(response: Response): Promise<never> {
  const body = await response.text();
  if (response.status === 403) {
    throw new Error(`Google Maps recusou a requisição (403): ${body}`);
  }
  throw new Error(`Falha na busca de endereços [${response.status}]: ${body}`);
}

export type PlaceSuggestion = { placeId: string; primary: string; secondary: string };

/** Limites da cidade de São Paulo (retângulo de restrição). */
const SP_RECT = {
  rectangle: {
    low: { latitude: -24.0088, longitude: -46.8272 },
    high: { latitude: -23.3565, longitude: -46.365 },
  },
};

function isInSaoPaulo(lat: number, lng: number): boolean {
  return (
    lat >= SP_RECT.rectangle.low.latitude &&
    lat <= SP_RECT.rectangle.high.latitude &&
    lng >= SP_RECT.rectangle.low.longitude &&
    lng <= SP_RECT.rectangle.high.longitude
  );
}

export const searchAddresses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query: string }) => {
    const query = String(input?.query ?? "").trim();
    if (query.length < 3 || query.length > 200) throw new Error("Consulta inválida");
    return { query };
  })
  .handler(async ({ data }): Promise<PlaceSuggestion[]> => {
    const response = await fetch(`${GATEWAY_URL}/places/v1/places:autocomplete`, {
      method: "POST",
      headers: gatewayHeaders(),
      body: JSON.stringify({
        input: data.query,
        languageCode: "pt-BR",
        regionCode: "BR",
        includedRegionCodes: ["br"],
        locationRestriction: SP_RECT,
      }),
    });
    if (!response.ok) await readError(response);
    const json = (await response.json()) as {
      suggestions?: {
        placePrediction?: {
          placeId?: string;
          structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
          text?: { text?: string };
        };
      }[];
    };
    return (json.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
      .slice(0, 6)
      .map((p) => ({
        placeId: p.placeId!,
        primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        secondary: p.structuredFormat?.secondaryText?.text ?? "",
      }));
  });

export type PlaceDetails = {
  address: string;
  neighborhood: string | null;
  lat: number;
  lng: number;
};

export const getPlaceDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { placeId: string }) => {
    const placeId = String(input?.placeId ?? "").trim();
    if (!/^[A-Za-z0-9_=-]{5,600}$/.test(placeId)) throw new Error("Local inválido");
    return { placeId };
  })
  .handler(async ({ data }): Promise<PlaceDetails> => {
    const headers = gatewayHeaders();
    const response = await fetch(
      `${GATEWAY_URL}/places/v1/places/${encodeURIComponent(data.placeId)}?languageCode=pt-BR`,
      {
        headers: {
          ...headers,
          "X-Goog-FieldMask": "formattedAddress,location,addressComponents",
        },
      },
    );
    if (!response.ok) await readError(response);
    const json = (await response.json()) as {
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      addressComponents?: { longText?: string; types?: string[] }[];
    };
    const lat = json.location?.latitude;
    const lng = json.location?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") {
      throw new Error("Não foi possível obter as coordenadas do endereço.");
    }
    const comps = json.addressComponents ?? [];
    const neighborhood =
      comps.find((c) => c.types?.includes("sublocality_level_1"))?.longText ??
      comps.find((c) => c.types?.includes("sublocality"))?.longText ??
      comps.find((c) => c.types?.includes("neighborhood"))?.longText ??
      null;
    return {
      address: json.formattedAddress ?? "",
      neighborhood,
      lat,
      lng,
    };
  });

export type DrivingRoute = { distanceKm: number; durationMinutes: number };

/** Distância real por vias (Routes API), usada para precificar a corrida. */
export const getDrivingRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { originLat: number; originLng: number; destLat: number; destLng: number }) => {
    const nums = [input?.originLat, input?.originLng, input?.destLat, input?.destLng];
    if (nums.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
      throw new Error("Coordenadas inválidas");
    }
    return {
      originLat: input.originLat,
      originLng: input.originLng,
      destLat: input.destLat,
      destLng: input.destLng,
    };
  })
  .handler(async ({ data }): Promise<DrivingRoute> => {
    const response = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: {
        ...gatewayHeaders(),
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: data.originLat, longitude: data.originLng } } },
        destination: { location: { latLng: { latitude: data.destLat, longitude: data.destLng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        languageCode: "pt-BR",
        regionCode: "BR",
        units: "METRIC",
      }),
    });
    if (!response.ok) await readError(response);
    const json = (await response.json()) as {
      routes?: { distanceMeters?: number; duration?: string }[];
    };
    const route = json.routes?.[0];
    if (!route?.distanceMeters) throw new Error("Não foi possível calcular a rota por vias.");
    const seconds = Number(String(route.duration ?? "0s").replace("s", "")) || 0;
    return {
      distanceKm: Math.max(0.5, Math.round((route.distanceMeters / 1000) * 10) / 10),
      durationMinutes: Math.max(1, Math.round(seconds / 60)),
    };
  });
