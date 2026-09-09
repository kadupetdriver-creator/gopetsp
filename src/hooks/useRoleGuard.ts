import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, type AppRole, type Profile } from "@/hooks/useAuth";

/** Tela principal de cada papel. */
export function homeForRole(profile: Profile | null | undefined): "/solicitar" | "/motorista" {
  return profile?.role === "driver" ? "/motorista" : "/solicitar";
}

/**
 * Garante que a rota só é vista pelo papel permitido.
 * - Deslogado → /auth (guardando o destino em `next`).
 * - Papel errado → tela principal do papel do usuário.
 */
export function useRoleGuard(allowed: AppRole | "any", next?: string) {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth", search: next ? { next } : {} });
      return;
    }
    if (allowed !== "any" && profile && profile.role !== allowed) {
      void navigate({ to: homeForRole(profile), replace: true });
    }
  }, [loading, user, profile, allowed, next, navigate]);

  const ready = !loading && !!user && !!profile && (allowed === "any" || profile.role === allowed);
  return { user, profile, loading, ready };
}
