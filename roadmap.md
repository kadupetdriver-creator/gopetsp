# Roadmap — PetMobi

## Etapa 1 — Base do marketplace
- [x] Lovable Cloud + tabelas de perfis, pets e corridas com regras de acesso
- [x] Login/cadastro (e-mail, senha e Google) com papéis tutor/motorista
- [x] Solicitação de corrida com estimativa de preço
- [x] Painel de corridas do tutor com status em tempo real
- [x] Painel do motorista: chamadas abertas, aceitar e atualizar status
- [x] Perfil do usuário
- [ ] Landing page responsiva + layout raiz (header, toasts, fontes)

## Etapa 2 — Chat e avaliações
- [ ] Mensagens vinculadas à corrida, visíveis só aos participantes
- [ ] Avaliações (nota + comentário) entre tutor e motorista
- [ ] Chat em tempo real enquanto a corrida está ativa
- [ ] Avaliação mútua ao concluir a corrida
- [ ] Média e avaliações exibidas no perfil

## Etapa 3 — Rastreamento em mapa
- [ ] Posição do motorista persistida e atualizada em tempo real
- [ ] Status claros: aceita, a caminho, em andamento, concluída
- [ ] Tela de acompanhamento do tutor com mapa, rota e progresso
- [ ] Link público de compartilhamento por token, expondo apenas o mínimo
- [ ] Acesso restrito aos participantes da corrida

## Etapa 4 — Perfis completos de pets
- [ ] Campos: foto opcional, tipo, raça, porte, temperamento, peso, saúde/cuidados
- [ ] Itens necessários para transporte (caixa, cinto, focinheira, tapete)
- [ ] Gestão de múltiplos pets pelo tutor (criar, editar, remover)
- [ ] Seleção do pet ao solicitar corrida
- [ ] Motorista vê as informações relevantes do pet na chamada
- [ ] Armazenamento de fotos e regras de acesso por tutor

## Etapa 5 — Marca
- [x] Renomear toda a marca visível para PetMobi (interface, títulos e metadados SEO)

## Etapa 6 — Pagamentos (Stripe)
- [x] Cobrança do tutor na confirmação, com comissão da plataforma (20%) + valor do motorista
- [x] Retenção (escrow) registrada no Lovable Cloud com status por corrida
- [x] Webhook de pagamento + liberação do repasse ao concluir a corrida
- [x] Estorno/cancelamento tratado (taxa de 20% após aceite)
- [x] Status de pagamento visível em cada corrida do tutor

## Etapa 7 — Identidade visual PetMobi
- [x] Logo enviada publicada como asset e componente BrandLogo
- [x] Paleta preto/amarelo aplicada nos tokens globais (claro e escuro)
- [x] Logo no cabeçalho, landing, autenticação e favicon
- [x] Revisar contraste e cores fixas em todas as telas (token text-primary-ink)

## Etapa 8 — Cadastro: espécie do pet, e-mail e telefone
- [x] Espécie obrigatória no cadastro de pets e visível nos detalhes
- [x] E-mail no perfil com validação e confirmação por link ao alterar

## Ajustes pós-entrega
- [ ] Remover filtro de endereços restritos à cidade de São Paulo
- [ ] Enviar automaticamente todos os dados da corrida para a central no WhatsApp (11) 98512-5238

## Etapa 10 — Correção de lacunas de pagamento e conta
- [x] Webhook no caminho oficial /api/public/payments/webhook + eventos expired/async/failed
- [x] Corridas só aparecem ao motorista após pagamento retido
- [x] Stripe Connect: onboarding do motorista e repasse automático (transfer) ao concluir
- [x] Histórico financeiro /pagamentos para tutor e motorista
- [x] Gestão de conta no perfil: trocar e-mail, trocar senha e excluir conta
