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
