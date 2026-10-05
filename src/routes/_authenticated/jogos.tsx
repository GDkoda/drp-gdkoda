import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { rpc, useRefresh, useMe } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, Swords, Dice5, Brain } from "lucide-react";

export const Route = createFileRoute("/_authenticated/jogos")({
  head: () => ({ meta: [{ title: "Mini-jogos — Mesa 3D&T" }, { name: "description", content: "Combate, dados da taverna e enigmas." }] }),
  component: Jogos,
});

type LogEntry = { turn: number; who: string; fa: number; fd: number; dmg: number; crit: boolean; hp: number };

function Jogos() {
  const refresh = useRefresh();
  const { data: me } = useMe();
  const { data: vigor, refetch } = useQuery({ queryKey: ["vigor"], queryFn: () => rpc("get_vigor", {}) as Promise<number> });
  const after = () => { refetch(); refresh(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-gold">Mini-jogos</h1>
        <span className="flex items-center gap-1 font-display text-mana"><Zap className="h-4 w-4" />{vigor ?? "…"} vigor</span>
      </div>
      <p className="text-sm text-muted-foreground">O vigor renova todo dia. Combate custa 2, dados e enigmas custam 1.</p>
      <Tabs defaultValue="combat">
        <TabsList className="w-full">
          <TabsTrigger value="combat" className="flex-1"><Swords className="h-4 w-4" />Combate</TabsTrigger>
          <TabsTrigger value="dice" className="flex-1"><Dice5 className="h-4 w-4" />Dados</TabsTrigger>
          <TabsTrigger value="puzzle" className="flex-1"><Brain className="h-4 w-4" />Enigmas</TabsTrigger>
        </TabsList>
        <TabsContent value="combat"><Combat onDone={after} hasActive={!!me?.profile?.active_character_id} /></TabsContent>
        <TabsContent value="dice"><Dice onDone={after} /></TabsContent>
        <TabsContent value="puzzle"><Puzzle onDone={after} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Combat({ onDone, hasActive }: { onDone: () => void; hasActive: boolean }) {
  const [res, setRes] = useState<{ monster: string; hero: string; won: boolean; reward: number; xp: number; log: LogEntry[] } | null>(null);
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(false);
  async function fight() {
    setBusy(true);
    try {
      const r = await rpc("play_combat", {});
      setRes(r); setShown(0);
      r.log.forEach((_: unknown, i: number) => setTimeout(() => setShown(i + 1), 450 * (i + 1)));
      setTimeout(onDone, 450 * (r.log.length + 1));
    } finally { setBusy(false); }
  }
  const done = res && shown >= res.log.length;
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">Sua ficha ativa enfrenta um monstro. FA = F/PdF + H + 1d6 contra FD = A + H + 1d6. Um 6 no dado é crítico!</p>
      {!hasActive && <p className="text-sm text-destructive">Defina uma ficha ativa na tela de Fichas.</p>}
      <Button onClick={fight} disabled={busy || !hasActive || (!!res && !done)}>Lutar (2 vigor)</Button>
      {res && (
        <div>
          <h3 className="font-display">{res.hero} vs {res.monster}</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {res.log.slice(0, shown).map((l, i) => (
              <li key={i} className={l.who === "herói" ? "text-foreground" : "text-blood"}>
                T{l.turn} · {l.who === "herói" ? res.hero : l.who}: FA {l.fa} vs FD {l.fd} → {l.dmg} dano{l.crit ? " (CRÍTICO!)" : ""} · alvo com {l.hp} PV
              </li>
            ))}
          </ul>
          {done && <p className={`mt-2 font-display ${res.won ? "text-gold" : "text-blood"}`}>{res.won ? `Vitória! +${res.reward} moedas, +${res.xp} XP` : `Derrota… +${res.reward} moedas de consolo`}</p>}
        </div>
      )}
    </div>
  );
}

function Dice({ onDone }: { onDone: () => void }) {
  const [bet, setBet] = useState(10);
  const [res, setRes] = useState<{ player: number[]; house: number[]; result: string; delta: number } | null>(null);
  const face = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">Role 2d6 contra o taverneiro. Maior soma leva a aposta (o Mestre define o limite).</p>
      <div className="flex gap-2">
        <Input type="number" min={1} value={bet} onChange={(e) => setBet(+e.target.value)} className="w-24" />
        <Button onClick={async () => { setRes(await rpc("play_dice", { _bet: bet })); onDone(); }}>Rolar (1 vigor)</Button>
      </div>
      {res && (
        <div className="grid grid-cols-2 gap-3 text-center">
          <div><div className="text-xs text-muted-foreground">Você</div><div className="text-5xl">{res.player.map((d) => face[d]).join(" ")}</div><div>{res.player.reduce((a, b) => a + b, 0)}</div></div>
          <div><div className="text-xs text-muted-foreground">Taverneiro</div><div className="text-5xl">{res.house.map((d) => face[d]).join(" ")}</div><div>{res.house.reduce((a, b) => a + b, 0)}</div></div>
          <p className={`col-span-2 font-display ${res.delta > 0 ? "text-gold" : res.delta < 0 ? "text-blood" : ""}`}>
            {res.result.toUpperCase()} {res.delta ? `(${res.delta > 0 ? "+" : ""}${res.delta} moedas)` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function Puzzle({ onDone }: { onDone: () => void }) {
  const [p, setP] = useState<{ id: string; question: string } | null>(null);
  const [ans, setAns] = useState("");
  const [res, setRes] = useState<{ correct: boolean; answer: string; reward: number } | null>(null);
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">Uma tentativa por enigma, 10 minutos para responder. Acerto vale 15 moedas.</p>
      <Button onClick={async () => { setP(await rpc("start_puzzle", {})); setRes(null); setAns(""); onDone(); }}>Novo enigma (1 vigor)</Button>
      {p && (
        <div className="space-y-2">
          <p className="font-display">{p.question}</p>
          {!res && (
            <div className="flex gap-2">
              <Input value={ans} onChange={(e) => setAns(e.target.value)} placeholder="Resposta" inputMode="numeric" />
              <Button disabled={!ans} onClick={async () => { setRes(await rpc("solve_puzzle", { _id: p.id, _answer: ans })); onDone(); }}>Responder</Button>
            </div>
          )}
          {res && <p className={res.correct ? "text-gold" : "text-blood"}>{res.correct ? `Correto! +${res.reward} moedas` : `Errado. A resposta era ${res.answer}.`}</p>}
        </div>
      )}
    </div>
  );
}
