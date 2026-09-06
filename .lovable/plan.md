# Ativar pagamentos reais (Stripe) na GoPet

## Situação atual

O Stripe já está integrado ao app e funcionando em modo de teste. A conta de teste já foi conectada (etapa 1 concluída). Para cobrar de verdade, faltam etapas que só você pode fazer no site do Stripe.

## Etapas restantes

1. **Completar o formulário de ativação no Stripe** (em andamento — sua ação)
   - Verificar seus dados pessoais e do negócio
   - Cadastrar a conta bancária para receber os repasses
   - Ativar autenticação em duas etapas
   - Revisar e enviar
2. **Instalar o app da Lovable na conta ativa do Stripe** (sua ação, desbloqueia após a etapa 1)
3. **Chaves de produção** — criadas automaticamente pela Lovable, sem ação sua
4. **Verificação de prontidão** — rodada automática ao final

Ao concluir, os checkouts do app (pagamento de corrida e recarga de créditos, cartão e Pix) passam a cobrar valores reais.

## Observações

- Enquanto as etapas não terminarem, o app segue em modo de teste (cartão 4242...).
- O Pix precisa estar habilitado na sua conta Stripe para cobranças reais.
- O repasse automático ao motorista (Stripe Connect) também exige que cada motorista complete o próprio cadastro de recebimento.

## Detalhes técnicos

- Status atual verificado: etapa 1 (claim) concluída; etapa 2 (setup_live_account) em andamento.
- Nenhuma alteração de código é necessária — o app já alterna automaticamente entre teste e produção conforme as chaves provisionadas.
