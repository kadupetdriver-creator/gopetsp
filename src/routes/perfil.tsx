import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PawPrint, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { petSizes, petSpecies, labelOf } from "@/lib/rides";
import { PhoneVerification } from "@/components/PhoneVerification";

const emailPattern = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export const Route = createFileRoute("/perfil")({
  head: () => ({
    meta: [
      { title: "Meu perfil e meus pets | PetMobi" },
      {
        name: "description",
        content:
          "Atualize seus dados de contato, informações do veículo parceiro e cadastre os pets que viajam com você em São Paulo.",
      },
      { property: "og:title", content: "Meu perfil e meus pets | PetMobi" },
      {
        property: "og:description",
        content: "Dados de contato, veículo e pets cadastrados na PetMobi.",
      },
    ],
  }),
  component: PerfilPage,
});

function PerfilPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [petName, setPetName] = useState("");
  const [petSize, setPetSize] = useState("medio");

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name);
      setPhone(profile.phone ?? "");
      setVehicleModel(profile.vehicle_model ?? "");
      setVehiclePlate(profile.vehicle_plate ?? "");
    }
  }, [profile]);

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

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          phone: phone || null,
          vehicle_model: vehicleModel || null,
          vehicle_plate: vehiclePlate || null,
        })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Perfil atualizado.");
      await refreshProfile();
    },
    onError: () => toast.error("Não foi possível salvar o perfil."),
  });

  const addPet = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("pets")
        .insert({ owner_id: user!.id, name: petName, size: petSize });
      if (error) throw error;
    },
    onSuccess: () => {
      setPetName("");
      toast.success("Pet cadastrado.");
      void qc.invalidateQueries({ queryKey: ["pets"] });
    },
    onError: () => toast.error("Não foi possível cadastrar o pet."),
  });

  const removePet = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pets"] }),
  });

  const isDriver = profile?.role === "driver";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-semibold">Meu perfil</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isDriver ? "Motorista parceiro em São Paulo" : "Tutor em São Paulo"}
        </p>
      </div>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-lg">Dados pessoais</CardTitle>
          <CardDescription>Usamos seu contato para avisos sobre a corrida.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveProfile.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="nome">Nome completo</Label>
              <Input id="nome" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tel">WhatsApp</Label>
              <Input id="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            {isDriver && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="veiculo">Veículo</Label>
                  <Input
                    id="veiculo"
                    placeholder="Fiat Doblò 2021"
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="placa">Placa</Label>
                  <Input
                    id="placa"
                    placeholder="ABC1D23"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                  />
                </div>
              </>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saveProfile.isPending}>
                {saveProfile.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Salvar alterações
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {!isDriver && (
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-lg">Meus pets</CardTitle>
            <CardDescription>Cadastre para agilizar novas solicitações.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                addPet.mutate();
              }}
            >
              <Input
                placeholder="Nome do pet"
                value={petName}
                onChange={(e) => setPetName(e.target.value)}
                required
              />
              <Select value={petSize} onValueChange={setPetSize}>
                <SelectTrigger className="sm:w-56">
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
              <Button type="submit" disabled={addPet.isPending}>
                Adicionar
              </Button>
            </form>

            <div className="space-y-2">
              {pets?.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum pet cadastrado ainda.</p>
              )}
              {pets?.map((pet) => (
                <div
                  key={pet.id}
                  className="flex items-center justify-between rounded-xl border border-border px-4 py-3"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <PawPrint className="size-4 text-primary-ink" />
                    {pet.name}
                    <span className="font-normal text-muted-foreground">
                      · {petSizes.find((s) => s.value === pet.size)?.label ?? pet.size}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover ${pet.name}`}
                    onClick={() => removePet.mutate(pet.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
