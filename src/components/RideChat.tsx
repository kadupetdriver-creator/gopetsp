import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/rides";

type Props = {
  rideId: string;
  userId: string;
  active: boolean;
  counterpartName: string;
};

export function RideChat({ rideId, userId, active, counterpartName }: Props) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data: messages, isLoading } = useQuery({
    queryKey: ["ride-messages", rideId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ride_messages")
        .select("id, sender_id, body, created_at")
        .eq("ride_id", rideId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`ride-messages-${rideId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ride_messages", filter: `ride_id=eq.${rideId}` },
        () => void qc.invalidateQueries({ queryKey: ["ride-messages", rideId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [rideId, qc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  const send = useMutation({
    mutationFn: async () => {
      const text = body.trim();
      if (!text) return;
      const { error } = await supabase
        .from("ride_messages")
        .insert({ ride_id: rideId, sender_id: userId, body: text });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      void qc.invalidateQueries({ queryKey: ["ride-messages", rideId] });
    },
    onError: () => toast.error("Não foi possível enviar a mensagem."),
  });

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="text-lg">Chat da corrida</CardTitle>
        <CardDescription>
          {active
            ? `Converse com ${counterpartName} enquanto o transporte estiver ativo.`
            : "A corrida foi encerrada. O histórico fica salvo para consulta."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl bg-muted/40 p-3">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando mensagens…</p>}
          {!isLoading && messages?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
          )}
          {messages?.map((m) => {
            const mine = m.sender_id === userId;
            return (
              <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    mine ? "bg-primary text-primary-foreground" : "bg-card text-foreground border border-border"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-1 text-[10px] ${mine ? "opacity-80" : "text-muted-foreground"}`}>
                    {formatTime(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {active ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
            }}
          >
            <Input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escreva uma mensagem…"
              aria-label="Mensagem"
              maxLength={800}
            />
            <Button type="submit" disabled={send.isPending || !body.trim()} aria-label="Enviar">
              {send.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <SendHorizonal className="size-4" />
              )}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
