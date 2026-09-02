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
- [ ] Cobrança do tutor na confirmação, com comissão da plataforma + valor do motorista
- [ ] Retenção (escrow) registrada no Lovable Cloud com status por corrida
- [ ] Webhook libera o repasse ao concluir a corrida
- [ ] Estorno/cancelamento tratado
- [ ] Histórico de pagamentos (tutor) e de repasses (motorista)
