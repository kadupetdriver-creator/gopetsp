# Roadmap — GoPet

## Em andamento — tutor acompanha o pet
- [x] Perguntar no pedido se o tutor vai junto e salvar a resposta na ida e volta, sem alterar a tarifa
- [x] Mostrar acompanhamento no bolsão, chamadas e histórico do motorista
- [ ] Verificar escolha Sim/Não, persistência e exibição

## Em andamento — nome do tutor
- [x] Exibir o nome do tutor abaixo dos pets nas corridas atribuídas e no histórico do motorista
- [x] Conferir a exibição com corridas demonstrativas no computador e celular; testes existentes e compilação sem erros
- [ ] Conferir a consulta e exibição com corrida real — bloqueado por falta de cadastro de motorista na conta disponível para teste

## Concluído — saldo GoPet
- [x] Oferecer saldo GoPet junto ao Mercado Pago no pagamento da corrida
- [x] Garantir débito atômico, bloquear saldo insuficiente e pagamentos concorrentes; pagamento, extrato e devolução verificados com corrida temporária

## Concluído — corridas administrativas
- [x] Permitir finalizar corridas esquecidas pelos motoristas
- [x] Mostrar total e valor destinado ao motorista nas disponíveis
- [x] Separar Aceitas de Em andamento sem duplicidade

## Concluído — acompanhamento do tutor
- [x] Mostrar dados do motorista e carro antes de A caminho; liberar mensagem e mapa ao vivo somente após o comando

## Concluído — classificação dos pets
- [x] Classificar pets nas cinco faixas da imagem e abrir o guia pelo símbolo de ajuda

## Concluído
- [x] Marketplace com cadastro, pets, corridas e perfis de tutor/motorista
- [x] Chat, avaliações, mapas, rastreamento e compartilhamento seguro
- [x] Avaliação mútua com patinhas e resultado oculto até ambas as partes avaliarem
- [x] Administração, relatórios, bônus, documentos e exportação de cadastros
- [x] Tarifas, rotas, ida/volta, espera, paradas e estimativa de trânsito
- [x] Checkout Mercado Pago no app com crédito, débito e Pix pela API de Orders
- [x] CPF obrigatório, Pix com QR Code/copia e cola e expiração em 30 minutos
- [x] Confirmação por webhook assinado, atualização em tempo real e reembolso integral
- [x] Sem split, repasse ou escrow; valor integral da GoPet

## Pendente — configuração externa
- [x] Cadastrar MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET e MP_PUBLIC_KEY nos segredos do projeto
- [ ] Configurar no Mercado Pago o webhook https://gopetsp.lovable.app/api/public/mp-webhook
- [ ] Publicar e executar pagamentos reais de homologação após cadastrar os dados

## Concluído
- [x] Criar os relatórios Ganhos Sexta-Feira e Ganhos Segunda-Feira
- [x] Permitir motorista preferencial com prioridade de 10 minutos após o pagamento

- [x] Programa de indicação (cupom 20% tutor, bônus R$ 50 motorista, admin)
- [x] Relatórios administrativos com valor total das corridas e repasse de 75%

- [x] Veículos do motorista (cadastro múltiplo e carro do dia) movidos para a aba Meu perfil
- [x] Administração vê todos os dados de tutores e motoristas (CPF, nascimento, pets, veículos)
- [x] Mapa ao vivo da administração com a posição de cada motorista em corrida
- [x] Filtros "Corridas disponíveis" e "Corridas aceitas" na tela de corridas da administração
- [x] Separar Em andamento de disponíveis e apenas aceitas; iniciar após A caminho
- [x] Painel de recarga de saldo GoPet (valor livre, Pix ou cartão via Mercado Pago)
