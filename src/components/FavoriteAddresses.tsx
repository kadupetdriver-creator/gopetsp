import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addressHasNumber } from "@/lib/address";
import type { SelectedPlace } from "@/components/AddressAutocomplete";

type Favorite = { id: string; label: string; address: string; neighborhood: string | null; lat: number; lng: number };

export function useFavoriteAddresses(userId: string | undefined) {
  return useQuery({
    queryKey: ["favorite-addresses", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorite_addresses")
        .select("id, label, address, neighborhood, lat, lng")
        .eq("user_id", userId!)
        .order("created_at");
      if (error) throw error;
      return data as Favorite[];
    },
  });
}

/** Atalhos de endereços favoritos abaixo de um campo de endereço do pedido. */
export function FavoriteAddresses({
  userId,
  current,
  onPick,
}: {
  userId: string | undefined;
  current: SelectedPlace | null;
  onPick: (place: SelectedPlace) => void;
}) {
  const qc = useQueryClient();
  const favs = useFavoriteAddresses(userId);
  const [naming, setNaming] = useState(false);
  const [label, setLabel] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["favorite-addresses", userId] });

  const save = useMutation({
    mutationFn: async () => {
      if (!userId || !current) return;
      const name = label.trim();
      if (!name) throw new Error("Dê um nome ao favorito (ex.: Casa).");
      const { error } = await supabase.from("favorite_addresses").insert({
        user_id: userId, label: name.slice(0, 40), address: current.address,
        neighborhood: current.neighborhood, lat: current.lat, lng: current.lng,
      });
      if (error) throw new Error("Não foi possível salvar o favorito.");
    },
    onSuccess: () => { toast.success("Endereço salvo nos favoritos."); setNaming(false); setLabel(""); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("favorite_addresses").delete().eq("id", id);
      if (error) throw new Error("Não foi possível remover o favorito.");
    },
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover."),
  });

  const list = favs.data ?? [];
  const alreadySaved = !!current && list.some((f) => f.address === current.address);

  return (
    <div className="mt-2 space-y-2">
      {list.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {list.map((f) => (
            <span key={f.id} className="inline-flex items-center rounded-full border border-border bg-muted/50 text-xs">
              <button
                type="button"
                title={f.address}
                className="inline-flex items-center gap-1 py-1 pl-3 pr-1 font-medium"
                onClick={() => onPick({ address: f.address, neighborhood: f.neighborhood, lat: f.lat, lng: f.lng, hasStreetNumber: addressHasNumber(f.address) })}
              >
                <Star className="size-3 fill-primary text-primary" /> {f.label}
              </button>
              <button
                type="button"
                aria-label={`Remover favorito ${f.label}`}
                className="px-2 py-1 text-muted-foreground hover:text-destructive"
                onClick={() => remove.mutate(f.id)}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {current && !alreadySaved && (naming ? (
        <div className="flex gap-2">
          <Input autoFocus maxLength={40} placeholder="Nome (ex.: Casa, Veterinário)" value={label} onChange={(e) => setLabel(e.target.value)} className="h-9" />
          <Button type="button" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>Salvar</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(false)}>Cancelar</Button>
        </div>
      ) : (
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setNaming(true)}>
          <Star className="mr-1 size-3" /> Salvar como favorito
        </Button>
      ))}
    </div>
  );
}
