import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

/** Restrição de busca: cidade de São Paulo. */
const SAO_PAULO_CIRCLE = {
  center: { latitude: -23.5613, longitude: -46.6565 },
  radius: 30000,
};

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

function isSaoPauloCity(components: { longText?: string; types?: string[] }[]) {
  const locality =
    components.find((c) => c.types?.includes("locality"))?.longText ??
    components.find((c) => c.types?.includes("administrative_area_level_2"))?.longText ??
    "";
  return locality.trim().toLowerCase() === "são paulo";
}

export type PlaceSuggestion = { placeId: string; primary: string; secondary: string };

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
        locationRestriction: { circle: SAO_PAULO_CIRCLE },
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
      comps.find((c) => c.types?.includes("administrative_area_level_2"))?.longText ??
      null;
    return {
      address: json.formattedAddress ?? "",
      neighborhood,
      lat,
      lng,
    };
  });
