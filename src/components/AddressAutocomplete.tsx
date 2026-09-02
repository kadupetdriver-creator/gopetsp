import { useEffect, useId, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPlaceDetails, searchAddresses, type PlaceSuggestion } from "@/lib/places.functions";

export type SelectedPlace = {
  address: string;
  neighborhood: string | null;
  lat: number;
  lng: number;
};

type Props = {
  label: string;
  placeholder?: string;
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (place: SelectedPlace) => void;
  required?: boolean;
};

/** Campo de endereço com sugestões do Google Maps, com viés para São Paulo. */
export function AddressAutocomplete({
  label,
  placeholder,
  value,
  onValueChange,
  onSelect,
  required,
}: Props) {
  const id = useId();
  const search = useServerFn(searchAddresses);
  const details = useServerFn(getPlaceDetails);

  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const skipNext = useRef(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void search({ data: { query } })
        .then((res) => {
          if (cancelled) return;
          setSuggestions(res);
          setOpen(true);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setLoading(false);
      clearTimeout(timer);
    };
  }, [value, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const choose = async (s: PlaceSuggestion) => {
    setOpen(false);
    setLoading(true);
    try {
      const place = await details({ data: { placeId: s.placeId } });
      skipNext.current = true;
      onValueChange(place.address || `${s.primary} ${s.secondary}`.trim());
      onSelect(place);
    } catch {
      toast.error("Não conseguimos carregar esse endereço. Tente outro.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2" ref={wrapRef}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          onChange={(e) => onValueChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        {open && suggestions.length > 0 && (
          <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
            {suggestions.map((s) => (
              <li key={s.placeId}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => void choose(s)}
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary-ink" />
                  <span>
                    <span className="block font-medium">{s.primary}</span>
                    <span className="block text-xs text-muted-foreground">{s.secondary}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default AddressAutocomplete;
