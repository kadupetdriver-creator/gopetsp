import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RideMap } from "@/components/RideMap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSharedRide } from "@/lib/tracking.functions";
import {
  coordsFor,
  estimateMinutes,
  formatDateTime,
  statusLabels,
  statusStyles,
  type RideStatus,
} from "@/lib/rides";

export const Route = createFileRoute("/acompanhar/$token")({
  head: () => ({
    meta: [
      { title: "Acompanhar corrida do pet | GoPet" },
      {
        name: "description",
        content:
          "Acompanhe em tempo real o transporte do pet em São Paulo: status da corrida, trajeto e posição do motorista.",
      },
      { property: "og:title", content: "Acompanhar corrida do pet | GoPet" },
      {
        property: "og:description",
        content: "Status e posição do motorista durante o transporte do pet.",
      },
    ],
  }),
  component: AcompanharPage,
  errorComponent: () => (
    <p className="p-8 text-center text-sm text-muted-foreground">
      Não foi possível carregar este acompanhamento.
    </p>
  ),
  notFoundComponent: () => (
    <p className="p-8 text-center text-sm text-muted-foreground">Link não encontrado.</p>
  ),
});

function AcompanharPage() {
  const { token } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["shared-ride", token],
    queryFn: () => getSharedRide({ data: { token } }),
    refetchInterval: 15000,
  });

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Carregando corrida…</p>;
  }

  const ride = data?.ride;
  if (!ride) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        {data?.error ?? "Link inválido."}
      </p>
    );
  }

  const status = ride.status as RideStatus;
  const origin = coordsFor(ride.origin_neighborhood, ride.origin_lat, ride.origin_lng);
  const destination = coordsFor(
    ride.destination_neighborhood,
    ride.destination_lat,
    ride.destination_lng,
  );
  const driver =
    typeof ride.driver_lat === "number" && typeof ride.driver_lng === "number"
      ? ([ride.driver_lat, ride.driver_lng] as [number, number])
      : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">Acompanhamento da corrida</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Transporte de {ride.pet_name} · {ride.origin_neighborhood} →{" "}
          {ride.destination_neighborhood}
        </p>
      </div>

      <span
        className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${statusStyles[status]}`}
      >
        {statusLabels[status]}
      </span>

      <RideMap origin={origin} destination={destination} driver={driver} />

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-lg">Detalhes</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <p>Distância estimada: {ride.distance_km} km</p>
          <p>Tempo estimado: {estimateMinutes(Number(ride.distance_km))} min</p>
          <p>Horário combinado: {formatDateTime(ride.scheduled_at)}</p>
          <p>
            Última atualização:{" "}
            {ride.location_updated_at ? formatDateTime(ride.location_updated_at) : "—"}
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Este link mostra apenas o andamento do transporte. Nenhum dado pessoal do tutor ou do
        motorista é exibido.
      </p>
    </div>
  );
}
