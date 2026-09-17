import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculateRidePrice } from "./pricing";
import { addressHasNumber } from "./address";


type Point = { lat: number; lng: number };

function validPoint(p: unknown): Point {
  const v = p as Point | undefined;
  if (
    !v ||
    typeof v.lat !== "number" ||
    typeof v.lng !== "number" ||
    !Number.isFinite(v.lat) ||
    !Number.isFinite(v.lng) ||
    Math.abs(v.lat) > 90 ||
    Math.abs(v.lng) > 180
  ) {
    throw new Error("Coordenadas inválidas");
  }
  return { lat: v.lat, lng: v.lng };
}

function validPetIds(ids: unknown): string[] {
  const list = Array.isArray(ids) ? ids.map((i) => String(i)) : [];
  const unique = [...new Set(list)];
  if (unique.length === 0) throw new Error("Selecione ao menos um pet cadastrado");
  if (unique.length > 3) throw new Error("Máximo de 3 pets por corrida");
  if (unique.some((id) => !/^[0-9a-fA-F-]{36}$/.test(id))) throw new Error("Pet inválido");
  return unique;
}

/** Busca os pets do tutor autenticado (RLS garante que são dele) e valida a posse. */
async function loadOwnedPets(
  supabase: { from: (t: string) => any },
  userId: string,
  petIds: string[],
) {
  const { data, error } = await supabase
    .from("pets")
    .select("id, name, size, owner_id")
    .in("id", petIds);
  if (error) throw new Error(error.message);
  const pets = (data ?? []) as { id: string; name: string; size: string; owner_id: string }[];
  if (pets.length !== petIds.length || pets.some((p) => p.owner_id !== userId)) {
    throw new Error("Um ou mais pets selecionados não pertencem a você.");
  }
  return pets;
}

export type RideExtrasInput = {
  scheduledAt: string;
  hasReturn: boolean;
  returnScheduledAt: string | null;
  driverWaits: boolean;
};

/** Valida agendamento, retorno e espera enviados pelo cliente. */
function validExtras(input: Partial<RideExtrasInput> | undefined) {
  const scheduled = new Date(String(input?.scheduledAt ?? ""));
  if (Number.isNaN(scheduled.getTime())) throw new Error("Data e horário inválidos");
  const hasReturn = input?.hasReturn === true;
  let returnAt: Date | null = null;
  if (hasReturn) {
    returnAt = new Date(String(input?.returnScheduledAt ?? ""));
    if (Number.isNaN(returnAt.getTime())) throw new Error("Informe o horário do retorno");
    if (returnAt.getTime() <= scheduled.getTime()) {
      throw new Error("O horário do retorno deve ser depois da ida");
    }
  }
  return {
    scheduledAt: scheduled.toISOString(),
    hasReturn,
    returnScheduledAt: returnAt ? returnAt.toISOString() : null,
    driverWaits: hasReturn && input?.driverWaits === true,
  };
}

/** Minutos de espera do motorista entre a ida e o retorno. */
function waitingMinutesFor(extras: ReturnType<typeof validExtras>): number {
  if (!extras.hasReturn || !extras.driverWaits || !extras.returnScheduledAt) return 0;
  const gap =
    (new Date(extras.returnScheduledAt).getTime() - new Date(extras.scheduledAt).getTime()) / 60000;
  return Math.max(0, Math.ceil(gap));
}

export type StopInput = Point & { address: string };

/** Valida as paradas intermediárias (no máximo 3). */
function validStops(input: unknown): (Point & { address: string })[] {
  const list = Array.isArray(input) ? input : [];
  if (list.length > 3) throw new Error("Máximo de 3 paradas por corrida");
  return list.map((s) => {
    const point = validPoint(s);
    const address = String((s as StopInput)?.address ?? "").trim();
    if (!address) throw new Error("Informe o endereço da parada");
    return { ...point, address: address.slice(0, 300) };
  });
}

export type RideQuote = {
  distanceKm: number;
  durationMinutes: number;
  priceCents: number;
  oneWayCents: number;
  returnFeeCents: number;
  waitingFeeCents: number;
  waitingMinutes: number;
  trunkFeeCents: number;
  groupSize: string;
  petCount: number;
};

/** Orçamento oficial da corrida: distância por vias e preço calculados no backend. */
export const quoteRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      origin: Point;
      destination: Point;
      stops?: StopInput[];
      petIds: string[];
      needsTrunk: boolean;
    } & Partial<RideExtrasInput>) => ({
      origin: validPoint(input?.origin),
      destination: validPoint(input?.destination),
      stops: validStops(input?.stops),
      petIds: validPetIds(input?.petIds),
      needsTrunk: input?.needsTrunk === true,
      extras: validExtras(input),
    }),
  )
  .handler(async ({ data, context }): Promise<RideQuote> => {
    const pets = await loadOwnedPets(context.supabase as any, context.userId, data.petIds);
    const { drivingDistance } = await import("./routing.server");
    const route = await drivingDistance(
      [data.origin.lat, data.origin.lng],
      [data.destination.lat, data.destination.lng],
      data.stops.map((s) => [s.lat, s.lng] as [number, number]),
    );
    const price = calculateRidePrice(
      route.distanceKm,
      pets.map((p) => p.size),
      data.needsTrunk,
      {
        hasReturn: data.extras.hasReturn,
        waitingMinutes: waitingMinutesFor(data.extras),
      },
      route.durationMinutes,
    );
    return {
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
      ...price,
    };
  });


export type CreateRideInput = {
  origin: Point & { address: string; neighborhood: string | null };
  destination: Point & { address: string; neighborhood: string | null };
  stops?: StopInput[];
  petIds: string[];
  serviceType: string;
  scheduledAt: string;
  notes: string | null;
  needsTrunk: boolean;
  hasReturn?: boolean;
  returnScheduledAt?: string | null;
  driverWaits?: boolean;
};


const SERVICE_TYPES = ["veterinario", "banho_tosa", "creche", "aeroporto", "outro"];

/**
 * Cria a corrida. O cliente NÃO envia preço nem distância: ambos são
 * calculados aqui, a partir dos pets validados e da rota real por vias.
 */
export const createRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CreateRideInput) => {
    const origin = validPoint(input?.origin);
    const destination = validPoint(input?.destination);
    const originAddress = String(input?.origin?.address ?? "").trim();
    const destinationAddress = String(input?.destination?.address ?? "").trim();
    if (!originAddress || !destinationAddress) throw new Error("Informe origem e destino");
    if (!addressHasNumber(originAddress) || !addressHasNumber(destinationAddress)) {
      throw new Error("Informe o número nos endereços. Se não houver número, escreva S/N.");
    }
    const serviceType = String(input?.serviceType ?? "");
    if (!SERVICE_TYPES.includes(serviceType)) throw new Error("Motivo da viagem inválido");
    const extras = validExtras(input);
    const notes = input?.notes ? String(input.notes).slice(0, 1000) : null;

    const stops = validStops(input?.stops);
    if (stops.some((s) => !addressHasNumber(s.address))) {
      throw new Error("Informe o número em todas as paradas. Se não houver número, escreva S/N.");
    }

    return {
      origin: { ...origin, address: originAddress.slice(0, 300), neighborhood: input?.origin?.neighborhood ?? null },
      destination: {
        ...destination,
        address: destinationAddress.slice(0, 300),
        neighborhood: input?.destination?.neighborhood ?? null,
      },
      stops,
      petIds: validPetIds(input?.petIds),
      serviceType,
      scheduledAt: extras.scheduledAt,
      notes,
      needsTrunk: input?.needsTrunk === true,
      extras,
    };

  })

  .handler(
    async ({
      data,
      context,
    }): Promise<{
      rideId: string;
      priceCents: number;
      returnRideId: string | null;
      returnPriceCents: number;
    }> => {
      const { data: me } = await context.supabase
        .from("profiles")
        .select("is_active")
        .eq("id", context.userId)
        .maybeSingle();
      if (me && me.is_active === false) {
        throw new Error("Sua conta está desativada. Fale com o suporte GoPet.");
      }
      const pets = await loadOwnedPets(context.supabase as any, context.userId, data.petIds);
      const { drivingDistance } = await import("./routing.server");
      const route = await drivingDistance(
        [data.origin.lat, data.origin.lng],
        [data.destination.lat, data.destination.lng],
        data.stops.map((s) => [s.lat, s.lng] as [number, number]),
      );

      // Retorno sem espera do motorista: a viagem vira DUAS corridas independentes
      // (ida e volta), para que motoristas diferentes possam aceitar cada uma.
      const splitReturn = data.extras.hasReturn && !data.extras.driverWaits;

      const price = calculateRidePrice(route.distanceKm, pets.map((p) => p.size), data.needsTrunk, {
        hasReturn: splitReturn ? false : data.extras.hasReturn,
        waitingMinutes: waitingMinutesFor(data.extras),
      }, route.durationMinutes);

      // Saldo obrigatório: sem saldo suficiente a corrida nem é criada.
      // Retorno dividido (sem espera) gera uma segunda corrida do mesmo valor.
      const totalRequiredCents = price.priceCents * (splitReturn ? 2 : 1);
      const { data: balance } = await context.supabase.rpc("my_credit_balance_cents");
      const balanceCents = typeof balance === "number" ? balance : 0;
      if (balanceCents < totalRequiredCents) {
        const reais = (totalRequiredCents / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });
        throw new Error(
          `Saldo insuficiente. Esta corrida custa ${reais} — insira saldo GoPet com a nossa central antes de solicitar.`,
        );
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // ordena os nomes seguindo a mesma ordem de precificação (maior porte primeiro)
      const orderedPets = [...pets].sort(
        (a, b) =>
          ["pequeno", "medio", "grande"].indexOf(b.size) -
          ["pequeno", "medio", "grande"].indexOf(a.size),
      );

      const baseRow = {
        tutor_id: context.userId,
        pet_id: orderedPets[0]?.id ?? null,
        pet_name: orderedPets.map((p) => p.name).join(", "),
        pet_size: price.groupSize,
        service_type: data.serviceType,
        notes: data.notes,
        distance_km: route.distanceKm,
        needs_trunk: data.needsTrunk,
        trunk_fee_cents: price.trunkFeeCents,
      };

      const insertRide = async (row: Record<string, unknown>) => {
        const { data: created, error } = await supabaseAdmin
          .from("rides")
          .insert(row as never)
          .select("id")
          .single();
        if (error || !created) throw new Error(error?.message ?? "Não foi possível criar a corrida");
        const rideId = created.id as string;
        const { error: linkError } = await supabaseAdmin
          .from("ride_pets")
          .insert(orderedPets.map((p) => ({ ride_id: rideId, pet_id: p.id })));
        if (linkError) {
          await supabaseAdmin.from("rides").delete().eq("id", rideId);
          throw new Error(linkError.message);
        }
        return rideId;
      };

      const rideId = await insertRide({
        ...baseRow,
        origin_address: data.origin.address,
        origin_neighborhood: data.origin.neighborhood,
        origin_lat: data.origin.lat,
        origin_lng: data.origin.lng,
        destination_address: data.destination.address,
        destination_neighborhood: data.destination.neighborhood,
        destination_lat: data.destination.lat,
        destination_lng: data.destination.lng,
        stops: data.stops,
        scheduled_at: data.scheduledAt,
        price_cents: price.priceCents,
        has_return: splitReturn ? false : data.extras.hasReturn,
        return_scheduled_at: splitReturn ? null : data.extras.returnScheduledAt,
        return_fee_cents: price.returnFeeCents,
        driver_waits: data.extras.driverWaits,
        waiting_minutes: price.waitingMinutes,
        waiting_fee_cents: price.waitingFeeCents,
      });

      let returnRideId: string | null = null;
      if (splitReturn) {
        returnRideId = await insertRide({
          ...baseRow,
          origin_address: data.destination.address,
          origin_neighborhood: data.destination.neighborhood,
          origin_lat: data.destination.lat,
          origin_lng: data.destination.lng,
          destination_address: data.origin.address,
          destination_neighborhood: data.origin.neighborhood,
          destination_lat: data.origin.lat,
          destination_lng: data.origin.lng,
          stops: [...data.stops].reverse(),
          scheduled_at: data.extras.returnScheduledAt ?? data.scheduledAt,
          price_cents: price.priceCents,
          has_return: false,
          return_scheduled_at: null,
          return_fee_cents: 0,
          driver_waits: false,
          waiting_minutes: 0,
          waiting_fee_cents: 0,
          return_of_ride_id: rideId,
        });
      }

      return {
        rideId,
        priceCents: price.priceCents,
        returnRideId,
        returnPriceCents: returnRideId ? price.priceCents : 0,
      };
    },
  );


export const getRideDriverDetails = createServerFn({ method: "GET" })
  .inputValidator((data: { rideId: string }) => {
    if (!data?.rideId || typeof data.rideId !== "string") {
      throw new Error("Corrida inválida.");
    }
    return { rideId: data.rideId };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("ride_counterpart_contact", {
      _ride_id: data.rideId,
    });
    if (error) throw new Error("Não foi possível carregar os dados do motorista.");
    const row = (rows ?? [])[0] as
      | {
          full_name: string | null;
          avatar_path: string | null;
          vehicle_plate: string | null;
          vehicle_model: string | null;
          vehicle_brand: string | null;
          vehicle_color: string | null;
        }
      | undefined;
    if (!row) return null;

    let avatarUrl: string | null = null;
    if (row.avatar_path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed } = await supabaseAdmin.storage
        .from("driver-documents")
        .createSignedUrl(row.avatar_path, 60 * 60);
      avatarUrl = signed?.signedUrl ?? null;
    }

    return {
      fullName: row.full_name,
      avatarUrl,
      vehiclePlate: row.vehicle_plate,
      vehicleModel: row.vehicle_model,
      vehicleBrand: row.vehicle_brand,
      vehicleColor: row.vehicle_color,
    };
  });
