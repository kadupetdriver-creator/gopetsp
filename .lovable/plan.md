# Motorista preferencial no pedido de corrida

## Objetivo
Permitir que o tutor escolha um motorista aprovado como preferencial ao solicitar uma corrida, sem atribuir a corrida antecipadamente e sem risco de dois motoristas aceitarem.

## Experiência
- Adicionar ao formulário de solicitação a opção **Sem preferência** e uma lista com os motoristas parceiros aprovados e ativos.
- Mostrar somente informações adequadas ao tutor: nome, foto e veículo; não expor telefone, CPF, chave Pix ou documentos.
- Quando houver preferência, reservar a visualização e o aceite ao motorista escolhido durante os primeiros **10 minutos após a confirmação do pagamento**.
- Se ele não aceitar nesse prazo, liberar automaticamente a corrida no bolsão para todos os motoristas aprovados.
- Identificar a chamada como “Preferência do tutor” para o motorista escolhido.
- Aplicar a mesma preferência à ida e à volta quando o retorno gerar duas corridas independentes.

## Segurança e consistência
- Registrar na corrida o motorista preferencial e o fim da prioridade, sem preencher o motorista responsável antes do aceite.
- Validar no servidor que o escolhido continua aprovado e ativo ao criar a corrida.
- Atualizar as regras de leitura para ocultar a corrida dos demais motoristas durante a prioridade.
- Atualizar o aceite atômico existente para permitir apenas o preferencial no prazo reservado e manter a garantia de que somente um motorista fica com a corrida.
- Após os 10 minutos, a própria regra por horário libera a chamada, sem depender de tarefa agendada.

## Validação
- Conferir pedido sem preferência, pedido com preferência dentro do prazo e liberação após o prazo.
- Testar disputa de aceite para confirmar que apenas um motorista consegue assumir.
- Verificar a tela em tamanhos de celular e computador e confirmar que dados privados não aparecem.
