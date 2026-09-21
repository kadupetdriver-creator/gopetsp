# Avaliação mútua com patinhas

## O que será criado
- Substituir as estrelas por uma escala de 1 a 5 patinhas, com seleção clara, acessível e adequada ao celular.
- Exibir a avaliação ao tutor e ao motorista após a conclusão de cada corrida.
- Cada pessoa poderá avaliar uma única vez, com comentário opcional.
- Manter a nota recebida privada até que as duas pessoas tenham enviado suas avaliações.
- Depois das duas avaliações, mostrar a nota e o comentário recebidos para cada participante.

## Experiência
- Corridas concluídas ainda não avaliadas terão uma chamada visível para avaliar.
- Ao escolher as patinhas, a tela mostrará uma descrição curta da nota antes do envio.
- Após o envio, a pessoa verá que sua avaliação foi registrada e aguardará a outra parte quando necessário.
- Quando ambos avaliarem, o resultado recebido será revelado automaticamente.

## Detalhes técnicos
- Reaproveitar a tabela de avaliações existente, que já limita uma avaliação por pessoa em cada corrida e aceita notas de 1 a 5.
- Ajustar a leitura no banco para o modelo de avaliação dupla-cega: o autor sempre vê o próprio envio; a avaliação recebida só é retornada após ambos avaliarem.
- Integrar o mesmo componente de avaliação na corrida concluída do tutor e no histórico do motorista.
- Validar o fluxo nas duas áreas em telas de celular e computador.
