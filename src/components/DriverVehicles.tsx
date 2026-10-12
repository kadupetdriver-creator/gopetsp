import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Car, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isValidPlate, maskPlate, vehicleColors, vehicleTypes } from "@/lib/drivers";
import { cn } from "@/lib/utils";

type VehicleRow = {
  id: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  vehicle_type: string;
  is_active: boolean;
};

const empty = { plate: "", brand: "", model: "", year: "", color: "", vehicle_type: "" };

export function DriverVehicles({ driverId }: { driverId: string }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(empty);
  const currentYear = new Date().getFullYear();

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["my-vehicles", driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, plate, brand, model, year, color, vehicle_type, is_active")
        .eq("driver_id", driverId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as VehicleRow[];
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["my-vehicles", driverId] });
    void qc.invalidateQueries({ queryKey: ["driver-application"] });
  };

  const activate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("set_active_vehicle", { _vehicle_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Veículo do dia atualizado.");
      refresh();
    },
    onError: () => toast.error("Não foi possível trocar o veículo."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Veículo removido.");
      refresh();
    },
    onError: () => toast.error("Não foi possível remover o veículo."),
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!isValidPlate(form.plate)) throw new Error("Placa inválida.");
      if (form.brand.trim().length < 2) throw new Error("Informe a marca.");
      if (form.model.trim().length < 2) throw new Error("Informe o modelo.");
      const year = Number(form.year);
      if (!Number.isInteger(year) || year < currentYear - 15 || year > currentYear + 1)
        throw new Error(`O veículo deve ser de ${currentYear - 15} ou mais novo.`);
      if (!form.color) throw new Error("Selecione a cor.");
      if (!form.vehicle_type) throw new Error("Selecione o tipo de veículo.");
      const { error } = await supabase.from("vehicles").insert({
        driver_id: driverId,
        plate: maskPlate(form.plate),
        brand: form.brand.trim(),
        model: form.model.trim(),
        year,
        color: form.color,
        vehicle_type: form.vehicle_type,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Veículo cadastrado.");
      setForm(empty);
      setAdding(false);
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível cadastrar."),
  });

  const selectCls =
    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Escolha qual veículo você está usando hoje. É ele que o tutor vê na corrida.
      </p>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {vehicles.map((v) => (
        <Card key={v.id} className={cn("shadow-soft", v.is_active && "border-2 border-primary")}>
          <CardContent className="flex flex-wrap items-center gap-3 py-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary-ink">
              <Car className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {v.brand} {v.model}{" "}
                {v.is_active && <Badge className="ml-1 align-middle">Ativo hoje</Badge>}
              </p>
              <p className="text-sm text-muted-foreground">
                Placa {v.plate} · {v.year} · {v.color} · <span className="capitalize">{v.vehicle_type}</span>
              </p>
            </div>
            {!v.is_active && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => activate.mutate(v.id)} disabled={activate.isPending}>
                  <CheckCircle2 className="mr-1 size-4" /> Usar hoje
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Remover veículo"
                  onClick={() => {
                    if (confirm(`Remover o veículo ${v.plate}?`)) remove.mutate(v.id);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {adding ? (
        <Card className="shadow-soft">
          <CardContent className="grid gap-3 py-5 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Placa</Label>
              <Input value={form.plate} onChange={(e) => setForm({ ...form, plate: maskPlate(e.target.value) })} placeholder="ABC1D23" />
            </div>
            <div className="space-y-1">
              <Label>Marca</Label>
              <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Modelo</Label>
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Ano</Label>
              <Input inputMode="numeric" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
            </div>
            <div className="space-y-1">
              <Label>Cor</Label>
              <select className={selectCls} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}>
                <option value="">Selecione</option>
                {vehicleColors.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <select className={selectCls} value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}>
                <option value="">Selecione</option>
                {vehicleTypes.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button onClick={() => add.mutate()} disabled={add.isPending}>Salvar veículo</Button>
              <Button variant="ghost" onClick={() => { setAdding(false); setForm(empty); }}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus className="mr-1 size-4" /> Cadastrar outro veículo
        </Button>
      )}
    </div>
  );
}
