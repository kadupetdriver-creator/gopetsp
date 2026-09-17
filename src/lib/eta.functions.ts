import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Estimativa de tempo de corrida.
 * Neste projeto (TanStack Start) a lógica de servidor usa server functions,
 * não edge functions — o comportamento pedido é o mesmo.
 */

export type EstimateEtaInput = {
  origem: string;
  destino: string;
  distanciaKm: number;
  duracaoBaseMin: number;
  horarioSolicitacao: string;
  horarioAgendado: string;
};

export type EtaResult = {
  tempo_estimado_min: number;
  fator_transito_aplicado: "leve" | "moderado" | "intenso" | "padrão";
  fonte_dado: "google_maps" | "historico_real_sp" | "historico_recente" | "fator_padrao";
  data_historico_usado: string | null;
  justificativa: string;
};

/** Velocidade de referência (km/h) usada para converter a calibragem em fator. */
const REF_SPEED_KMH = 25;

function nivelPorFator(fator: number): EtaResult["fator_transito_aplicado"] {
  if (fator <= 0.95) return "leve";
  if (fator <= 1.15) return "padrão";
  if (fator <= 1.35) return "moderado";
  return "intenso";
}

const DIAS_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/** Hora local de São Paulo (UTC-3) a partir de um instante. */
function spParts(iso: string) {
  const d = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  return {
    hour: d.getUTCHours(),
    weekday: d.getUTCDay(),
    date: d.toISOString().slice(0, 10),
  };
}

/** Ajuste padrão por faixa de horário: pico +30%, fora de pico +10%. */
function fatorPadrao(hour: number) {
  const pico = (hour >= 7 && hour < 9) || (hour >= 17 && hour < 19);
  return {
    fator: pico ? 1.3 : 1.1,
    nivel: (pico ? "intenso" : "padrão") as EtaResult["fator_transito_aplicado"],
  };
}

function fallbackPadrao(duracaoBaseMin: number, hour: number, motivo: string): EtaResult {
  const { fator, nivel } = fatorPadrao(hour);
  return {
    tempo_estimado_min: Math.max(1, Math.round(duracaoBaseMin * fator)),
    fator_transito_aplicado: nivel,
    fonte_dado: "fator_padrao",
    data_historico_usado: null,
    justificativa: motivo,
  };
}

export const estimateRideEta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: EstimateEtaInput) => {
    const origem = String(input?.origem ?? "").trim().slice(0, 300);
    const destino = String(input?.destino ?? "").trim().slice(0, 300);
    const distanciaKm = Number(input?.distanciaKm);
    const duracaoBaseMin = Number(input?.duracaoBaseMin);
    const solicitacao = new Date(String(input?.horarioSolicitacao ?? ""));
    const agendado = new Date(String(input?.horarioAgendado ?? ""));
    if (!origem || !destino) throw new Error("Informe origem e destino");
    if (!Number.isFinite(distanciaKm) || distanciaKm <= 0) throw new Error("Distância inválida");
    if (!Number.isFinite(duracaoBaseMin) || duracaoBaseMin <= 0) throw new Error("Duração base inválida");
    if (Number.isNaN(solicitacao.getTime()) || Number.isNaN(agendado.getTime())) {
      throw new Error("Horários inválidos");
    }
    return {
      origem,
      destino,
      distanciaKm,
      duracaoBaseMin: Math.round(duracaoBaseMin),
      horarioSolicitacao: solicitacao.toISOString(),
      horarioAgendado: agendado.toISOString(),
    };
  })
  .handler(async ({ data, context }): Promise<EtaResult> => {
    const diferencaMin =
      (new Date(data.horarioAgendado).getTime() - new Date(data.horarioSolicitacao).getTime()) / 60000;
    const alvo = spParts(data.horarioAgendado);

    // Menos de 1h de antecedência: o trânsito atual do Google Maps já basta.
    if (diferencaMin < 60) {
      return {
        tempo_estimado_min: Math.max(1, data.duracaoBaseMin),
        fator_transito_aplicado: "padrão",
        fonte_dado: "google_maps",
        data_historico_usado: null,
        justificativa: "Corrida imediata: usamos o tempo do Google Maps com trânsito atual.",
      };
    }

    // 1º) Calibragem com corridas reais de São Paulo (dia da semana + hora).
    const { data: calibRow } = await context.supabase
      .from("eta_traffic_calibration")
      .select("avg_speed_kmh, samples, source, updated_at")
      .eq("weekday", alvo.weekday)
      .eq("hour", alvo.hour)
      .maybeSingle();

    const calibSpeed = Number(calibRow?.avg_speed_kmh);
    const calibFator =
      Number.isFinite(calibSpeed) && calibSpeed > 0
        ? Math.min(2, Math.max(0.7, REF_SPEED_KMH / calibSpeed))
        : null;

    if (calibRow?.source === "real" && (calibRow.samples ?? 0) >= 3 && calibFator) {
      const minutos = Math.max(1, Math.round(data.duracaoBaseMin * calibFator * 1.1));
      return {
        tempo_estimado_min: minutos,
        fator_transito_aplicado: nivelPorFator(calibFator),
        fonte_dado: "historico_real_sp",
        data_historico_usado: String(calibRow.updated_at ?? "").slice(0, 10) || null,
        justificativa: `Baseado em ${calibRow.samples} corridas reais em São Paulo neste dia e horário (média de ${calibSpeed} km/h), com 10% de folga para embarque do pet.`,
      };
    }

    // Histórico: corridas concluídas no mesmo dia da semana e faixa de horário,
    // do dia anterior à data agendada retrocedendo até 30 dias.
    const inicio = new Date(new Date(data.horarioAgendado).getTime() - 30 * 24 * 60 * 60 * 1000);
    const fim = new Date(new Date(data.horarioAgendado).getTime() - 24 * 60 * 60 * 1000);
    const { data: rows } = await context.supabase
      .from("rides")
      .select("scheduled_at, arrived_at, updated_at, distance_km, status")
      .eq("status", "completed")
      .gte("scheduled_at", inicio.toISOString())
      .lte("scheduled_at", fim.toISOString())
      .order("scheduled_at", { ascending: false })
      .limit(200);

    const historico = ((rows ?? []) as {
      scheduled_at: string;
      arrived_at: string | null;
      updated_at: string;
      distance_km: number;
    }[])
      .map((r) => {
        const p = spParts(r.scheduled_at);
        const inicioReal = r.arrived_at ?? r.scheduled_at;
        const minutos = (new Date(r.updated_at).getTime() - new Date(inicioReal).getTime()) / 60000;
        return { ...r, ...p, minutos: Math.round(minutos) };
      })
      .find(
        (r) =>
          r.weekday === alvo.weekday &&
          Math.abs(r.hour - alvo.hour) <= 1 &&
          r.minutos > 0 &&
          r.minutos < 300,
      );

    if (!historico) {
      if (calibFator) {
        return {
          tempo_estimado_min: Math.max(1, Math.round(data.duracaoBaseMin * calibFator * 1.1)),
          fator_transito_aplicado: nivelPorFator(calibFator),
          fonte_dado: "fator_padrao",
          data_historico_usado: null,
          justificativa:
            "Sem corridas registradas nesse dia e horário; usamos o padrão de trânsito de São Paulo para essa faixa.",
        };
      }
      return fallbackPadrao(
        data.duracaoBaseMin,
        alvo.hour,
        "Sem histórico nos últimos 30 dias para esse dia e horário; aplicamos o ajuste padrão de trânsito.",
      );
    }

    const diasDeDistancia = Math.max(
      1,
      Math.round(
        (new Date(data.horarioAgendado).getTime() - new Date(historico.scheduled_at).getTime()) /
          86400000,
      ),
    );

    const prompt = `Você é um assistente especializado em logística urbana de pet transporte em São Paulo.

Esta corrida foi AGENDADA com antecedência (solicitada às ${data.horarioSolicitacao}, para acontecer às ${data.horarioAgendado}, no dia ${alvo.date}).

Calcule o TEMPO ESTIMADO em minutos com base no trânsito observado no MESMO horário e dia da semana, usando o histórico disponível mais recente antes da data agendada.

DADOS DA CORRIDA:
- Origem: ${data.origem}
- Destino: ${data.destino}
- Distância (Google Maps): ${data.distanciaKm} km
- Duração base sem trânsito (Google Maps): ${data.duracaoBaseMin} min
- Horário agendado: ${data.horarioAgendado} (${DIAS_SEMANA[alvo.weekday]})

DADOS HISTÓRICOS (registro mais recente encontrado, antes de ${alvo.date}):
- Data do registro: ${historico.date}
- Dias de distância: ${diasDeDistancia}
- Duração real registrada: ${historico.minutos} min
- Nível de trânsito reportado: não informado
- Clima no dia do registro (se disponível): não informado

REGRAS:
1. Use a duração histórica mais recente como principal fator de ajuste sobre a duração base.
2. Quanto maior dias_de_distancia, reduza a confiança no ajuste — mencione isso na justificativa.
3. Considere buffer de segurança de 10% para embarque/desembarque do pet.
4. Retorne APENAS um JSON no formato:
{
  "tempo_estimado_min": <número inteiro>,
  "fator_transito_aplicado": "<leve|moderado|intenso|padrão>",
  "fonte_dado": "<historico_recente|fator_padrao>",
  "data_historico_usado": "<data ou null>",
  "justificativa": "<explicação curta em 1 frase>"
}`;

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      return fallbackPadrao(
        data.duracaoBaseMin,
        alvo.hour,
        "Serviço de estimativa indisponível; aplicamos o ajuste padrão de trânsito.",
      );
    }

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-6-astra",
          reasoning_effort: "low",
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error(`ETA AI falhou [${response.status}]: ${body}`);
        return fallbackPadrao(
          data.duracaoBaseMin,
          alvo.hour,
          "Não foi possível consultar a estimativa inteligente; aplicamos o ajuste padrão de trânsito.",
        );
      }

      const json = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1)) as
        Partial<EtaResult>;

      const minutos = Number(parsed.tempo_estimado_min);
      if (!Number.isFinite(minutos) || minutos <= 0) throw new Error("Resposta inválida da IA");

      const niveis = ["leve", "moderado", "intenso", "padrão"] as const;
      return {
        tempo_estimado_min: Math.round(minutos),
        fator_transito_aplicado: niveis.includes(parsed.fator_transito_aplicado as never)
          ? (parsed.fator_transito_aplicado as EtaResult["fator_transito_aplicado"])
          : "padrão",
        fonte_dado: "historico_recente",
        data_historico_usado: historico.date,
        justificativa:
          String(parsed.justificativa ?? "").slice(0, 300) ||
          "Estimativa baseada no histórico mais recente do mesmo dia e horário.",
      };
    } catch (error) {
      console.error("ETA AI erro:", error);
      return fallbackPadrao(
        data.duracaoBaseMin,
        alvo.hour,
        "Não foi possível consultar a estimativa inteligente; aplicamos o ajuste padrão de trânsito.",
      );
    }
  });
