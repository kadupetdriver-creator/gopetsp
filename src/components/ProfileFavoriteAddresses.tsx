import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AddressAutocomplete, type SelectedPlace } from "@/components/AddressAutocomplete";
import { useFavoriteAddresses } from "@/components/FavoriteAddresses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addressHasNumber } from "@/lib/address";

/** Retângulo de atendimento (São Paulo e Grande SP), o mesmo do banco de dados. */
const SP_BOUNDS = { minLat: -24.1, maxLat: -23.1, minLng: -47.1, maxLng: -46.05 };

function isWithinServiceArea(lat: number, lng: number) {
  return (
    lat >= SP_BOUNDS.minLat &&
    lat <= SP_BOUNDS.maxLat &&
    lng >= SP_BOUNDS.minLng &&
    lng <= SP_BOUNDS.maxLng
  );
}

/** Cadastro e lista de endereços favoritos direto no perfil do tutor. */
export function ProfileFavoriteAddresses({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const favs = useFavoriteAddresses(userId);
  const [addressText, setAddressText] = useState("");
  const [place, setPlace] = useState<SelectedPlace | null>(null);
  const [label, setLabel] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["favorite-addresses", userId] });

  const add = useMutation({
    mutationFn: async () => {
      const name = label.trim();
      if (!name) throw new Error("Dê um nome ao endereço (ex.: Casa, Veterinário).");
      if (!place) throw new Error("Escolha um endereço na lista de sugestões.");
      const address = place.address.trim();
      if (!addressHasNumber(address)) {
        throw new Error("Informe o número do endereço. Se não houver número, escreva S/N.");
      }
      if (!isWithinServiceArea(place.lat, place.lng)) {
        throw new Error("Endereço fora da área de atendimento da GoPet.");
      }
      if ((favs.data ?? []).some((f) => f.address === address)) {
        throw new Error("Este endereço já está nos seus favoritos.");
      }
      const { error } = await supabase.from("favorite_addresses").insert({
        user_id: userId,
        label: name.slice(0, 40),
        address,
        neighborhood: place.neighborhood,
        lat: place.lat,
        lng: place.lng,
      });
      if (error) throw new Error("Não foi possível salvar o endereço favorito.");
    },
    onSuccess: () => {
      toast.success("Endereço salvo nos favoritos.");
      setAddressText("");
      setPlace(null);
      setLabel("");
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o endereço."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("favorite_addresses").delete().eq("id", id);
      if (error) throw new Error("Não foi possível remover o favorito.");
    },
    onSuccess: refresh,
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível remover o endereço."),
  });

  const list = favs.data ?? [];

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <div className="sm:col-span-2">
          <AddressAutocomplete
            label="Endereço"
            placeholder="Rua, número e bairro"
            value={addressText}
            onValueChange={setAddressText}
            onSelect={setPlace}
            place={place}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fav-nome">Nome do favorito</Label>
          <Input
            id="fav-nome"
            maxLength={40}
            placeholder="ex.: Casa, Veterinário"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={add.isPending}>
            {add.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Adicionar endereço
          </Button>
        </div>
      </form>

      <div className="space-y-2">
        {favs.isLoading && (
          <p className="text-sm text-muted-foreground">Carregando seus favoritos…</p>
        )}
        {!favs.isLoading && list.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum endereço favorito ainda.</p>
        )}
        {list.map((f) => (
          <div
            key={f.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
          >
            <span className="min-w-0 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <Star className="size-3.5 shrink-0 fill-primary text-primary" />
                {f.label}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {f.address}
              </span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remover ${f.label}`}
              disabled={remove.isPending}
              onClick={() => remove.mutate(f.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
