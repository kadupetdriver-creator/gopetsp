import { Copy, MapPin } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
  tone?: "origin" | "destination" | "stop";
  className?: string;
};

const hasCoords = (lat?: number | null, lng?: number | null) =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng);

/** Link web do Google Maps (funciona em Android, iOS e desktop). */
function mapsUrl(address: string, lat?: number | null, lng?: number | null) {
  const destination = hasCoords(lat, lng) ? `${lat},${lng}` : address;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    destination,
  )}&travelmode=driving`;
}

/** Deep link do app Waze; sem coordenadas usamos a busca por texto. */
function wazeUrl(address: string, lat?: number | null, lng?: number | null) {
  return hasCoords(lat, lng)
    ? `waze://?ll=${lat},${lng}&navigate=yes`
    : `waze://?q=${encodeURIComponent(address)}&navigate=yes`;
}

const isMobile = () =>
  typeof navigator !== "undefined" && /android|iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * Abre a navegação: tenta o app nativo (Waze) e, se ele não estiver instalado,
 * cai automaticamente para o Google Maps no navegador.
 */
export function openNavigation(address: string, lat?: number | null, lng?: number | null) {
  const web = mapsUrl(address, lat, lng);
  if (!isMobile()) {
    window.open(web, "_blank", "noopener,noreferrer");
    return;
  }

  const start = Date.now();
  let fell = false;
  const fallback = () => {
    if (fell) return;
    fell = true;
    // Se o app abriu, a aba fica oculta e o tempo decorrido é maior.
    if (document.hidden || Date.now() - start > 2200) return;
    window.location.href = web;
  };

  const onHide = () => {
    fell = true;
    document.removeEventListener("visibilitychange", onHide);
  };
  document.addEventListener("visibilitychange", onHide);

  window.location.href = wazeUrl(address, lat, lng);
  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onHide);
    fallback();
  }, 1500);
}

/** Endereço clicável que abre o app de navegação, com botão de copiar ao lado. */
export function AddressLink({ label, address, lat, lng, tone = "origin", className }: Props) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Endereço copiado.");
    } catch {
      toast.error("Não foi possível copiar o endereço.");
    }
  };

  return (
    <div className={cn("flex items-start gap-2 text-sm", className)}>
      <MapPin
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "destination" ? "text-accent" : "text-primary-ink",
        )}
      />
      <div className="min-w-0 flex-1">
        <span className="font-medium text-foreground">{label}: </span>
        <button
          type="button"
          onClick={() => openNavigation(address, lat, lng)}
          className="text-left font-medium text-primary-ink underline decoration-dotted underline-offset-4 hover:opacity-80"
        >
          {address}
        </button>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copiar endereço de ${label.toLowerCase()}`}
        className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Copy className="size-4" />
      </button>
    </div>
  );
}

export default AddressLink;
