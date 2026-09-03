import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CENTRAL_WHATSAPP, formatBRL, formatDateTime, serviceTypes } from "@/lib/rides";

/**
 * Gera o arquivo de texto da corrida e envia automaticamente para a central
 * no WhatsApp usando a API oficial (WhatsApp Cloud API da Meta).
 * O tutor não precisa clicar em "enviar".
 */
export const dispatchRideToCentral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rideId: string }) => {
    if (!input?.rideId || typeof input.rideId !== "string") throw new Error("rideId inválido");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: ride, error } = await supabase
      .from("rides")
      .select(
        "id, tutor_id, pet_name, pet_size, service_type, origin_address, destination_address, scheduled_at, distance_km, price_cents, notes, status",
      )
      .eq("id", data.rideId)
      .single();
    if (error || !ride) throw new Error("Corrida não encontrada");
    if (ride.tutor_id !== userId) throw new Error("Sem permissão para esta corrida");

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", userId)
      .maybeSingle();

    const service =
      serviceTypes.find((s) => s.value === ride.service_type)?.label ?? "Transporte";

    const content = [
      "NOVA CORRIDA PETMOBI",
      `Protocolo: ${ride.id}`,
      "",
      `Tutor: ${profile?.full_name ?? "-"}`,
      `Telefone do tutor: ${profile?.phone ?? "-"}`,
      "",
      `Pet(s): ${ride.pet_name}`,
      `Porte: ${ride.pet_size}`,
      `Motivo: ${service}`,
      "",
      `Embarque: ${ride.origin_address}`,
      `Destino: ${ride.destination_address}`,
      `Agendada para: ${formatDateTime(ride.scheduled_at)}`,
      `Distância: ${ride.distance_km} km`,
      `Valor estimado: ${formatBRL(ride.price_cents)}`,
      "",
      `Observações: ${ride.notes ?? "-"}`,
      `Status: ${ride.status}`,
    ].join("\n");

    const fileName = `corrida-${ride.id}.txt`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Evita envios duplicados da mesma corrida.
    const { data: existing } = await supabaseAdmin
      .from("ride_dispatches")
      .select("id, status")
      .eq("ride_id", ride.id)
      .maybeSingle();
    if (existing && existing.status === "sent") {
      return { status: "sent" as const, alreadySent: true, fileName };
    }

    const { data: dispatch } = await supabaseAdmin
      .from("ride_dispatches")
      .upsert(
        existing
          ? { id: existing.id, ride_id: ride.id, file_name: fileName, content, status: "pending" }
          : { ride_id: ride.id, file_name: fileName, content, status: "pending" },
      )
      .select("id")
      .single();

    const token = process.env["WHATSAPP_TOKEN"];
    const phoneNumberId = process.env["WHATSAPP_PHONE_NUMBER_ID"];

    if (!token || !phoneNumberId) {
      if (dispatch) {
        await supabaseAdmin
          .from("ride_dispatches")
          .update({ status: "failed", error: "Credenciais do WhatsApp não configuradas" })
          .eq("id", dispatch.id);
      }
      return { status: "not_configured" as const, fileName };
    }

    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: CENTRAL_WHATSAPP,
          type: "text",
          text: { preview_url: false, body: content },
        }),
      });
      const json = (await res.json()) as {
        messages?: { id: string }[];
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(json.error?.message ?? `Falha HTTP ${res.status}`);

      if (dispatch) {
        await supabaseAdmin
          .from("ride_dispatches")
          .update({
            status: "sent",
            provider_message_id: json.messages?.[0]?.id ?? null,
            error: null,
          })
          .eq("id", dispatch.id);
      }
      return { status: "sent" as const, fileName };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erro desconhecido";
      if (dispatch) {
        await supabaseAdmin
          .from("ride_dispatches")
          .update({ status: "failed", error: message })
          .eq("id", dispatch.id);
      }
      return { status: "failed" as const, fileName };
    }
  });
