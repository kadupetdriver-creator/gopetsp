import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import guide from "@/assets/pet-size-guide.jpg.asset.json";

export function PetSizeHelp() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          aria-label="Ajuda sobre o porte do pet"
          title="Classificação de porte de pet"
        >
          <CircleHelp className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto p-3 pt-12 sm:p-4 sm:pt-12" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Classificação de porte de pet</DialogTitle>
        <img
          src={guide.url}
          alt="Guia GoPet: Mini ou toy até 5 kg; Pequeno de 5,1 a 10 kg; Médio de 10,1 a 25 kg; Grande de 25,1 a 40 kg; Gigante acima de 40 kg. As faixas são uma referência prática; altura, comprimento e necessidades do pet também influenciam o transporte."
          width={769}
          height={1013}
          className="h-auto w-full rounded-lg"
        />
      </DialogContent>
    </Dialog>
  );
}