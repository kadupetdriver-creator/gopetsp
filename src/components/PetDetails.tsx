import { PawPrint } from "lucide-react";
import { labelOf, petSizes, petSpecies, temperaments, transportItems } from "@/lib/rides";

export type PetInfo = {
  name: string;
  species?: string | null;
  breed?: string | null;
  size?: string | null;
  temperament?: string | null;
  weight_kg?: number | null;
  health_notes?: string | null;
  transport_items?: string[] | null;
  photo_url?: string | null;
};

/** Resumo do pet para o motorista e para a tela de acompanhamento. */
export function PetDetails({ pet }: { pet: PetInfo }) {
  const facts = [
    labelOf(petSpecies, pet.species),
    pet.breed,
    labelOf(petSizes, pet.size),
    pet.weight_kg ? `${pet.weight_kg} kg` : null,
    labelOf(temperaments, pet.temperament),
  ].filter(Boolean) as string[];

  return (
    <div className="flex gap-3 rounded-xl border border-border p-3">
      {pet.photo_url ? (
        <img
          src={pet.photo_url}
          alt={`Foto de ${pet.name}`}
          loading="lazy"
          className="size-16 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <PawPrint className="size-6" />
        </span>
      )}
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">{pet.name}</p>
        {facts.length > 0 && <p className="text-sm text-muted-foreground">{facts.join(" · ")}</p>}
        {pet.health_notes && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Saúde/cuidados: </span>
            {pet.health_notes}
          </p>
        )}
        {pet.transport_items && pet.transport_items.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {pet.transport_items.map((i) => (
              <span
                key={i}
                className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
              >
                {labelOf(transportItems, i)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
