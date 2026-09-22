# Relatórios semanais de ganhos

## Objetivo
Criar dois relatórios administrativos de faturamento pago:
- **Ganhos Sexta-Feira:** corridas pagas de segunda a quinta-feira.
- **Ganhos Segunda-Feira:** corridas pagas de sexta-feira a domingo.

## Implementação
- Adicionar os dois relatórios à página administrativa existente.
- Calcular os períodos no horário de São Paulo e mostrar claramente as datas consideradas.
- Somar somente corridas com pagamento confirmado, usando o valor integral recebido pela GoPet.
- Exibir total faturado, quantidade de corridas e lista detalhada com tutor, motorista, data e valor.
- Manter os filtros existentes de tutor e motorista.
- Ajustar a consulta administrativa para usar a data real do pagamento nos relatórios.

## Validação
- Conferir os dois intervalos semanais e seus limites de data.
- Validar estados vazio, carregamento e valores totais em telas pequenas e grandes.
