# Corrigir apostas opcionais no Jogo de Dados

- Aplicar ao backend conectado a migração de apostas já existente, atualmente ausente no banco remoto, sem alterar outros minijogos.
- Acrescentar início idempotente por identificador de tentativa, mantendo débito, limite sobre saldo anterior, sessão do dono e custo de 3 vigor na mesma transação.
- Manter liquidação única: vitória devolve aposta + 50% (arredondamento inteiro para baixo); derrota ou aposta zero não geram crédito.
- Atualizar imediatamente o saldo exibido após a confirmação do início e da liquidação; indicar claramente que a aposta é opcional.
- Testar regras e chamadas reais, incluindo repetição, limite e propriedade da sessão; informar arquivos e migrações efetivamente aplicados.

## Detalhes técnicos
Preservar o duelo executado no navegador: esta alteração valida movimentações e propriedade, mas não transforma a simulação dos dados em uma engine autoritativa no servidor. Usar RPCs SECURITY DEFINER e sessões persistentes, sem escritas diretas de moedas pelo cliente.