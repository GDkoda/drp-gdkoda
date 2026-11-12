# Prontidão de publicação — Ecos dos Fractais

**Auditoria do repositório em 12/11/2026.** Esta lista registra evidências estáticas do branch; não representa aprovação de build, homologação ou publicação.

## Estado do branch

- Branch de trabalho: `FractalGame`.
- Branch padrão do repositório: `main`.
- Comparação consultada: `FractalGame` está significativamente à frente de `main` e não está atrás. O número exato de commits muda conforme novos commits são adicionados; repetir a comparação imediatamente antes de abrir/mesclar o PR. É uma diferença grande: não é apenas o último pacote de alterações de Ecos dos Fractais.
- A busca por PR com `FractalGame` como head não retornou PR aberto ou fechado.
- Não há arquivos de workflow em `.github/workflows/`; o status de commit consultado não apresentou checks publicados.

**Antes de publicar:** revisar o diff completo entre `main` e `FractalGame`, decidir quais mudanças do branch fazem parte desta entrega e integrar por PR revisado. Não mesclar o branch inteiro sem revisar as 464 commits de diferença.

## Qualidade e testes

O `package.json` disponibiliza os scripts:

- `bun run lint`
- `bun run test`
- `bun run build`

O repositório tem testes de roteamento, combate por turnos, Farkle, arte de monstros e Twenty-One, mas não há testes dedicados a `FractalArena`, às armas, ao dash ou às dádivas novas.

**Pendências obrigatórias antes do lançamento:**

1. Instalar dependências a partir do `bun.lock` e executar lint, testes e build.
2. Corrigir todos os erros encontrados; guardar os logs do resultado.
3. Criar testes focados para as regras de armas e dádivas, especialmente Núcleo com ricochete/perfuração, ciclos do Grilhão, dash/cooldown e limites das dádivas.
4. Adicionar CI para executar lint, testes e build em cada PR. Atualmente não há workflow configurado.

Esses comandos não foram executados durante esta auditoria.

## Supabase e migrações

O código do jogo chama estas RPCs:

- `get_fractal_state`
- `purchase_fractal_upgrade`
- `exchange_fractals_for_coins`
- `start_fractal_run`
- `finish_fractal_run`

Há migrações de Fractais versionadas em `supabase/migrations/`, incluindo recompensas, relíquias de projéteis, progressão/armas/presságios, Âncora da Alma e limites da loja.

**Bloqueio importante de versionamento:** existem dois arquivos com o mesmo prefixo de versão `20261111020000`:

- `20261111020000_fractal_relics_anchor_balance.sql`
- `20261111020000_fractal_shop_progression_caps.sql`

A versão da migração é o timestamp usado como identificador no histórico do Supabase. Duas migrações com o mesmo timestamp precisam ser reconciliadas antes de usar o fluxo normal de `db push`. Não renomear ou reaplicar às cegas: primeiro consultar o histórico remoto e confirmar se alguma delas já foi aplicada. A documentação do Supabase descreve o timestamp como identificador único no histórico e recomenda comparar os arquivos locais com a tabela de histórico remoto.

A auditoria não acessou o projeto Supabase conectado e, portanto, **não confirma** que todas essas migrações estão aplicadas em produção nem que as cinco RPCs e suas permissões/RLS estão corretas no ambiente publicado.

**Antes de publicar:**

1. Consultar `supabase migration list --remote` (ou o mecanismo de migração que o projeto efetivamente usa).
2. Resolver o timestamp duplicado de forma compatível com o histórico remoto; só então executar qualquer `db push`.
3. Confirmar a existência, assinatura, permissões de execução, autenticação e políticas RLS das cinco RPCs.
4. Testar compra, troca de moedas, início/fim de expedição e crédito de recompensas com uma conta de teste.

As alterações de gameplay desta entrega são no frontend; elas não acrescentaram novas tabelas, RPCs ou migrações SQL.

## Escopo funcional

- O seletor de missão atualmente marca apenas a missão de ID 1 como disponível. Confirmar que a primeira publicação deve conter apenas essa missão; caso contrário, completar/desbloquear e testar as missões restantes.
- O jogo agora exige viewport de pelo menos 1024px e ponteiro preciso. Validar em desktop real e confirmar que celulares/tablets recebem apenas o aviso de PC.
- O dash é acionado por Espaço, tem duração de 0,18s, cooldown de 1,25s e invulnerabilidade curta. Testar colisão contra obstáculos, direção quando parado, uso repetido e interação com pausa/telas de dádiva.
- Testar cada uma das seis armas nos níveis iniciais, no nível 10 e na evolução; verificar que só aparecem as dádivas exclusivas da arma equipada e que os efeitos respeitam o limite de três níveis.
- Fazer teste de estresse com o painel do Mestre (50 inimigos), comparando FPS com Grilhão normal/evoluído e Núcleo normal/evoluído. A otimização foi verificada estaticamente, não por perfil de execução.

## Configuração e publicação

- Há um arquivo `.env` no repositório. Os nomes das variáveis encontrados incluem URL do Supabase, project ID e publishable key (incluindo variantes `VITE_`). Os valores não foram reproduzidos nesta auditoria. Confirmar que não há credenciais privadas no arquivo e mover a configuração de produção para as variáveis do ambiente de hospedagem.
- Confirmar domínio, variáveis de produção, autenticação, storage/arquivos, políticas de acesso, logs e recuperação de falhas.
- Fazer deploy em ambiente de homologação, executar a lista de smoke tests e só então publicar em produção.

## Conclusão

**Não classificar como pronto para produção ainda.** As alterações de código estão versionadas em `FractalGame`, mas faltam validação de build/testes, testes funcionais de PC, reconciliação do timestamp de migração duplicado, confirmação do estado real do Supabase e integração revisada com `main`.
