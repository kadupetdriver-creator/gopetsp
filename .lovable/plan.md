# Sincronizar o GoPet com GitHub

## Objetivo
Conectar o projeto GoPet a um repositório no GitHub para backup, versionamento e edição externa do código.

## Passos
1. No editor Lovable, abrir o menu **Plus (+)** no canto inferior esquerdo → **GitHub** → **Connect project**.
2. Autorizar o **Lovable GitHub App** na conta GitHub desejada.
3. Selecionar a conta ou organização onde o repositório será criado.
4. Criar o repositório (o Lovable sugere um nome; pode manter ou renomear para `gopet`).
5. Aguardar a sincronização inicial e confirmar que os arquivos do projeto apareceram no GitHub.

## Resultado esperado
- Todo o código do GoPet estará versionado no GitHub.
- Alterações futuras no Lovable serão commitadas automaticamente.
- Alterações feitas no GitHub (push) sincronizarão de volta para o Lovable.

## Observações
- Esta é a integração nativa de Git sync do Lovable, não o conector de API do GitHub.
- Nenhuma alteração de código do app é necessária.
