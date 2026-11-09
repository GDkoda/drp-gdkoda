# Ecos dos Fractais — design and balancing foundation

## Premise

Em um tempo antigo, um draconato tentou recriar o mundo destruído de que veio e acabou dividindo os aspectos desse mundo em fractais que caíram sobre outro mundo. Os fractais atraíram o Vazio, corrompendo criaturas daquele novo mundo.

As criaturas são abominações com cristais incrustados no corpo. A cor do cristal identifica o caminho de corrupção. Os chefes são criaturas deformadas e fortalecidas pelos fractais.

## Five paths and missions

| Mission | Path | Maximum fractals per run | Core challenge |
| --- | --- | ---: | --- |
| I — Último Silêncio | Black — Mourning | 10 | Endurance, attrition and life drain |
| II — Fúria Eterna | Red — Anger | 15 | Aggression, speed and explosions |
| III — Jardim da Cobiça | Green — Envy | 25 | Poison, regeneration and parasitism |
| IV — Lágrimas do Abismo | Blue — Sadness | 50 | Area control, slow and freeze |
| V — Coração do Caos | Violet — Chaos | 100 | Distortion, unpredictability and combined patterns |

Mission I is available from the start. Missions unlock sequentially and require fractals, but unlock prices remain intentionally undefined until approved.

## Run format

- Survivors-like combat, predominantly automatic.
- Player skill centers on movement, positioning, dodging, routing and choosing upgrades.
- Initial balancing target: 12-minute runs.
- The player grows in power throughout a run; enemy pressure rises in parallel.
- Death ends the run, but earned fractals and permanent unlocks are retained.
- The maximum fractal reward is a cap, never a guaranteed payout.
- Reward formula is still pending approval and must be calculated server-side.

## Hybrid difficulty

Difficulty is the sum of three independent layers:

1. **Mission baseline:** fixed identity, enemy roster, elite mechanics, events and boss.
2. **Temporal escalation:** a scheduled pressure curve with deliberate breathing windows.
3. **Corruption level:** an optional challenge selected before the run. It adds pressure and special encounter modifiers, without secretly changing player stats.

The first implementation defines six provisional corruption steps (0–5), from Íntegro to Irreversível. These labels and tuning values are initial balancing scaffolding and can be adjusted after playtesting.

### Proposed 12-minute pacing

| Time | Phase | Purpose |
| --- | --- | --- |
| 0–2 min | Exploration | Learn basic enemies and start the build |
| 2–4 min | First pressure | Introduce more enemy types |
| 4–5 min | First trial | Elite or special event |
| 5–6 min | Breather | Reduce pressure without emptying the arena |
| 6–8 min | Escalation | Combine path mechanics |
| 8–10 min | Danger | More elites and dangerous events |
| 10–11 min | Build-up | Prepare the player for the boss |
| 11–12 min | Boss | Mission's corrupted guardian |

Corruption and time pressure must never make attacks unreadable or remove all reasonable escape routes. Threat should come from enemy behavior and composition, not inflated health alone.

## Permanent progression

- Four initial heroes are planned.
- The first hero is available immediately; the other three are permanently unlocked with fractals.
- Each hero has a unique passive and exclusive weapon.
- Each exclusive weapon has a stronger special evolution.
- Fractals exchange for main-app coins at 10 fractals = 1 coin.
- Spent fractals are permanently spent and cannot also be exchanged.
- Mission and hero prices are not yet defined.
- Server-side validation is required for run rewards, unlocks and exchange. Never trust client-submitted reward amounts or balances.

## Open decisions before economy implementation

- Mission unlock prices.
- Hero unlock prices.
- Exact run reward formula and performance inputs.
- Whether corruption levels unlock by progression or are selectable from the start.
- Whether higher corruption grants bonus fractals, and the exact bonus.
- Entry vigor cost, if any.

## Balance inicial aprovado para a loja

Valores iniciais centralizados em `src/lib/fractals/economy.ts` para facilitar ajustes:

| Compra permanente | Níveis / custo |
| --- | --- |
| Desbloqueio do coletável Área | N1/N2/N3 — 300 / 600 / 1.000 fractais |
| Desbloqueio do coletável Experiência | N1/N2/N3 — 250 / 500 / 900 fractais |
| Raridade | Normal (100%, grátis); Rara (85% normal / 15% rara); Épica (70% normal / 23% rara / 7% épica); Superior (60% normal / 27% rara / 13% épica) — 400 / 800 / 1.400 fractais |
| Velocidade 2x | 1.000 fractais |
| Velocidade 3x | 2.000 fractais |

Evoluções de armas são sempre Lendárias e não entram no sorteio de raridade.

### Fórmula inicial de recompensa

A recompensa usa até 65% do teto pela sobrevivência proporcional, 25% por derrotar o chefe e até 10% por abates (atingindo o bônus máximo em 120 abates). O resultado é arredondado para baixo e limitado ao teto da missão. A fórmula está em `calculateFractalReward`.

### Implementação em andamento

- [x] Tela de pausa com painel de atributos da partida.
- [x] Alternância de tela cheia.
- [x] Simulação acelerada real em 2x/3x para a conta com papel `master`.
- [x] Valores iniciais de custos, raridades e recompensa centralizados.
- [x] Compra persistente da loja e leitura do saldo via RPC; a concessão de recompensas continua bloqueada até haver combate autoritativo no servidor.
- [x] Persistência da progressão de corrupção via RPC; há bloqueio por tempo mínimo, mas a confirmação do chefe ainda depende do cliente.
- [x] Desbloqueio de Coletáveis Especiais por nível; seus efeitos são temporários e limitados por expedição.

A interface de aceleração bloqueia 2x/3x para contas comuns até a compra permanente. A loja persistente já está conectada. Não creditar fractais a partir de uma vitória informada apenas pelo navegador: o protótipo de combate é client-side e ainda precisa de uma camada de validação adequada.


### Continuação implementada

- [x] Custos da loja multiplicados por 10 na configuração TypeScript e na RPC SQL.
- [x] Loja conectada às RPCs de leitura e compra; compras ficam persistidas por conta.
- [x] Bônus de Área e Experiência convertidos em coletáveis temporários, com limites por expedição.
- [x] Seleção de corrupção bloqueia níveis acima do desbloqueado; vitória no nível atual registra conclusão e libera o seguinte.
- [x] Início e encerramento de expedição registrados no banco. A RPC exige 11 minutos de tempo real para vitória em contas comuns; a conta mestre pode testar sem essa espera.

**Limitação de segurança ainda existente:** o jogo e a morte/derrota do chefe são processados no cliente. O banco aplica uma barreira de tempo e controla o desbloqueio, mas ainda não consegue provar criptograficamente que o chefe foi derrotado. Não há concessão de fractais por vitória nesta etapa; isso fica bloqueado até a simulação/recompensa ser autoritativa no servidor. As probabilidades de raridade já são sorteadas nas ofertas de melhoria de nível. Ainda não existe sistema de evolução de armas; quando for criado, suas evoluções serão sempre lendárias.

**SQL:** executar a migração `drizzle/migrations/0005_fractal_shop_state.sql` no editor SQL do Supabase. Se a versão anterior já foi aplicada, execute o arquivo atualizado inteiro para substituir as funções e criar a tabela de expedições.


## Coletáveis Especiais — balanceamento aprovado

Área de coleta e Experiência não concedem mais atributos permanentes ao iniciar uma expedição. A loja desbloqueia os coletáveis:

- Nível 1: o coletável correspondente pode aparecer nas escolhas ao subir de nível (18% de chance de uma das opções ser especial por nível; no máximo uma opção especial por oferta).
- Nível 2: monstros fortes (Brutos e Elites) têm 1% de chance de derrubar um coletável especial.
- Nível 3: a chance de queda sobe para 3%.
- Área: cada coleta aumenta o raio em 10%, com limite de +50%.
- Experiência: cada coleta aumenta XP recebida em 5%, com limite de +30%.
- Os efeitos duram somente até o fim da expedição. Ao atingir o limite, o coletável correspondente deixa de aparecer e não pode ser desperdiçado.
- A chance de queda é compartilhada pela categoria e usa o maior nível desbloqueado entre os coletáveis especiais; a queda escolhe aleatoriamente entre os tipos elegíveis.

## Ajuste das raridades

Bônus normal = 100% do valor-base; rara = 125%; épica = 150%. Evoluções permanecem sempre lendárias.

Os quatro aprimoramentos básicos exibem o valor efetivo na carta e aplicam o multiplicador diretamente ao bônus: Estilhaço Voraz (+30% / +37,5% / +45% de dano), Pulso Acelerado (+18% / +22,5% / +27% de velocidade de ataque), Casca de Cristal (+15% / +18,75% / +22,5% de vida máxima e cura proporcional) e Passos do Errante (+10% / +12,5% / +15% de movimento). A velocidade de ataque é aplicada como multiplicador da taxa de disparo para que o percentual anunciado corresponda ao efeito real.


## Atualização de combate e loja — novembro de 2026

### Atributos permanentes
- Vida reforçada: +10 HP máximo por nível, até 5 níveis (+50 HP).
- Duração de projéteis: duração-base reduzida de 1,6 s para 0,8 s; 3 níveis permanentes aumentam a duração para 1,0 s, 1,2 s e 1,6 s (máximo: o dobro da nova duração-base).
- Vida e duração são aplicadas ao iniciar cada expedição.

### Coletáveis especiais adicionais
- Alcance dos projéteis: +10% de velocidade/distância por coleta, limitado a +50% por expedição.
- Coroa de Estilhaços: cada coleta adiciona um projétil; máximo de 2 extras (3 no total).
- Os dois desbloqueios seguem a progressão dos coletáveis: nível 1 libera a opção de melhoria; nível 2 habilita 1% de queda de Brutos/Elites; nível 3 habilita 3%. A chance é compartilhada pela categoria de coletáveis especiais.
- Quando há projéteis extras, cada disparo individual causa 68% do dano normal, e a arma distribui os tiros em leque para compensar parte do ganho de cobertura.

### IA e apresentação
- Inimigos respiram/deformam suavemente e os espectros/Elites flutuam.
- Ecos usam aproximação com flanqueamento; Carregadores antecipam levemente a direção do jogador; Brutos reduzem a aproximação para preparar o golpe; inimigos usam separação para não se sobrepor.
- O chefe ganha uma segunda fase mais agressiva abaixo de 50% de vida.
- A vida do protagonista pode ser mostrada/ocultada no menu de pausa.
- O projétil usa um fragmento cristalino violetado com brilho colorido; o círculo permanente acima do protagonista foi removido e substituído por uma aura difusa.

### Observação de instalação
A nova loja exige executar `drizzle/migrations/0006_fractal_shop_attributes_and_specials.sql` depois da migração `0005_fractal_shop_state.sql`. Sem a 0006, os novos botões de compra retornarão erro de melhoria inválida.
