# Checkout Mercado Pago na GoPet

## Objetivo
Substituir o pagamento por saldo na corrida pelo Checkout Transparente do Mercado Pago, dentro do app, com crédito, débito e Pix. A confirmação da corrida virá somente da notificação validada do Mercado Pago.

## O que será construído
- Tela de pagamento com Payment Brick, CPF obrigatório e opções de crédito, débito e Pix.
- Pix com QR Code, código copia e cola e validade de 30 minutos.
- Atualização automática da tela quando o pagamento mudar, sem recarregar.
- Mensagens em português para pagamento recusado, Pix expirado e falhas de conexão.
- Registro seguro das tentativas de pagamento por corrida, visível apenas ao tutor daquela corrida.
- Criação do pagamento no servidor usando o valor oficial da corrida e uma chave única por tentativa.
- Endpoint público de notificação com validação de assinatura e consulta do pagamento diretamente no Mercado Pago antes de confirmar a corrida.
- Reembolso integral no Mercado Pago quando uma corrida paga for cancelada.

## Regras preservadas
- Nenhum dado de cartão será armazenado pela GoPet.
- O token privado do Mercado Pago ficará somente no servidor; o navegador receberá apenas a chave pública.
- Não haverá split, repasse a motorista ou escrow; 100% do pagamento pertence à GoPet.
- Motoristas só verão corridas após a confirmação `approved` recebida pela notificação.
- Os status existentes da corrida continuarão funcionando.
- Corridas antigas pagas com saldo continuarão legíveis e canceláveis sem quebrar o histórico.

## Ajustes no fluxo atual
- Remover o bloqueio que impede criar uma corrida sem saldo GoPet.
- Após criar a corrida, abrir o checkout Mercado Pago.
- Trocar os textos que ainda indicam pagamento exclusivo por saldo.
- Usar endpoints do servidor do app equivalentes às funções solicitadas: criação, notificação e reembolso.

## Configuração externa necessária
Ao final, será fornecida a URL pública da notificação e a lista exata de configurações no painel do Mercado Pago. As credenciais `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` e `MP_PUBLIC_KEY` serão solicitadas pelo formulário seguro depois que a infraestrutura estiver pronta.

## Validação
- Verificar tipos e compilação.
- Testar a tela em desktop e celular.
- Validar criação, estados pendente/recusado/aprovado/expirado, atualização em tempo real, duplicidade e cancelamento com reembolso.
