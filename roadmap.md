# Roadmap — GoPet

## Concluído — exceção de CPF
- [x] Permitir múltiplas contas para o CPF solicitado no cadastro comum e via Google, preservando unicidade dos demais
- [x] Regra de disponibilidade, gatilho de cadastro e índice único conferidos no banco; oito testes passaram, sem criar contas adicionais

## Concluído — filtro de rendimentos do motorista
- [x] Incluir datas inicial e final, totais e histórico do período com bônus
- [x] Sete testes passaram; tela com dados demonstrativos conferiu totais, exclusão de outro motorista, período vazio, intervalo invertido, limpeza e celular sem transbordamento; conta disponível não possui cadastro de motorista, portanto fluxo com rendimentos reais não verificado

## Concluído — datas e situação dos pagamentos
- [x] Mostrar data e hora da criação para administradores
- [x] Usar a data da realização da corrida nos relatórios de pagamento
- [x] Mostrar pagamentos ao motorista em verde com data e a pagar em amarelo com previsão na sexta ou segunda
- [x] Registro administrativo conferido com corrida temporária: previsão, mudança de cor, data salva e persistência após recarregar; tela pequena sem transbordamento, quinze testes passaram e dados temporários removidos

## Concluído — cadastro via Google
- [x] Exigir CPF, telefone e e-mail válidos antes de liberar o app após login com Google
- [x] Salvar cadastro com CPF único; conta temporária autenticada conferiu CPF inválido, bloqueio por acesso direto, gravação e persistência após recarregar, sem erros; conta removida e cinco testes passaram

## Concluído — encaminhamento administrativo de corridas pagas
- [x] Mostrar corridas pagas sem motorista em Disponíveis, mesmo antes do comando do tutor; duas corridas reais do Zeus conferidas na tela
- [x] Encaminhamento administrativo protegido testado com corrida temporária em branco e para motorista aprovado, persistência após recarregar e pagamento/valor preservados; teste removido

## Concluído — orçamentos administrativos
- [x] Separar pedidos sem pagamento aprovado em Orçamentos e incluir somente pagos nas listas e contagens de corridas, relatórios e mapa
- [x] Conferir com sessão administrativa real: 67 corridas pagas e 51 orçamentos separados, planilhas correspondentes e persistência após recarregar; testes validam mudança de categoria após aprovação, sem nova cobrança real

## Concluído — reagendamento administrativo
- [x] Permitir alterar data e horário a pedido do tutor, sem alterar valor ou pagamento
- [x] Validar acesso administrativo, registrar alteração e verificar persistência pela tela com corrida temporária; teste removido

## Concluído — chamar após pagar
- [x] Trocar o botão do pedido para Ir para pagamento
- [x] Liberar a corrida somente após pagamento confirmado e comando Chamar motorista
- [x] Verificar bloqueio antes do comando e liberação persistente depois: sessão autenticada, corrida temporária com confirmação simulada sem cobrança, comando real e releitura após recarregar; teste removido

## Concluído — quantidade de pessoas
- [x] Perguntar quantas pessoas quando o tutor acompanha; salvar ida/volta e mostrar ao motorista
- [x] Quantidade e troca Sim/Não verificadas no formulário autenticado; testes de validação passaram

## Concluído — tutor acompanha o pet
- [x] Perguntar no pedido se o tutor vai junto e salvar a resposta na ida e volta, sem alterar a tarifa
- [x] Mostrar acompanhamento no bolsão, chamadas e histórico do motorista
- [x] Sim/Não verificados no formulário autenticado; resposta salva e relida em corrida temporária sem pagamento, removida após teste; motorista conferido com dados demonstrativos

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
- [x] Permitir motorista preferencial com prioridade de 10 minutos após Chamar motorista, com pagamento confirmado

- [x] Programa de indicação (cupom 20% tutor, bônus R$ 50 motorista, admin)
- [x] Relatórios administrativos com valor total das corridas e repasse de 75%

- [x] Veículos do motorista (cadastro múltiplo e carro do dia) movidos para a aba Meu perfil
- [x] Administração vê todos os dados de tutores e motoristas (CPF, nascimento, pets, veículos)
- [x] Mapa ao vivo da administração com a posição de cada motorista em corrida
- [x] Filtros "Corridas disponíveis" e "Corridas aceitas" na tela de corridas da administração
- [x] Separar Em andamento de disponíveis e apenas aceitas; iniciar após A caminho
- [x] Painel de recarga de saldo GoPet (valor livre, Pix ou cartão via Mercado Pago)
