import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  distanceKmBetween,
  estimatePriceCents,
  formatBRL,
  petSizes,
  serviceTypes,
} from "@/lib/rides";
import { AddressAutocomplete, type SelectedPlace } from "@/components/AddressAutocomplete";
import { RideMap } from "@/components/RideMap";

export const Route = createFileRoute("/solicitar")({
  head: () => ({
    meta: [
      { title: "Solicitar transporte do pet em São Paulo | PetMobi" },
      {
        name: "description",
        content:
          "Peça uma corrida para levar seu pet ao veterinário, banho e tosa, creche ou aeroporto em São Paulo com preço estimado na hora.",
      },
      { property: "og:title", content: "Solicitar transporte do pet | PetMobi" },
      {
        property: "og:description",
        content: "Corrida pet em São Paulo com motoristas parceiros verificados.",
      },
    ],
  }),
  component: SolicitarPage,
});

function SolicitarPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [petName, setPetName] = useState("");
  const [petSize, setPetSize] = useState("medio");
  const [serviceType, setServiceType] = useState("veterinario");
  const [originAddress, setOriginAddress] = useState("");
  const [origin, setOrigin] = useState<SelectedPlace | null>(null);
  const [destinationAddress, setDestinationAddress] = useState("");
  const [destination, setDestination] = useState<SelectedPlace | null>(null);
  const [scheduledAt, setScheduledAt] = useState(defaultDateTime());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
    if (!loading && profile?.role === "driver") void navigate({ to: "/motorista" });
  }, [loading, user, profile, navigate]);

  const { data: pets } = useQuery({
    queryKey: ["pets", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pets")
        .select("id, name, size")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const originPoint: [number, number] | null = origin ? [origin.lat, origin.lng] : null;
  const destinationPoint: [number, number] | null = destination
    ? [destination.lat, destination.lng]
    : null;
  // Fator simples para aproximar distância em linha reta da distância por vias.
  const distance =
    originPoint && destinationPoint
      ? Math.max(1, Math.round(distanceKmBetween(originPoint, destinationPoint) * 1.35 * 10) / 10)
      : 0;
  const routeReady = !!originPoint && !!destinationPoint;
  const price = estimatePriceCents(distance, petSize);

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sessão expirada");
      if (!origin || !destination) throw new Error("Selecione origem e destino nas sugestões");
      const { error } = await supabase.from("rides").insert({
        tutor_id: user.id,
        pet_name: petName,
        pet_size: petSize,
        service_type: serviceType,
        origin_address: origin.address,
        origin_neighborhood: origin.neighborhood,
        origin_lat: origin.lat,
        origin_lng: origin.lng,
        destination_address: destination.address,
        destination_neighborhood: destination.neighborhood,
        destination_lat: destination.lat,
        destination_lng: destination.lng,
        scheduled_at: new Date(scheduledAt).toISOString(),
        notes: notes || null,
        distance_km: distance,
        price_cents: price,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Chamada enviada! Estamos procurando um motorista parceiro.");
      void qc.invalidateQueries({ queryKey: ["rides"] });
      void navigate({ to: "/minhas-corridas" });
    },
    onError: () => toast.error("Não conseguimos enviar a chamada. Tente novamente."),
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-semibold">Solicitar corrida</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Conte pra gente o trajeto e cuidamos do resto — motoristas verificados e caixa de transporte
        higienizada.
      </p>

      <form
        className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="space-y-6">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-lg">Sobre o pet</CardTitle>
              <CardDescription>Usaremos essas informações para preparar o veículo.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="petName">Nome do pet</Label>
                <Input
                  id="petName"
                  value={petName}
                  onChange={(e) => setPetName(e.target.value)}
                  placeholder="Nina"
                  required
                  list="pets-salvos"
                />
                <datalist id="pets-salvos">
                  {pets?.map((p) => <option key={p.id} value={p.name} />)}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label>Porte</Label>
                <Select value={petSize} onValueChange={setPetSize}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {petSizes.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Motivo da viagem</Label>
                <Select value={serviceType} onValueChange={setServiceType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceTypes.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-lg">Trajeto em São Paulo</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <AddressAutocomplete
                  label="Endereço de embarque"
                  placeholder="Rua dos Pinheiros, 500 - São Paulo"
                  value={originAddress}
                  onValueChange={(v) => {
                    setOriginAddress(v);
                    setOrigin(null);
                  }}
                  onSelect={setOrigin}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <AddressAutocomplete
                  label="Endereço de destino"
                  placeholder="Clínica veterinária, Rua Domingos de Morais, 1200"
                  value={destinationAddress}
                  onValueChange={(v) => {
                    setDestinationAddress(v);
                    setDestination(null);
                  }}
                  onSelect={setDestination}
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="quando">Data e horário</Label>
                <Input
                  id="quando"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  required
                />
              </div>
              {routeReady ? (
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm text-muted-foreground">
                    Distância estimada pela rota: <strong>{distance} km</strong>
                  </p>
                  <RideMap
                    origin={originPoint!}
                    destination={destinationPoint!}
                    className="h-56 w-full rounded-2xl border border-border sm:h-72"
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  Escolha os endereços nas sugestões do mapa para calcularmos rota e valor.
                </p>
              )}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="obs">Observações para o motorista</Label>
                <Textarea
                  id="obs"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Nina fica ansiosa no carro, prefere caixa coberta."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-lg">Resumo da corrida</CardTitle>
              <CardDescription>Valor estimado, confirmado ao aceitar a chamada.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl bg-gradient-warm p-5 text-primary-foreground">
                <p className="text-xs uppercase tracking-wide opacity-80">Estimativa</p>
                <p className="mt-1 text-3xl font-semibold">{formatBRL(price)}</p>
                <p className="mt-1 text-xs opacity-90">
                  {routeReady ? `${distance} km` : "— km"} · {petSizes.find((s) => s.value === petSize)?.label}
                </p>
              </div>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary-ink" />
                <span>
                  {origin?.neighborhood ?? origin?.address ?? "Origem"} →{" "}
                  {destination?.neighborhood ?? destination?.address ?? "Destino"}
                </span>
              </div>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary-ink" />
                <span>Motoristas com curso de manejo animal e veículo higienizado.</span>
              </div>
              <Button type="submit" className="w-full" disabled={create.isPending || !routeReady}>
                {create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Chamar motorista
              </Button>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}

function defaultDateTime() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
