import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { dispatchRideToCentral } from "@/lib/whatsapp.functions";
import { createRide, getPreferredDrivers, quoteRide } from "@/lib/rides.functions";


import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Car, Loader2, MapPin, PawPrint, Plus, ShieldCheck, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  formatBRL,
  petSizes,
  serviceTypes,
} from "@/lib/rides";
import { addressHasNumber } from "@/lib/address";
import { AddressAutocomplete, type SelectedPlace } from "@/components/AddressAutocomplete";

import { RideMap } from "@/components/RideMap";
import { ActiveRideTracker } from "@/components/ActiveRideTracker";
import { PetPhoto } from "@/components/PetPhoto";

type PetItem = {
  id: string;
  name: string;
  size: string;
  species: string;
  breed: string | null;
  photo_url: string | null;
};

type PetSelectorProps = {
  pets: PetItem[] | undefined;
  selectedIds: string[];
  toggle: (id: string) => void;
  maxPets: number;
};

function PetSelector({ pets, selectedIds, toggle, maxPets }: PetSelectorProps) {
  const selected = (pets ?? []).filter((p) => selectedIds.includes(p.id));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>
          SELECIONAR PET CADASTRADO <span className="text-destructive">*</span>
        </Label>
        <span
          className={`text-xs font-medium ${
            selectedIds.length >= maxPets ? "text-primary-ink" : "text-muted-foreground"
          }`}
        >
          {selectedIds.length} de {maxPets} selecionados
        </span>
      </div>
      <div className="rounded-lg bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wide text-primary-ink">
        <div className="flex items-center gap-2">
          <PawPrint className="size-4 shrink-0" />
          <span className="normal-case">Capacidade máxima do veículo:</span>
        </div>
        <ul className="mt-1 list-disc pl-6 normal-case">
          <li>1 pet + 2 pessoas</li>
          <li>2 pets + 1 pessoa</li>
          <li>3 pets</li>
        </ul>
        <p className="mt-1 font-extrabold normal-case">
          Cobrança adicional por passageiro ou excesso de bagagem.
        </p>
      </div>
      {pets && pets.length > 0 ? (
        <div className="grid max-h-[55vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {pets.map((p) => {
            const active = selectedIds.includes(p.id);
            const blocked = !active && selectedIds.length >= maxPets;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                disabled={blocked}
                onClick={() => toggle(p.id)}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                  active ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                } ${blocked ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <PetPhoto
                  path={p.photo_url}
                  petName={p.name}
                  imgClassName="size-10 shrink-0 rounded-lg object-cover"
                  fallbackClassName="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary-ink"
                  iconClassName="size-4"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[p.breed, petSizes.find((s) => s.value === p.size)?.label]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {active ? (
                  <X className="ml-auto size-4 text-muted-foreground" />
                ) : (
                  <Plus className="ml-auto size-4 text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Você ainda não cadastrou pets.{" "}
          <a href="/perfil" className="font-medium text-primary-ink underline">
            Cadastre seu pet no seu perfil
          </a>{" "}
          para solicitar uma corrida.
        </p>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((p) => (
            <span
              key={p.id}
              className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
            >
              {p.name}
              <button
                type="button"
                aria-label={`Remover ${p.name} da corrida`}
                onClick={() => toggle(p.id)}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/solicitar")({

  head: () => ({
    meta: [
      { title: "Solicitar transporte do pet em São Paulo | GoPet" },
      {
        name: "description",
        content:
          "Peça uma corrida para levar seu pet ao veterinário, banho e tosa, creche ou aeroporto em São Paulo com preço estimado na hora.",
      },
      { property: "og:title", content: "Solicitar transporte do pet | GoPet" },
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
  const dispatchRide = useServerFn(dispatchRideToCentral);
  const fetchQuote = useServerFn(quoteRide);
  const submitRide = useServerFn(createRide);
  const fetchPreferredDrivers = useServerFn(getPreferredDrivers);



  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [serviceType, setServiceType] = useState("veterinario");
  const [originAddress, setOriginAddress] = useState("");
  const [origin, setOrigin] = useState<SelectedPlace | null>(null);
  const [destinationAddress, setDestinationAddress] = useState("");
  const [destination, setDestination] = useState<SelectedPlace | null>(null);
  const [stops, setStops] = useState<{ text: string; place: SelectedPlace | null }[]>([]);
  const [scheduledAt, setScheduledAt] = useState(defaultDateTime());
  const [notes, setNotes] = useState("");
  const [needsTrunk, setNeedsTrunk] = useState<boolean | null>(null);
  const [hasReturn, setHasReturn] = useState<boolean | null>(null);
  const [returnAt, setReturnAt] = useState("");
  const [driverWaits, setDriverWaits] = useState<boolean | null>(null);
  const [preferredDriverId, setPreferredDriverId] = useState("none");


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
        .select("id, name, size, species, breed, photo_url")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: preferredDrivers = [], isLoading: driversLoading } = useQuery({
    queryKey: ["preferred-drivers"],
    enabled: !!user,
    queryFn: () => fetchPreferredDrivers(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedPets = (pets ?? []).filter((p) => selectedPetIds.includes(p.id));

  // Bloqueia a rolagem da página até que o tutor selecione pelo menos um pet.
  useEffect(() => {
    if (pets !== undefined && selectedPets.length === 0) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [pets, selectedPets.length]);

  const maxPets = 3;
  const sizeRank = ["pequeno", "medio", "grande"];

  // Precificação: maior porte primeiro (grande > médio > pequeno).
  const groupSize =
    selectedPets.length > 0
      ? selectedPets.reduce(
          (acc, p) => (sizeRank.indexOf(p.size) > sizeRank.indexOf(acc) ? p.size : acc),
          "pequeno",
        )
      : "medio";
  const petCount = Math.max(1, selectedPets.length);
  const rideTitle = selectedPets.map((p) => p.name).join(", ");

  const togglePet = (id: string) => {
    setSelectedPetIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= maxPets) {
        toast.error(`Máximo de ${maxPets} pets por corrida.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const originPoint: [number, number] | null = origin ? [origin.lat, origin.lng] : null;
  const destinationPoint: [number, number] | null = destination
    ? [destination.lat, destination.lng]
    : null;

  const returnIsAfterDeparture =
    hasReturn !== true ||
    (!!returnAt &&
      !Number.isNaN(new Date(returnAt).getTime()) &&
      new Date(returnAt).getTime() > new Date(scheduledAt).getTime());

  const returnAnswered =
    hasReturn === false ||
    (hasReturn === true && !!returnAt && returnIsAfterDeparture && driverWaits !== null);

  const resolvedStops = stops
    .map((s) => s.place)
    .filter((p): p is SelectedPlace => !!p && !!p.address);
  const stopsReady = stops.every((s) => !!s.place);

  // Orçamento oficial: distância e preço são calculados e validados no backend.
  const quoteQuery = useQuery({
    queryKey: [
      "ride-quote",
      originPoint?.[0],
      originPoint?.[1],
      destinationPoint?.[0],
      destinationPoint?.[1],
      resolvedStops.map((s) => `${s.lat},${s.lng}`).join("|"),
      selectedPetIds.join(","),
      needsTrunk,
      scheduledAt,
      hasReturn,
      returnAt,
      driverWaits,
    ],
    enabled:
      !!originPoint &&
      !!destinationPoint &&
      stopsReady &&
      selectedPets.length > 0 &&
      needsTrunk !== null &&
      returnAnswered,
    staleTime: 60 * 1000,
    retry: false,
    queryFn: () =>
      fetchQuote({
        data: {
          origin: { lat: originPoint![0], lng: originPoint![1] },
          destination: { lat: destinationPoint![0], lng: destinationPoint![1] },
          stops: resolvedStops.map((s) => ({ lat: s.lat, lng: s.lng, address: s.address })),
          petIds: selectedPetIds,
          needsTrunk: needsTrunk === true,
          scheduledAt: new Date(scheduledAt).toISOString(),
          hasReturn: hasReturn === true,
          returnScheduledAt: hasReturn && returnAt ? new Date(returnAt).toISOString() : null,
          driverWaits: driverWaits === true,
        },
      }),
  });

  const distance = quoteQuery.data?.distanceKm ?? 0;
  const price = quoteQuery.data?.priceCents ?? 0;
  const mapReady = !!originPoint && !!destinationPoint;
  const routeReady = !!quoteQuery.data;

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sessão expirada");
      if (!origin || !destination) throw new Error("Selecione origem e destino nas sugestões");
      if (selectedPets.length === 0) throw new Error("Selecione ao menos um pet cadastrado");
      if (needsTrunk === null) throw new Error("Informe se deseja utilizar o porta-malas");
      if (hasReturn === null) throw new Error("Informe se haverá corrida de retorno");
      if (hasReturn && !returnAt) throw new Error("Informe o horário do retorno");
      if (hasReturn && !returnIsAfterDeparture)
        throw new Error("O horário do retorno deve ser depois da ida");
      if (hasReturn && driverWaits === null)
        throw new Error("Informe se o motorista deve aguardar no local");
      if (!stopsReady) throw new Error("Escolha as paradas nas sugestões de endereço");
      if (!addressHasNumber(origin.address) || !addressHasNumber(destination.address))

        throw new Error(
          "Informe o número nos endereços. Se não houver número, escreva S/N.",
        );
      if (resolvedStops.some((s) => !addressHasNumber(s.address)))
        throw new Error(
          "Informe o número em todas as paradas. Se não houver número, escreva S/N.",
        );

      const result = await submitRide({
        data: {
          origin: {
            lat: origin.lat,
            lng: origin.lng,
            address: origin.address,
            neighborhood: origin.neighborhood,
          },
          destination: {
            lat: destination.lat,
            lng: destination.lng,
            address: destination.address,
            neighborhood: destination.neighborhood,
          },
          stops: resolvedStops.map((s) => ({ lat: s.lat, lng: s.lng, address: s.address })),
          petIds: selectedPetIds,
          serviceType,
          scheduledAt: new Date(scheduledAt).toISOString(),
          notes: notes || null,
          needsTrunk: needsTrunk === true,
          hasReturn: hasReturn === true,
          returnScheduledAt: hasReturn && returnAt ? new Date(returnAt).toISOString() : null,
          driverWaits: driverWaits === true,
          preferredDriverId: preferredDriverId === "none" ? null : preferredDriverId,

        },
      });
      return result;
    },

    onSuccess: ({ rideId, returnRideId }) => {
      toast.success(
        returnRideId
          ? "Criamos duas corridas: ida e volta. Agora é só pagar a corrida de ida."
          : "Chamada criada! Agora é só realizar o pagamento.",
      );
      // Envia automaticamente o arquivo/resumo da corrida para a central no WhatsApp.
      for (const id of [rideId, returnRideId].filter((v): v is string => !!v)) {
        void dispatchRide({ data: { rideId: id } }).catch(() => undefined);
      }
      void qc.invalidateQueries({ queryKey: ["rides"] });
      void navigate({ to: "/pagamento/$rideId", params: { rideId } });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Não conseguimos enviar a chamada. Tente novamente.",
      ),
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-semibold">Solicitar corrida</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Conte pra gente o trajeto e cuidamos do resto — motoristas verificados e caixa de transporte
        higienizada.
      </p>

      <div className="mt-6">
        <ActiveRideTracker />
      </div>

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
              <div className="space-y-3 sm:col-span-2">
                <PetSelector
                  pets={pets}
                  selectedIds={selectedPetIds}
                  toggle={togglePet}
                  maxPets={maxPets}
                />
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
              <CardTitle className="text-lg">Trajeto</CardTitle>
              <CardDescription>
                É obrigatório informar o número do endereço. Caso o endereço não possua número,
                escreva S/N (ex.: Avenida Paulista, S/N).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <AddressAutocomplete
                  label="Endereço de embarque"
                  placeholder="coloque o endereço aqui"
                  value={originAddress}
                  onValueChange={setOriginAddress}
                  onSelect={setOrigin}
                  required
                />

              </div>
              <div className="space-y-3 sm:col-span-2">
                {stops.map((stop, index) => (
                  <div key={index} className="flex items-end gap-2">
                    <div className="flex-1">
                      <AddressAutocomplete
                        label={`Parada ${index + 1}`}
                        placeholder="coloque o endereço aqui"
                        value={stop.text}
                        onValueChange={(v) =>
                          setStops((prev) =>
                            prev.map((s, i) => (i === index ? { ...s, text: v } : s)),
                          )
                        }
                        onSelect={(place) =>
                          setStops((prev) =>
                            prev.map((s, i) => (i === index ? { ...s, place } : s)),
                          )
                        }
                        required
                      />

                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Remover parada ${index + 1}`}
                      onClick={() => setStops((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
                {stops.length < 3 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setStops((prev) => [...prev, { text: "", place: null }])}
                  >
                    <Plus className="mr-2 size-4" />
                    Adicionar parada no trajeto
                  </Button>
                )}
              </div>
              <div className="sm:col-span-2">
                <AddressAutocomplete
                  label="Endereço de destino"
                  placeholder="coloque o endereço aqui"
                  value={destinationAddress}
                  onValueChange={setDestinationAddress}
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
              {mapReady ? (
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm text-muted-foreground">
                    {routeReady
                      ? `Distância estimada pela rota: ${distance} km`
                      : "Selecione os pets e o porta-malas para calcularmos rota e valor."}
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
              <div className="space-y-3 sm:col-span-2">
                <Label>
                  Utilizar porta-malas? <span className="text-destructive">*</span>
                </Label>
                <RadioGroup
                  value={needsTrunk === null ? "" : needsTrunk ? "sim" : "nao"}
                  onValueChange={(v) => setNeedsTrunk(v === "sim")}
                  className="grid gap-2 sm:grid-cols-2"
                  required
                >
                  <label
                    htmlFor="porta-malas-sim"
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                      needsTrunk === true
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <RadioGroupItem id="porta-malas-sim" value="sim" />
                    <span className="grid gap-0.5 leading-none">
                      <span className="font-medium">Sim</span>
                      <span className="text-xs text-muted-foreground">
                        Acréscimo de R$ 5,00 no valor da corrida.
                      </span>
                    </span>
                  </label>
                  <label
                    htmlFor="porta-malas-nao"
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                      needsTrunk === false
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <RadioGroupItem id="porta-malas-nao" value="nao" />
                    <span className="font-medium">Não</span>
                  </label>
                </RadioGroup>
              </div>

              <div className="space-y-3 sm:col-span-2">
                <Label>
                  Haverá corrida de retorno? <span className="text-destructive">*</span>
                </Label>
                <RadioGroup
                  value={hasReturn === null ? "" : hasReturn ? "sim" : "nao"}
                  onValueChange={(v) => {
                    const yes = v === "sim";
                    setHasReturn(yes);
                    if (!yes) {
                      setReturnAt("");
                      setDriverWaits(null);
                    }
                  }}
                  className="grid gap-2 sm:grid-cols-2"
                  required
                >
                  <label
                    htmlFor="retorno-sim"
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                      hasReturn === true
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <RadioGroupItem id="retorno-sim" value="sim" />
                    <span className="grid gap-0.5 leading-none">
                      <span className="font-medium">Sim</span>
                      <span className="text-xs text-muted-foreground">
                        O trecho de volta é somado ao valor da corrida.
                      </span>
                    </span>
                  </label>
                  <label
                    htmlFor="retorno-nao"
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                      hasReturn === false
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <RadioGroupItem id="retorno-nao" value="nao" />
                    <span className="font-medium">Não</span>
                  </label>
                </RadioGroup>
              </div>

              {hasReturn === true && (
                <div className="space-y-4 rounded-2xl border border-primary/40 bg-primary/5 p-4 sm:col-span-2">
                  <div className="space-y-2">
                    <Label htmlFor="retorno-horario">
                      Qual o horário do retorno? <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="retorno-horario"
                      type="datetime-local"
                      value={returnAt}
                      min={scheduledAt}
                      onChange={(e) => setReturnAt(e.target.value)}
                      required
                    />
                    {!!returnAt && !returnIsAfterDeparture && (
                      <p className="text-sm text-destructive">
                        O horário do retorno deve ser depois da ida.
                      </p>
                    )}
                  </div>


                  <div className="space-y-3">
                    <Label>
                      Deseja que o motorista aguarde no local até o retorno?{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <RadioGroup
                      value={driverWaits === null ? "" : driverWaits ? "sim" : "nao"}
                      onValueChange={(v) => setDriverWaits(v === "sim")}
                      className="grid gap-2 sm:grid-cols-2"
                      required
                    >
                      <label
                        htmlFor="espera-sim"
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                          driverWaits === true
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card hover:bg-muted"
                        }`}
                      >
                        <RadioGroupItem id="espera-sim" value="sim" className="mt-0.5" />
                        <span className="grid gap-0.5 leading-snug">
                          <span className="font-medium">Sim</span>
                          <span className="text-xs text-muted-foreground">
                            Sim, haverá cobrança de R$ 0,75 por minuto de espera, contados entre o
                            horário da ida e o horário do retorno.
                          </span>
                        </span>
                      </label>
                      <label
                        htmlFor="espera-nao"
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                          driverWaits === false
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card hover:bg-muted"
                        }`}
                      >
                        <RadioGroupItem id="espera-nao" value="nao" />
                        <span className="font-medium">Não</span>
                      </label>
                    </RadioGroup>
                  </div>

                  {driverWaits === false && (
                    <div className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium">
                      Como o motorista não vai aguardar, a viagem será dividida em duas corridas
                      (ida e volta). Motoristas diferentes podem aceitar cada uma, e o pagamento é
                      feito separadamente.
                    </div>
                  )}



                  {routeReady && (
                    <div className="space-y-1 text-sm">
                      <p className="flex justify-between">
                        <span className="text-muted-foreground">Ida</span>
                        <span className="font-medium">
                          {formatBRL(quoteQuery.data!.oneWayCents)}
                        </span>
                      </p>
                      <p className="flex justify-between">
                        <span className="text-muted-foreground">Retorno</span>
                        <span className="font-medium">
                          {formatBRL(quoteQuery.data!.returnFeeCents)}
                        </span>
                      </p>
                      {driverWaits === true && (
                        <p className="flex justify-between">
                          <span className="text-muted-foreground">
                            Espera ({quoteQuery.data!.waitingMinutes} min)
                          </span>
                          <span className="font-medium">
                            {formatBRL(quoteQuery.data!.waitingFeeCents)}
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="obs">Observações para o motorista</Label>
                <Textarea
                  id="obs"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Ex.: portão branco, cachorro ansioso, caixa de transporte necessária..."
                />
              </div>

              <div className="space-y-3 sm:col-span-2">
                <div>
                  <Label>Motorista preferencial</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ele terá prioridade por 10 minutos após o pagamento. Depois, a chamada será
                    liberada aos demais motoristas.
                  </p>
                </div>
                {driversLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Carregando motoristas…
                  </div>
                ) : (
                  <RadioGroup
                    value={preferredDriverId}
                    onValueChange={setPreferredDriverId}
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    <label
                      htmlFor="driver-none"
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                        preferredDriverId === "none"
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <RadioGroupItem id="driver-none" value="none" />
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <UserRound className="size-5" />
                      </span>
                      <span>
                        <span className="block font-medium">Sem preferência</span>
                        <span className="block text-xs text-muted-foreground">Vai direto ao bolsão</span>
                      </span>
                    </label>
                    {preferredDrivers.map((driver) => (
                      <label
                        key={driver.userId}
                        htmlFor={`driver-${driver.userId}`}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                          preferredDriverId === driver.userId
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        <RadioGroupItem id={`driver-${driver.userId}`} value={driver.userId} />
                        {driver.avatarUrl ? (
                          <img
                            src={driver.avatarUrl}
                            alt=""
                            className="size-10 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <UserRound className="size-5" />
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{driver.fullName}</span>
                          <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <Car className="size-3 shrink-0" /> {driver.vehicle ?? "Veículo cadastrado"}
                          </span>
                        </span>
                      </label>
                    ))}
                  </RadioGroup>
                )}
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
                <p className="text-xs uppercase tracking-wide opacity-80">Valor estimado</p>
                <p className="mt-1 text-3xl font-semibold">{formatBRL(price)}</p>
                <p className="mt-1 text-xs opacity-90">
                  {routeReady
                    ? `${distance} km · ~${quoteQuery.data!.durationMinutes} min`
                    : "— km"} ·{" "}
                  {petSizes.find((s) => s.value === groupSize)?.label} · {petCount}{" "}
                  {petCount > 1 ? "pets" : "pet"}
                  {needsTrunk && " · porta-malas"}
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
              <div className="rounded-lg bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wide text-primary-ink">
                Pagamento seguro no app por cartão de crédito, cartão de débito ou Pix antes do
                início do transporte.
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={create.isPending || !routeReady}
              >
                {create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Chamar motorista
              </Button>
            </CardContent>
          </Card>
        </div>
      </form>

      {pets !== undefined && selectedPets.length === 0 && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto bg-background/95 px-4 py-6 backdrop-blur-sm">
          <Card className="mx-auto max-w-2xl shadow-soft">
            <CardHeader>
              <CardTitle className="text-lg">Quem vai viajar?</CardTitle>
              <CardDescription>
                Selecione o(s) pet(s) cadastrado(s) para montar a corrida.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PetSelector
                pets={pets}
                selectedIds={selectedPetIds}
                toggle={togglePet}
                maxPets={maxPets}
              />
              {pets.length === 0 && (
                <Button asChild className="mt-6 w-full">
                  <a href="/perfil">Cadastrar pet</a>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}


function defaultDateTime() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
