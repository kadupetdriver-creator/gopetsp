# Preço por km + tempo (estilo Uber)

## Objetivo
Incluir o tempo estimado de viagem no cálculo do preço da corrida, cobrando **R$ 0,75 por minuto** além dos R$ 4,20/km atuais.

## O que já existe
- O cálculo de rota (Google Routes API) já retorna a **duração estimada** da viagem junto com a distância.
- Hoje o preço usa apenas distância: `R$ 12,00 base + R$ 4,20/km`, multiplicado pelo fator do porte (1,1 / 1,2 / 1,3).

## Nova fórmula (por pet, trecho de ida)
```text
(base R$ 12,00 + km × R$ 4,20 + minutos × R$ 0,75) × fator do porte
```
- Pets adicionais seguem pagando 40% do valor do próprio porte (o tempo já entra na base deles).
- A corrida de retorno e a espera do motorista (R$ 0,75/min entre ida e volta) permanecem como estão — são regras separadas.
- Se o Google falhar, o tempo estimado já tem aproximação própria (distância ÷ 22 km/h), então o preço nunca fica sem o componente de tempo.

## Alterações
1. **Cálculo de preço** (`src/lib/pricing.ts`): novo parâmetro `durationMinutes` e constante `PRICE_PER_MINUTE_CENTS = 75`; o valor por minuto entra na fórmula antes do fator de porte.
2. **Backend** (`src/lib/rides.functions.ts`): passar a duração da rota para o cálculo, tanto no orçamento (`quoteRide`) quanto na criação da corrida (`createRide`) — o valor cobrado continua sendo definido e gravado somente no servidor.
3. **Tela de solicitação** (`src/routes/solicitar.tsx` / orçamento): exibir a estimativa de tempo da viagem ao tutor junto do preço, para transparência.
4. Verificação: `bunx tsgo --noEmit` e teste no fluxo de solicitação conferindo orçamento com km + minutos.

## Observação
Corridas já criadas não mudam de valor — a nova regra vale para orçamentos e corridas novas.
