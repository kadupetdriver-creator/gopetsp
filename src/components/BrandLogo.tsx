import { Link } from "@tanstack/react-router";
import logoAsset from "@/assets/gopet-logo.jpg.asset.json";
import { cn } from "@/lib/utils";

export const goPetLogoUrl = logoAsset.url;

interface BrandLogoProps {
  className?: string;
  /** Tamanho da marca em px (quadrado). */
  size?: number;
  /** Exibe o nome ao lado do símbolo. */
  withWordmark?: boolean;
  /** Envolve a marca num link para a home. */
  asLink?: boolean;
}

export function BrandLogo({
  className,
  size = 40,
  withWordmark = true,
  asLink = false,
}: BrandLogoProps) {
  const mark = (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-canvas ring-1 ring-border"
      style={{ width: size, height: size }}
    >
      <img
        src={goPetLogoUrl}
        alt="GoPet — transporte de pets em São Paulo"
        width={size}
        height={size}
        className="size-full object-contain"
        loading="eager"
      />
    </span>
  );

  const content = (
    <span className={cn("flex items-center gap-2", className)}>
      {mark}
      {withWordmark ? (
        <span className="text-lg font-semibold tracking-tight">
          Go<span className="text-primary-ink">Pet</span>
        </span>
      ) : null}
    </span>
  );

  if (asLink) {
    return (
      <Link to="/" aria-label="GoPet — início">
        {content}
      </Link>
    );
  }

  return content;
}
