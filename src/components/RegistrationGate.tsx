import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { GoogleProfileCompletion } from "./GoogleProfileCompletion";

export function RegistrationGate({ children }: { children: ReactNode }) {
  const { loading, needsProfileCompletion, user } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 aria-label="Carregando cadastro" className="size-6 animate-spin text-primary" /></div>;
  if (needsProfileCompletion) return <GoogleProfileCompletion key={user?.id} />;
  return children;
}