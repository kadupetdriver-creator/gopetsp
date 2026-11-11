# Nova política de cancelamento pelo tutor (modo de teste, sem cobranças reais)

## O que muda para o tutor
- **Antes de pagar/confirmar**: quadro "Condições de cancelamento" com as 3 faixas (gratuito com mais de 5 dias; 30% de 5 dias até o dia; 50% com motorista a caminho ou no local) e caixa de "Li e concordo".
- **Ao tocar em "Cancelar corrida"**: janela mostrando a faixa aplicada, a taxa em %, o valor da taxa em R$ e o reembolso previsto. Campo de motivo (opcional) e confirmação explícita ("Sim, cancelar corrida").
- **Histórico da corrida**: linha "Cancelada em dd/mm às hh:mm — taxa X% (R$ …), reembolso previsto R$ …".
- Visual preto e dourado da GoPet.

## Regras (calculadas sempre no servidor)
- Antecedência = horário agendado − momento do cancelamento, 120 horas exatas, horário de São Paulo.
- Mais de 120 h: 0%. Até 120 h: 30%. Motorista a caminho ou chegou: 50%. Nunca soma.
- Sem taxa quando a falha for da GoPet ou do motorista (decidido pela administração como exceção).
- Corridas de ida e volta: a mesma regra para cada trecho, pelo horário de cada um.
- Parcela do motorista: 75% da taxa efetivamente retida (ou o valor fixo proporcional nas corridas fixas — a confirmar).
- Um único registro por corrida; cancelar duas vezes não gera duplicidade nem muda status indevidamente.

## Painel administrativo — nova guia "Cancelamentos"
- Lista de todos os cancelamentos: data/hora, tutor, motorista, motivo, situação do motorista no momento (sem motorista, aceita, a caminho, chegou), horário em que saiu a caminho e em que chegou, valor da corrida, taxa, reembolso previsto, parcela do motorista.
- Filtros por período e situação, e planilha CSV.
- **Exceções**: admin marca "Falha da GoPet", "Falha do motorista" ou "Outra exceção", com justificativa; a taxa vai a 0% e tudo fica auditado.

## O que NÃO será feito nesta etapa
- Nenhuma alteração no Mercado Pago, saldo GoPet ou estornos reais. O reembolso atual continua igual; os novos valores ficam apenas registrados como "previstos".
- Uma chave de ativação (desligada) controla quando a cobrança passa a valer. Até lá, o tutor vê os valores mas nada é cobrado.

## Direitos do consumidor
- Aviso no app de que a política está em revisão jurídica. Sugestão para avaliação do jurídico: cancelamento grátis em até 7 dias após a compra (direito de arrependimento, art. 49 do CDC) quando a corrida ainda estiver a mais de 120 h. Nada é ativado sem sua aprovação.

## Detalhes técnicos
- `src/lib/cancellation-policy.ts`: função pura `cancellationQuote(ride, now)` → { tier, ratePercent, feeCents, refundCents, driverShareCents } usando `driverPayoutCents`/`DRIVER_SHARE_RATE`; testes para 120h±1min, en_route, arrived_at, exceção.
- Nova tabela `ride_cancellations` (ride_id único, valores, tier, motivo, driver_state, en_route_at, arrived_at, exception_kind/notes, reviewed_by) — leitura do próprio tutor e admin; escrita só por funções no servidor.
- Nova coluna `rides.en_route_at` preenchida por trigger quando o status vira `en_route` (`arrived_at` já existe).
- Server functions: `quoteTutorCancellation`, `cancelRideAsTutor` (autenticado, dono, update condicional do status + insert idempotente) e `adminSetCancellationException` (admin-only, auditado).
- `CANCELLATION_FEE_RATE` (20%) antigo fica sem uso em telas novas; o fluxo financeiro existente não muda.
- RLS e permissões atuais preservadas.
