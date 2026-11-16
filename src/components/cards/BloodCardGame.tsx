import { useEffect, useState } from "react";
import { Heart, Skull, Sparkles, Swords, ArrowRight, Eye, Zap } from "lucide-react";

type CardId = "strike" | "guard" | "water_blade" | "blood_lance" | "ardil" | "corruption" | "mad_draconate" | "chain" | "impure_heart" | "last_second";
type Phase = "intro" | "battle" | "reward" | "victory" | "defeat";
type Intent = { kind: "attack" | "heavy" | "guard"; value: number };
type Game = {
  phase: Phase; draw: CardId[]; hand: CardId[]; discard: CardId[];
  enemyIndex: number; enemyHp: number; enemyMaxHp: number; enemyName: string;
  mana: number; manaSpent: number; block: number; turn: number; intent: Intent;
  log: string[]; seed: boolean; corruptionUsed: number; dragonUnlocked: boolean;
  artifacts: string[]; kills: number; bladeKills: number; bladeEvolved: boolean;
  bleed: number; lastSecond: boolean; rewardChoices: CardId[];
  hannaUsed: boolean; skullUsed: boolean; lastPlayedCard: CardId | null;
};

const CARD_INFO: Record<CardId, { name: string; cost: number; type: string; text: string; power: string }> = {
  strike: { name: "Golpe", cost: 1, type: "Ataque", text: "Causa 6 de dano.", power: "⚔" },
  guard: { name: "Defesa Instintiva", cost: 1, type: "Defesa", text: "Recebe 8 de bloqueio.", power: "◈" },
  water_blade: { name: "Lâmina d'Água", cost: 1, type: "Ataque", text: "Causa 8 de dano. Missão: derrote 100 monstros para evoluir.", power: "〰" },
  blood_lance: { name: "Lança de Sangue", cost: 1, type: "Ataque · Evoluída", text: "Causa 16 de dano e aplica 3 de sangramento por 2 turnos.", power: "†" },
  ardil: { name: "Ardil", cost: 1, type: "Defesa · Rebate", text: "Anula o próximo ataque e devolve todo o dano ao agressor.", power: "⛨" },
  corruption: { name: "Corrupção", cost: 0, type: "Maldição", text: "Ao usar: perca 2 cartas de vida. Se não usar neste turno: perca 4.", power: "✹" },
  mad_draconate: { name: "Draconato Louco", cost: 0, type: "Lendária · Secreta", text: "Causa 10× a mana gasta neste turno a TODOS os inimigos.", power: "⚡" },
  chain: { name: "Correntes do Além", cost: 2, type: "Controle", text: "Causa 4 de dano e reduz o próximo ataque inimigo pela metade.", power: "⛓" },
  impure_heart: { name: "Coração Impuro", cost: 0, type: "Sacrifício", text: "Destrói 1 carta de vida e causa 12 de dano.", power: "♥" },
  last_second: { name: "Último Segundo", cost: 1, type: "Magia", text: "Ganha 12 de bloqueio e compra 1 carta.", power: "⌛" },
};

const ENEMIES = [
  { name: "Carniçal das Fendas", hp: 34, attack: 6 },
  { name: "Cavaleiro sem Rosto", hp: 48, attack: 8 },
  { name: "Arauto da Ruína", hp: 68, attack: 10 },
  { name: "Ceifador das Fendas", hp: 100, attack: 13 },
];
const shuffle = <T,>(items: T[]) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
};
const lifeCount = (g: Game) => g.draw.length + g.hand.length + g.discard.length;
const addLog = (g: Game, message: string): Game => ({ ...g, log: [message, ...g.log].slice(0, 7) });

function drawCards(g: Game, count: number): Game {
  let next = { ...g, draw: [...g.draw], hand: [...g.hand], discard: [...g.discard] };
  for (let i = 0; i < count; i++) {
    if (!next.draw.length && next.discard.length) { next.draw = shuffle(next.discard); next.discard = []; }
    if (!next.draw.length) break;
    next.hand.push(next.draw.pop()!);
  }
  return next;
}
function destroyLife(g: Game, amount: number): Game {
  let next = { ...g, draw: [...g.draw], discard: [...g.discard], hand: [...g.hand] };
  let left = amount;
  while (left > 0) {
    if (next.draw.length) next.draw.pop();
    else if (next.discard.length) next.discard.pop();
    else if (next.hand.length) next.hand.pop();
    else break;
    left--;
  }
  if (lifeCount(next) <= 0) next.phase = "defeat";
  return next;
}
function makeIntent(index: number, turn: number): Intent {
  const base = ENEMIES[index].attack;
  if (turn % 3 === 0) return { kind: "heavy", value: base + 5 };
  if (turn % 2 === 0) return { kind: "guard", value: Math.max(2, base - 2) };
  return { kind: "attack", value: base };
}
function makeGame(seed: boolean, artifacts: string[], progress: { kills: number; bladeKills: number; bladeEvolved: boolean }): Game {
  const enemy = ENEMIES[0];
  const deck: CardId[] = [...Array(7).fill("strike" as CardId), ...Array(6).fill("guard" as CardId), "water_blade", "ardil", "chain", "last_second", "impure_heart"];
  if (progress.bladeEvolved) deck[13] = "blood_lance";
  const initial: Game = {
    phase: "battle", draw: shuffle(seed ? [...deck, ...Array(6).fill("corruption" as CardId)] : deck),
    hand: [], discard: [], enemyIndex: 0, enemyHp: enemy.hp, enemyMaxHp: enemy.hp, enemyName: enemy.name,
    mana: 3, manaSpent: 0, block: 0, turn: 1, intent: makeIntent(0, 1), log: ["A expedição começou. O baralho é sua vida."],
    seed, corruptionUsed: 0, dragonUnlocked: false, artifacts, kills: progress.kills, bladeKills: progress.bladeKills,
    bladeEvolved: progress.bladeEvolved, bleed: 0, lastSecond: false, rewardChoices: [],
    hannaUsed: false, skullUsed: false, lastPlayedCard: null,
  };
  return drawCards(initial, 5);
}
function nextEnemy(g: Game): Game {
  const index = g.enemyIndex + 1;
  if (index >= ENEMIES.length) return { ...g, phase: "victory" };
  const enemy = ENEMIES[index];
  const next = { ...g, phase: "battle" as Phase, enemyIndex: index, enemyHp: enemy.hp, enemyMaxHp: enemy.hp, enemyName: enemy.name, turn: 1, mana: 3, manaSpent: 0, block: 0, bleed: 0, corruptionUsed: 0, dragonUnlocked: false, intent: makeIntent(index, 1), draw: shuffle([...g.draw, ...g.discard]), discard: [], hand: [], rewardChoices: [], hannaUsed: false, skullUsed: false, lastPlayedCard: null };
  return drawCards(next, 5);
}
function cardColor(id: CardId) {
  if (id === "corruption") return "border-rose-500/70 from-rose-950 to-[#18090f]";
  if (id === "ardil" || id === "guard" || id === "last_second") return "border-sky-400/60 from-sky-950 to-[#0a1420]";
  if (id === "mad_draconate" || id === "blood_lance" || id === "water_blade") return "border-amber-400/60 from-amber-950 to-[#21120a]";
  return "border-violet-400/50 from-violet-950 to-[#100d1b]";
}

export function BloodCardGame() {
  const [selectedArtifacts, setSelectedArtifacts] = useState<string[]>([]);
  const [game, setGame] = useState<Game | null>(null);
  const [progress, setProgress] = useState({ kills: 0, bladeKills: 0, bladeEvolved: false });
  const [notice, setNotice] = useState("");
  useEffect(() => {
    try { const raw = localStorage.getItem("gd-koda-blood-card-progress"); if (raw) setProgress({ kills: Number(JSON.parse(raw).kills) || 0, bladeKills: Number(JSON.parse(raw).bladeKills) || 0, bladeEvolved: !!JSON.parse(raw).bladeEvolved }); } catch { /* progresso local opcional */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("gd-koda-blood-card-progress", JSON.stringify(progress)); } catch { /* armazenamento indisponível */ }
  }, [progress]);

  const begin = () => { setNotice(""); setGame(makeGame(selectedArtifacts.includes("Semente do Mal"), selectedArtifacts, progress)); };
  const play = (index: number) => {
    if (!game || game.phase !== "battle") return;
    const id = game.hand[index];
    const card = CARD_INFO[id];
    if (!card || card.cost > game.mana) { setNotice("Mana insuficiente."); return; }
    let g: Game = { ...game, hand: game.hand.filter((_, i) => i !== index), mana: game.mana - card.cost, manaSpent: game.manaSpent + card.cost, lastPlayedCard: id };
    if (id === "strike") g.enemyHp -= 6;
    if (id === "water_blade") g.enemyHp -= 8;
    if (id === "blood_lance") { g.enemyHp -= 16; g.bleed = Math.max(g.bleed, 2); }
    if (id === "guard") g.block += 8;
    if (id === "ardil") { g.block += g.intent.value; g.enemyHp -= g.intent.value; g.intent = { ...g.intent, value: 0 }; }
    if (id === "chain") { g.enemyHp -= 4; g.intent = { ...g.intent, value: Math.ceil(g.intent.value / 2) }; }
    if (id === "impure_heart") { g = destroyLife(g, 1); g.enemyHp -= 12; }
    if (id === "last_second") { g.block += 12; g = drawCards(g, 1); }
    if (id === "corruption") { g = destroyLife(g, 2); g.corruptionUsed += 1; if (g.corruptionUsed >= 6 && !g.dragonUnlocked) { g.dragonUnlocked = true; g.hand.push("mad_draconate"); g = addLog(g, "SEGREDO DESBLOQUEADO: Draconato Louco!"); } }
    if (id === "mad_draconate") { const damage = g.manaSpent * 10; g.enemyHp -= damage; g = addLog(g, `O Draconato Louco libera ${damage} de dano em área!`); }
    if (g.phase === "defeat") { setGame(g); return; }
    if (id !== "corruption" && id !== "mad_draconate") g.discard.push(id);
    g = addLog(g, `${card.name}: ${id === "mad_draconate" ? g.manaSpent * 10 + " de dano em área" : card.text}`);
    if (g.enemyHp <= 0) {
      g.enemyHp = 0; g.kills += 1;
      if (g.draw.includes("water_blade") || g.discard.includes("water_blade") || g.hand.includes("water_blade")) g.bladeKills += 1;
      if (!g.bladeEvolved && g.bladeKills >= 100) { g.bladeEvolved = true; g.draw = g.draw.map(c => c === "water_blade" ? "blood_lance" : c); g.discard = g.discard.map(c => c === "water_blade" ? "blood_lance" : c); g.hand = g.hand.map(c => c === "water_blade" ? "blood_lance" : c); }
      setProgress({ kills: g.kills, bladeKills: g.bladeKills, bladeEvolved: g.bladeEvolved });
      if (g.enemyIndex === ENEMIES.length - 1) g.phase = "victory";
      else { g.phase = "reward"; g.rewardChoices = shuffle(["strike", "guard", "chain", "last_second", "impure_heart", "ardil"] as CardId[]).slice(0, 3); }
    }
    setGame(g);
  };
  const endTurn = () => {
    if (!game || game.phase !== "battle") return;
    let g: Game = { ...game, hand: [...game.hand], discard: [...game.discard], draw: [...game.draw] };
    const unusedCorruption = g.hand.filter(c => c === "corruption").length;
    if (unusedCorruption) { g = destroyLife(g, unusedCorruption * 4); g = addLog(g, `A Corrupção puniu você: ${unusedCorruption * 4} cartas de vida perdidas.`); }
    g.discard.push(...g.hand.filter(c => c !== "corruption")); g.hand = [];
    if (g.phase === "defeat") { setGame(g); return; }
    if (g.bleed > 0) { g.enemyHp -= 3; g.bleed -= 1; g = addLog(g, "Sangramento: 3 de dano."); }
    if (g.enemyHp <= 0) {
      g.enemyHp = 0; g.kills += 1;
      if (!g.bladeEvolved && (g.draw.includes("water_blade") || g.discard.includes("water_blade") || g.hand.includes("water_blade"))) {
        g.bladeKills += 1;
        if (g.bladeKills >= 100) {
          g.bladeEvolved = true;
          g.draw = g.draw.map(c => c === "water_blade" ? "blood_lance" : c);
          g.discard = g.discard.map(c => c === "water_blade" ? "blood_lance" : c);
          g.hand = g.hand.map(c => c === "water_blade" ? "blood_lance" : c);
        }
      }
      if (g.enemyIndex === ENEMIES.length - 1) g.phase = "victory";
      else { g.phase = "reward"; g.rewardChoices = shuffle(["strike", "guard", "chain", "last_second", "impure_heart", "ardil"] as CardId[]).slice(0, 3); }
      setProgress({ kills: g.kills, bladeKills: g.bladeKills, bladeEvolved: g.bladeEvolved }); setGame(g); return;
    }
    const incoming = g.intent.value;
    const absorbed = Math.min(g.block, incoming);
    let actual = Math.max(0, incoming - g.block);
    g.block = 0;
    if (actual > 0 && g.artifacts.includes("Véu de Hanna") && !g.hannaUsed) {
      actual -= 1; g.hannaUsed = true;
      g = addLog(g, "Hanna tomou uma lembrança para si e impediu a perda de 1 carta.");
    }
    const lost = actual;
    if (lost > 0) g = destroyLife(g, lost);
    if (lost >= 3 && g.artifacts.includes("Crânio de Rogério") && !g.skullUsed && g.lastPlayedCard && g.lastPlayedCard !== "corruption" && g.lastPlayedCard !== "mad_draconate") {
      const recoveredIndex = g.discard.lastIndexOf(g.lastPlayedCard);
      const recovered = recoveredIndex >= 0 ? g.discard.splice(recoveredIndex, 1)[0] : g.lastPlayedCard;
      g.hand.push(recovered); g.skullUsed = true;
      g = addLog(g, `O Crânio de Rogério devolveu ${CARD_INFO[recovered].name} à sua mão.`);
    }
    g = addLog(g, absorbed > 0 ? `Defesa absorveu ${absorbed}; ${lost} cartas de vida perdidas.` : `O inimigo atingiu você: ${lost} cartas de vida perdidas.`);
    if (g.phase === "defeat") { setGame(g); return; }
    g.turn += 1; g.mana = 3; g.manaSpent = 0; g.intent = makeIntent(g.enemyIndex, g.turn);
    g = drawCards(g, 5);
    setGame(g);
  };
  const takeReward = (id: CardId | null) => {
    if (!game) return;
    if (!id) { setGame(nextEnemy(game)); return; }
    const next = { ...game, draw: shuffle([...game.draw, ...game.discard, id]), discard: [], hand: [] };
    setGame(nextEnemy(next));
  };
  const totalLife = game ? lifeCount(game) : 0;
  const canPlay = (id: CardId) => !!game && game.mana >= CARD_INFO[id].cost && game.phase === "battle";

  return (
    <div className="space-y-5 text-foreground">
      {!game && <section className="relative overflow-hidden rounded-3xl border border-rose-300/20 bg-[radial-gradient(ellipse_at_top,rgba(127,29,29,.42),transparent_55%),linear-gradient(145deg,#171018,#09090d)] p-5 shadow-2xl sm:p-8">
        <div className="absolute -right-10 -top-12 text-[180px] opacity-[.06]">☠</div>
        <p className="text-xs font-bold uppercase tracking-[.3em] text-rose-300">Roguelike · Deckbuilder</p>
        <h1 className="mt-2 font-display text-4xl text-rose-50 sm:text-5xl">Sangue das Fendas</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-rose-100/70">Nas Fendas, cada carta é uma lembrança que mantém você vivo. Ataques inimigos destroem cartas do seu baralho. Quando não restar nenhuma, sua expedição termina.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><Heart className="mb-2 h-5 w-5 text-rose-300"/><b className="text-sm text-rose-50">Baralho é vida</b><p className="mt-1 text-xs text-rose-100/60">Cada ponto de dano destrói uma carta permanentemente nesta expedição.</p></div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><Zap className="mb-2 h-5 w-5 text-amber-300"/><b className="text-sm text-rose-50">3 de mana por turno</b><p className="mt-1 text-xs text-rose-100/60">Compre 5 cartas e escolha cuidadosamente como gastar sua energia.</p></div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><Skull className="mb-2 h-5 w-5 text-violet-300"/><b className="text-sm text-rose-50">4 encontros</b><p className="mt-1 text-xs text-rose-100/60">Sobreviva a três criaturas e enfrente o Ceifador das Fendas.</p></div>
        </div>
        <div className="mt-6 rounded-2xl border border-rose-200/15 bg-black/25 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-50"><Sparkles className="h-4 w-4 text-amber-300"/> Escolha seus artefatos iniciais</div>
          <p className="mt-1 text-xs text-rose-100/55">Você pode iniciar sem artefatos ou aceitar uma maldição em troca de poder oculto.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              { name: "Semente do Mal", desc: "Insere 6 Corrupções no baralho. Use-as para perder 2 cartas de vida; se deixar na mão ao fim do turno, perde 4 por carta.", icon: "✹" },
              { name: "Véu de Hanna", desc: "Uma vez por combate, impede a perda de 1 carta quando você receber dano.", icon: "☽" },
              { name: "Crânio de Rogério", desc: "Uma vez por combate, quando perder 3 ou mais cartas num ataque, recupera uma carta jogada para a mão.", icon: "☠" },
            ].map(a => <button key={a.name} onClick={() => setSelectedArtifacts(v => v.includes(a.name) ? v.filter(x => x !== a.name) : [...v, a.name])} className={`rounded-xl border p-3 text-left transition ${selectedArtifacts.includes(a.name) ? "border-rose-300 bg-rose-950/50" : "border-white/10 bg-white/[.03] hover:bg-white/[.07]"}`}><span className="text-xl">{a.icon}</span><b className="mt-1 block text-sm text-rose-50">{a.name}</b><span className="mt-1 block text-[11px] leading-4 text-rose-100/60">{a.desc}</span></button>)}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-rose-100/55">Progresso da Lâmina d'Água: <b className="text-amber-200">{progress.bladeEvolved ? "Evoluída · Lança de Sangue" : `${progress.bladeKills}/100 monstros`}</b><br/>Abates totais: {progress.kills}</div>
          <button onClick={begin} className="inline-flex h-12 items-center gap-2 rounded-xl bg-rose-700 px-6 font-semibold text-white shadow-lg transition hover:bg-rose-600"><Swords className="h-4 w-4"/> Iniciar expedição <ArrowRight className="h-4 w-4"/></button>
        </div>
      </section>}

      {game && <section className="space-y-4">
        {notice && <p role="status" className="rounded-xl border border-amber-300/20 bg-amber-950/30 px-4 py-2 text-xs text-amber-100">{notice}</p>}
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200/15 bg-[#110d14] p-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[.25em] text-rose-300/70">Expedição · Encontro {game.enemyIndex + 1}/4</p><h2 className="font-display text-2xl text-rose-50">Sangue das Fendas</h2></div>
          <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-lg border border-rose-300/20 bg-rose-950/40 px-3 py-2 text-rose-100"><Heart className="mr-1 inline h-3.5 w-3.5"/> {totalLife} cartas de vida</span><span className="rounded-lg border border-amber-300/20 bg-amber-950/30 px-3 py-2 text-amber-100"><Zap className="mr-1 inline h-3.5 w-3.5"/> {game.mana}/3 mana</span><span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white/70">Turno {game.turn}</span></div>
        </header>
        {game.phase === "battle" && <>
          <div className="grid gap-3 lg:grid-cols-[1fr_250px]">
            <div className="relative overflow-hidden rounded-2xl border border-rose-200/15 bg-[radial-gradient(ellipse_at_center,rgba(127,29,29,.22),transparent_65%),#100c12] p-5 text-center">
              <div className="text-6xl drop-shadow-[0_0_24px_rgba(190,24,93,.3)]">{game.enemyIndex === 3 ? "☠️" : game.enemyIndex === 2 ? "👁️" : game.enemyIndex === 1 ? "⚔️" : "👹"}</div>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[.25em] text-rose-300/60">{game.enemyIndex === 3 ? "Chefe final" : "Criatura das Fendas"}</p>
              <h3 className="font-display text-2xl text-rose-50">{game.enemyName}</h3>
              <div className="mx-auto mt-4 max-w-md">
                <div className="mb-1 flex justify-between text-xs text-rose-100/70"><span>Vitalidade</span><b>{game.enemyHp}/{game.enemyMaxHp}</b></div>
                <div className="h-3 overflow-hidden rounded-full bg-black/60"><div className="h-full rounded-full bg-gradient-to-r from-rose-800 to-red-400 transition-all" style={{ width: `${Math.max(0, game.enemyHp / game.enemyMaxHp * 100)}%` }}/></div>
              </div>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-950/40 px-4 py-2 text-xs text-amber-100"><Eye className="h-4 w-4"/>{game.intent.kind === "guard" ? `Ataque enfraquecido: ${game.intent.value}` : game.intent.kind === "heavy" ? `Ataque pesado: ${game.intent.value}` : `Pretende atacar: ${game.intent.value} cartas`}</div>
              {game.bleed > 0 && <p className="mt-2 text-xs text-rose-300">Sangramento ativo · próximo turno</p>}
            </div>
            <aside className="rounded-2xl border border-white/10 bg-[#100d14] p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-rose-100/50">Estado do jogador</p>
              <div className="mt-4 space-y-3"><div><div className="flex justify-between text-xs"><span>Baralho / vida</span><b>{totalLife}</b></div><div className="mt-1 h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-rose-500" style={{width:`${Math.max(0,totalLife/20*100)}%`}}/></div></div><div className="flex justify-between text-xs"><span className="text-white/55">Bloqueio</span><b className="text-sky-300">{game.block}</b></div><div className="flex justify-between text-xs"><span className="text-white/55">Compra / descarte</span><b>{game.draw.length} / {game.discard.length}</b></div><div className="flex justify-between text-xs"><span className="text-white/55">Mana gasta no turno</span><b className="text-amber-200">{game.manaSpent}</b></div></div>
              {game.artifacts.length > 0 && <div className="mt-4 border-t border-white/10 pt-3"><p className="text-[10px] uppercase tracking-widest text-white/40">Artefatos</p><div className="mt-2 flex flex-wrap gap-1">{game.artifacts.map(a=><span key={a} className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-amber-100">{a}</span>)}</div></div>}
            </aside>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#100d14] p-4">
            <div className="mb-3 flex items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-rose-200/50">Sua mão</p><p className="text-xs text-white/45">Selecione uma carta para jogar</p></div><span className="text-xs text-amber-200">{game.hand.length} cartas</span></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {game.hand.map((id,index)=>{const c=CARD_INFO[id];return <button key={`${id}-${index}`} disabled={!canPlay(id)} onClick={()=>play(index)} className={`group relative flex min-h-[190px] flex-col rounded-xl border bg-gradient-to-b p-3 text-left transition hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-45 ${cardColor(id)}`}><span className="absolute right-2 top-2 rounded-full bg-black/45 px-2 py-1 text-[10px] font-bold text-amber-200">{c.cost} mana</span><span className="mt-4 text-3xl text-amber-100">{c.power}</span><b className="mt-3 text-sm leading-tight text-white">{c.name}</b><span className="mt-2 text-[11px] leading-4 text-white/65">{c.text}</span><span className="mt-auto pt-3 text-[9px] font-bold uppercase tracking-widest text-white/35">{c.type}</span></button>})}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="text-xs text-white/45">Descarte: {game.discard.length} · Compra: {game.draw.length}</div><button onClick={endTurn} className="inline-flex h-11 items-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-bold text-black transition hover:bg-amber-400">Encerrar turno <ArrowRight className="h-4 w-4"/></button></div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/35">Crônica do combate</p>{game.log.map((line,i)=><p key={i} className={`text-xs leading-5 ${i===0?"text-rose-100":"text-white/40"}`}>{line}</p>)}</div>
        </>}
        {game.phase === "reward" && <div className="rounded-2xl border border-amber-200/20 bg-[linear-gradient(145deg,#24170f,#100d12)] p-5 text-center"><Sparkles className="mx-auto h-8 w-8 text-amber-300"/><p className="mt-2 text-[10px] font-bold uppercase tracking-[.25em] text-amber-200/60">Vitória no encontro</p><h3 className="mt-1 font-display text-3xl text-amber-50">Escolha uma carta</h3><p className="mt-2 text-sm text-amber-100/60">Adicione uma carta ao seu baralho ou siga sem recompensa.</p><div className="mt-5 grid gap-3 sm:grid-cols-3">{game.rewardChoices.map((id,i)=><button key={id} onClick={()=>takeReward(id)} className={`min-h-36 rounded-xl border bg-gradient-to-b p-4 text-left ${cardColor(id)}`}><span className="text-2xl">{CARD_INFO[id].power}</span><b className="mt-2 block text-white">{CARD_INFO[id].name}</b><span className="mt-1 block text-xs text-white/60">{CARD_INFO[id].text}</span></button>)}</div><button onClick={()=>takeReward(null)} className="mt-4 text-xs text-white/50 underline">Continuar sem carta</button></div>}
        {game.phase === "victory" && <div className="rounded-2xl border border-amber-200/20 bg-[#171019] p-8 text-center"><Sparkles className="mx-auto h-12 w-12 text-amber-300"/><h3 className="mt-3 font-display text-4xl text-amber-50">A Fenda foi selada</h3><p className="mt-2 text-sm text-white/60">Você derrotou o Ceifador e sobreviveu com {totalLife} cartas de vida.</p><button onClick={()=>setGame(null)} className="mt-5 rounded-xl bg-amber-500 px-6 py-3 font-semibold text-black">Voltar ao santuário</button></div>}
        {game.phase === "defeat" && <div className="rounded-2xl border border-rose-300/20 bg-[#1b0b13] p-8 text-center"><Skull className="mx-auto h-12 w-12 text-rose-300"/><h3 className="mt-3 font-display text-4xl text-rose-100">O baralho se esgotou</h3><p className="mt-2 text-sm text-rose-100/60">As Fendas consumiram suas últimas lembranças. Você derrotou {game.kills} criaturas nesta expedição.</p><button onClick={()=>setGame(null)} className="mt-5 rounded-xl bg-rose-700 px-6 py-3 font-semibold text-white">Tentar novamente</button></div>}
      </section>}
    </div>
  );
}
