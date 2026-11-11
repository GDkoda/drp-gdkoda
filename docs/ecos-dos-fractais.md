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


## Revisão de progressão e relíquias — 11 de novembro de 2026

### Raridade das relíquias
- Todas as Relíquias de Campo e a Âncora da Alma são de raridade **Incomum**.
- A raridade Incomum é fixa: Ressonância Rara e Transmutação Rúnica não alteram seu efeito.
- As cartas usam identidade visual vermelho/dourado para distinguir relíquias das dádivas comuns, raras, épicas e lendárias.

### Novos limites
- Vida Reforçada: 15 níveis, +10 HP máximo por nível (+150 HP no máximo).
- Ímã de Fragmentos: até 10 coletas por expedição, +10% por coleta (+100%).
- Eco do Conhecimento: até 10 coletas por expedição, +5% de XP por coleta (+50%).
- Alcance Arcano: permanece limitado a 5 coletas (+50%).
- Coroa de Estilhaços: permanece limitada a 2 projéteis extras.

### Desbloqueio e espólio das Relíquias de Campo
- Nível 1 da compra libera a relíquia na seleção de dádivas (o Oráculo nível 1 também libera as quatro relíquias).
- Nível 2: 1% de chance compartilhada de queda por Brutos e Elites.
- Nível 3: 3% de chance compartilhada.
- Nível 4: 5% de chance compartilhada.
- A chance compartilhada usa o maior nível comprado entre as quatro relíquias; o espólio continua sorteando apenas entre as relíquias que o jogador desbloqueou individualmente.
- As coletas de Área e Experiência agora respeitam o limite de 10 durante escolhas de nível e espólios.
- Fortuna Fractal possui 5 níveis, cada um adicionando 10% de chance relativa aos espólios especiais, até +50%. Não cria a chance-base de queda de Relíquias; ela multiplica a chance liberada pelos níveis das relíquias.

### Oráculo das Relíquias
- Nível 1 libera a possibilidade de encontrar qualquer uma das quatro Relíquias de Campo nas opções normais de subida de nível.
- Além disso, cada nível do Oráculo aumenta em 6 pontos percentuais a chance de uma quarta opção extra, sempre uma Relíquia de Campo elegível.
- O bônus é limitado a 50%; níveis 9 e 10 permanecem em 50%.

### Âncora da Alma
- A compra passou a ter 3 níveis.
- Nível 1 libera a dádiva e permite obter até duas Âncoras por expedição, sempre com apenas uma equipada por vez. A primeira consumida abre espaço para a segunda; após a segunda, não há nova Âncora.
- Nível 1: ressurreição com 40% de vida e 3 segundos de invulnerabilidade.
- Nível 2: ressurreição com 60% de vida e 6 segundos de invulnerabilidade.
- Nível 3: na segunda ressurreição, uma explosão atinge os inimigos num raio de 260 unidades, causando dano equivalente ao golpe atual da arma equipada.
- Custos: 3.500 / 7.000 / 20.000 fractais.

### Compatibilidade das Relíquias por arma
Estado da implementação nesta revisão:
- Revólver do Vazio (Pistola): Ricochete, Perfuração e Descarga em Cadeia funcionam nos projéteis normais. Ressonância de Alcance também funciona. Coroa de Estilhaços adiciona projéteis; depois da evolução, os seis disparos-base continuam somando os extras coletados.
- Núcleo Instável: os projéteis principais aceitam Ricochete, Perfuração, Descarga em Cadeia e Ressonância de Alcance. Os estilhaços da explosão secundária não recebem novos ricochetes/perfurações/cadeias. Coroa de Estilhaços ainda não aumenta a quantidade de orbes do Núcleo.
- Foice Espectral: os cortes são disparos auxiliares direcionados; não aceitam atualmente Ricochete, Perfuração, Descarga em Cadeia, Ressonância de Alcance ou Coroa de Estilhaços.
- Espadas Orbitais: os impactos das lâminas são direcionados individualmente; não aceitam atualmente as três relíquias de comportamento, Ressonância de Alcance ou Coroa de Estilhaços.
- Grilhão Gravitacional: o pulso de atração escolhe vários inimigos e gera impactos direcionados; não aceita atualmente as três relíquias de comportamento, Ressonância de Alcance ou Coroa de Estilhaços.
- Sentinelas Rúnicas: os disparos são direcionados e estão marcados como auxiliares; apesar de serem projéteis visuais, não aceitam atualmente Ricochete, Perfuração, Descarga em Cadeia, Ressonância de Alcance ou Coroa de Estilhaços.

Área e Experiência são efeitos globais e funcionam com qualquer arma. A compatibilidade descrita acima é específica das relíquias que alteram projéteis. Não anunciar efeitos não conectados até uma adaptação específica de cada arma.

### Resposta visual e desempenho
- O tremor de câmera por dano de contato comum foi removido; o flash vermelho de dano permanece.
- Tremores suaves ficam reservados a eventos de maior impacto, evitando o deslocamento aleatório da câmera a cada quadro.


## Ajustes de progressão e relíquias — novembro de 2026

### Raridade e apresentação
- Relíquias de Campo e Âncora da Alma têm raridade Incomum fixa; não recebem bônus da Ressonância Rara nem da Transmutação Rúnica.
- As cartas Incomuns usam moldura vermelho/dourada para se distinguirem das demais raridades.

### Relíquias de Campo
- Ímã de Fragmentos: cada coleta concede +10% de raio de coleta, até +100% em 10 coletas.
- Eco do Conhecimento: cada coleta concede +5% de experiência, até +50% em 10 coletas.
- Nível 1 de cada categoria libera a relíquia nas escolhas de nível; níveis 2, 3 e 4 habilitam respectivamente 1%, 3% e 5% de chance-base de queda de Brutos e Elites.
- A chance de queda continua compartilhada: usa o maior nível de desbloqueio entre as quatro categorias, depois aplica o bônus relativo de Fortuna Fractal.

### Permanentes
- Vida Reforçada: máximo de 15 níveis, +10 HP por nível (+150 HP).
- Fortuna Fractal: máximo de 5 níveis, bônus relativo de +10% por nível, até +50%.
- Oráculo das Relíquias: nível 1 libera a possibilidade de encontrar as quatro Relíquias de Campo. Além disso, concede chance de uma quarta carta: 6% por nível, com limite de 50%.
- Âncora da Alma: três níveis; N1 concede ressurreição com 40% de vida e 3 s de invulnerabilidade; N2 melhora para 60% e 6 s; N3 faz a segunda ressurreição causar dano em inimigos próximos igual ao golpe da arma equipada. Apenas uma Âncora pode estar equipada por vez, com até duas aquisições em uma expedição.

### Compatibilidade das relíquias de projéteis
- Revólver do Vazio: Ricochete, Perfuração e Descarga em Cadeia atuam nos projéteis normais.
- Núcleo Instável: as três atuam no orbe principal; estilhaços de explosão não propagam novamente essas propriedades.
- Foice Espectral, Espadas Orbitais, Grilhão Gravitacional e Sentinelas Rúnicas: ainda usam ataques próprios que não encaminham essas propriedades para a rotina comum de projéteis. A integração dessas armas exige uma adaptação específica de design e não foi feita nesta atualização.

### Diagnóstico técnico
- O Ricochete não tem concessão gratuita no código: os projéteis comuns recebem somente o nível persistido da compra. A migração nova normaliza valores malformados, mas preserva níveis numéricos válidos; se o efeito continuar com a loja mostrando 0/3, é necessário inspecionar o estado específico da conta.
- A vibração da câmera não é acionada quando o jogador recebe dano. O clarão vermelho e a aura são efeitos de renderização; a origem de eventual queda de FPS ainda precisa ser medida em execução real.
- Migração SQL aditiva para alinhar a RPC de compra aos níveis/custos atuais: `supabase/migrations/20261111020000_fractal_shop_progression_caps.sql`. Há cópia correspondente em `drizzle/migrations/0011_fractal_shop_progression_caps.sql`.
