import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, sumBonus, d6, rpc, useRefresh, bonusLabel, type Trait } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, Dice6, Printer, Trash2, Plus, Star } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fichas/$id")({
  head: () => ({ meta: [{ title: "Ficha — Mesa 3D&T" }, { name: "description", content: "Ficha de personagem 3D&T Alpha." }] }),
  component: Sheet,
});

type Char = {
  id: string; owner_id: string; name: string; concept: string;
  f: number; h: number; r: number; a: number; pdf: number;
  pv_current: number; pm_current: number; pp_total: number; xp: number;
  advantages: Trait[]; disadvantages: Trait[]; skills: Trait[]; notes: string; known_spells: string[];
};

function Sheet() {
  const { id } = Route.useParams();
  const { data: me } = useMe();
  const refresh = useRefresh();
  const nav = useNavigate();
  const { data: loaded, isLoading, isError } = useQuery({
    queryKey: ["char", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("characters").select("*").eq("id", id).single();
      if (error) throw error;
      return data as unknown as Char;
    },
  });
  const { data: equipped } = useQuery({
    queryKey: ["equipped", id],
    queryFn: async () => (await supabase.from("chest_items").select("*").eq("equipped_character_id", id)).data ?? [],
  });
  const [c, setC] = useState<Char | null>(null);
  const [roll, setRoll] = useState<string | null>(null);
  useEffect(() => { if (loaded) setC(loaded); }, [loaded]);

  // autosave
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const first = useRef(true);
  useEffect(() => {
    if (!c) return;
    if (first.current) { first.current = false; return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { id: _i, owner_id: _o, ...rest } = c;
      const { error } = await supabase.from("characters").update({ ...rest, advantages: rest.advantages as any, disadvantages: rest.disadvantages as any, skills: rest.skills as any, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) toast.error(`Não foi possível salvar a ficha: ${error.message}`);
    }, 700);

    // Cancela o salvamento pendente se a ficha mudar ou o componente desmontar.
    return () => clearTimeout(timer.current);
  }, [c, id]);

  const b = useMemo(() => sumBonus(equipped ?? []), [equipped]);
  if (!c) return (
    <div className="character-sheet-loading">
      <div className="character-sheet-loading-mark"><Dice6 className="h-6 w-6" /></div>
      <p>{isLoading ? "Carregando ficha…" : isError ? "Não foi possível carregar esta ficha." : "Ficha indisponível."}</p>
      <Button variant="outline" onClick={() => nav({ to: "/fichas" })}><ChevronLeft className="h-4 w-4" />Voltar às fichas</Button>
    </div>
  );

  const F = c.f + b.f, H = c.h + b.h, R = c.r + b.r, A = c.a + b.a, P = c.pdf + b.pdf;
  const pvMax = Math.max(1, R * 5), pmMax = Math.max(1, R * 5);
  const sum = (l: Trait[]) => l.reduce((s, t) => s + (Number(t.cost) || 0), 0);
  const spent = c.f + c.h + c.r + c.a + c.pdf + sum(c.advantages) + sum(c.skills) - sum(c.disadvantages);
  const set = (patch: Partial<Char>) => setC({ ...c, ...patch });

  const rollFA = (useP: boolean) => { const d = d6(); setRoll(`FA (${useP ? "PdF" : "F"}): ${useP ? P : F} + H${H} + 1d6[${d}] = ${(useP ? P : F) + H + d}`); };
  const rollFD = () => { const d = d6(); setRoll(`FD: A${A} + H${H} + 1d6[${d}] = ${A + H + d}`); };

  return (
    <div className="character-sheet-page print-sheet space-y-4">
      <div className="character-sheet-heading no-print">
        <Button variant="ghost" size="sm" onClick={() => nav({ to: "/fichas" })}>
          <ChevronLeft className="h-4 w-4" />Voltar às fichas
        </Button>
        <div className="character-sheet-heading-copy">
          <span>PERSONAGEM · MESA 3D&T</span>
          <strong>{c.name?.trim() || "Ficha sem nome"}</strong>
        </div>
      </div>

      {/* Recursos e rolagens ficam agrupados e compactos no celular. */}
      <div className="character-resource-bar sticky top-[calc(3.75rem+env(safe-area-inset-top))] z-20 -mx-3 border-y bg-background/95 px-3 py-2 backdrop-blur sm:-mx-5 sm:px-5">
        <div className="character-vitals-grid">
          <Bar label="PV" cur={c.pv_current} max={pvMax} color="bg-blood" onChange={(v) => set({ pv_current: v })} />
          <Bar label="PM" cur={c.pm_current} max={pmMax} color="bg-mana" onChange={(v) => set({ pm_current: v })} />
        </div>
        <div className="character-roll-actions no-print">
          <Button size="sm" variant="secondary" onClick={() => rollFA(false)}><Dice6 className="h-4 w-4" />FA</Button>
          <Button size="sm" variant="secondary" onClick={() => rollFA(true)}>FA PdF</Button>
          <Button size="sm" variant="secondary" onClick={rollFD}>FD</Button>
        </div>
        {roll && <p className="character-roll-result font-display text-sm text-gold" aria-live="polite">{roll}</p>}
      </div>

      <section className="character-identity-grid">
        <label className="character-field">
          <span>Nome do personagem</span>
          <Input className="font-display text-lg" value={c.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="character-field">
          <span>Conceito, raça ou classe</span>
          <Input placeholder="Ex.: Cavaleiro errante, elfo…" value={c.concept} onChange={(e) => set({ concept: e.target.value })} />
        </label>
      </section>

      <section className="character-attributes" aria-label="Atributos do personagem">
        {(["f", "h", "r", "a", "pdf"] as const).map((k) => (
          <div key={k} className="character-attribute-editor rounded-lg border bg-card text-center">
            <div className="font-display text-xs text-muted-foreground">{k === "pdf" ? "PdF" : k.toUpperCase()}</div>
            <Input type="number" min={0} max={5} inputMode="numeric" aria-label={k === "pdf" ? "Poder de Fogo" : "Atributo " + k.toUpperCase()} className="character-attribute-input mt-1 h-9 text-center font-display text-lg" value={c[k]} onChange={(e) => set({ [k]: Math.max(0, +e.target.value) } as Partial<Char>)} />
            {b[k] ? <div className="text-xs text-gold">+{b[k]} item</div> : null}
          </div>
        ))}
      </section>

      <div className="character-summary-grid grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Mini label="Pontos gastos" value={<span className={spent > c.pp_total ? "text-destructive" : ""}>{spent}</span>} />
        <Mini label="Pontos totais" value={<Input type="number" className="h-8 text-center" value={c.pp_total} onChange={(e) => set({ pp_total: +e.target.value })} />} />
        <Mini label="XP" value={<Input type="number" className="h-8 text-center" value={c.xp} onChange={(e) => set({ xp: +e.target.value })} />} />
        <Mini label="FA / FD base" value={`${Math.max(F, P) + H} / ${A + H}`} />
      </div>

      <Tabs defaultValue="traits" className="character-sheet-tabs">
        <TabsList className="character-tabs-list no-print w-full">
          <TabsTrigger value="traits" className="flex-1">Traços</TabsTrigger>
          <TabsTrigger value="inv" className="flex-1">Itens</TabsTrigger>
          <TabsTrigger value="spells" className="flex-1">Magias</TabsTrigger>
          <TabsTrigger value="notes" className="flex-1">Notas</TabsTrigger>
        </TabsList>
        <TabsContent value="spells">
          <KnownSpells ids={c.known_spells ?? []} charId={c.id} onRemove={(sid) => set({ known_spells: (c.known_spells ?? []).filter((x) => x !== sid) })} onCast={(pm) => set({ pm_current: pm })} />
        </TabsContent>
        <TabsContent value="traits" className="space-y-3">
          <TraitList title="Vantagens" items={c.advantages} onChange={(v) => set({ advantages: v })} />
          <TraitList title="Desvantagens" items={c.disadvantages} onChange={(v) => set({ disadvantages: v })} negative />
          <TraitList title="Perícias" items={c.skills} onChange={(v) => set({ skills: v })} />
        </TabsContent>
        <TabsContent value="inv">
          <div className="rounded-lg border bg-card p-3">
            <h3 className="text-base">Equipado</h3>
            <ul className="mt-2 divide-y text-sm">
              {equipped?.map((i) => (
                <li key={i.id} className="character-equipped-item flex items-center justify-between py-2">
                  <span className="min-w-0">{i.name} <span className="text-muted-foreground">{bonusLabel(i.bonus)}</span></span>
                  {i.owner_id === me?.id && <Button size="sm" variant="ghost" className="no-print" onClick={async () => { await rpc("equip_item", { _chest: i.id, _char: null }); refresh(); }}>Desequipar</Button>}
                </li>
              ))}
              {!equipped?.length && <li className="py-2 text-muted-foreground">Nada equipado. Equipe itens pelo Baú.</li>}
            </ul>
          </div>
        </TabsContent>
        <TabsContent value="notes">
          <Textarea rows={10} value={c.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="História, aliados, segredos…" />
        </TabsContent>
      </Tabs>

      <div className="character-sheet-actions no-print flex flex-wrap gap-2">
        {c.owner_id === me?.id && (
          <Button variant="secondary" onClick={async () => {
            await supabase.from("profiles").update({ active_character_id: c.id }).eq("id", me.id);
            toast.success("Ficha ativa definida"); refresh();
          }}><Star className="h-4 w-4" />Tornar ativa</Button>
        )}
        <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir / PDF</Button>
        <Button variant="destructive" onClick={async () => {
          if (!confirm("Apagar esta ficha?")) return;
          await supabase.from("characters").delete().eq("id", c.id);
          nav({ to: "/fichas" });
        }}><Trash2 className="h-4 w-4" />Apagar</Button>
      </div>
    </div>
  );
}

function Bar({ label, cur, max, color, onChange }: { label: string; cur: number; max: number; color: string; onChange: (v: number) => void }) {
  return (
    <div className="character-resource-bar-item min-w-0 flex-1">
      <div className="flex items-center justify-between text-xs font-display">
        <span>{label}</span>
        <span className="flex items-center gap-1">
          <button type="button" aria-label={"Diminuir " + label} className="no-print character-resource-step" onClick={() => onChange(Math.max(0, cur - 1))}>−</button>
          <strong className="character-resource-value">{cur}<span>/{max}</span></strong>
          <button type="button" aria-label={"Aumentar " + label} className="no-print character-resource-step" onClick={() => onChange(Math.min(max, cur + 1))}>+</button>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-muted"><div className={`h-full ${color}`} style={{ width: `${Math.min(100, (cur / max) * 100)}%` }} /></div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="character-mini-stat rounded-lg border bg-card p-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-display">{value}</div>
    </div>
  );
}

function TraitList({ title, items, onChange, negative }: { title: string; items: Trait[]; onChange: (v: Trait[]) => void; negative?: boolean }) {
  const upd = (i: number, p: Partial<Trait>) => onChange(items.map((t, j) => (j === i ? { ...t, ...p } : t)));
  return (
    <details open className="character-trait-section rounded-lg border bg-card p-3">
      <summary className="cursor-pointer font-display">
        {title} <span className="text-sm text-muted-foreground">({negative ? "−" : ""}{items.reduce((s, t) => s + (Number(t.cost) || 0), 0)} pts)</span>
      </summary>
      <div className="mt-2 space-y-2">
        {items.map((t, i) => (
          <div key={i} className="character-trait-row flex gap-2">
            <Input placeholder="Nome da característica" aria-label={"Nome em " + title} className="character-trait-name min-w-0 flex-1" value={t.name} onChange={(e) => upd(i, { name: e.target.value })} />
            <Input type="number" aria-label={"Custo em pontos de " + title} inputMode="numeric" className="character-trait-cost w-20 shrink-0 text-center" value={t.cost} onChange={(e) => upd(i, { cost: +e.target.value })} />
            <Button size="icon" variant="ghost" className="no-print" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button size="sm" variant="outline" className="no-print" onClick={() => onChange([...items, { name: "", cost: 1 }])}><Plus className="h-4 w-4" />Adicionar</Button>
      </div>
    </details>
  );
}

function KnownSpells({ ids, charId, onRemove, onCast }: { ids: string[]; charId: string; onRemove: (id: string) => void; onCast: (pm: number) => void }) {
  const { data: spells } = useQuery({
    queryKey: ["known-spells", ids.join(",")],
    queryFn: async () => (ids.length ? (await supabase.from("spells").select("*").in("id", ids).order("name")).data ?? [] : []),
  });
  if (!ids.length) return <p className="py-2 text-sm text-muted-foreground">Nenhuma magia aprendida. Adicione pelo Grimório.</p>;
  return (
    <ul className="space-y-2">
      {spells?.map((s) => (
        <li key={s.id} className="rounded-lg border bg-card p-3">
          <details>
            <summary className="flex cursor-pointer items-center justify-between gap-2">
              <span className="font-display">{s.name} <span className="text-xs text-mana">{s.pm_cost} PM</span></span>
              <span className="no-print flex gap-1">
                <Button size="sm" onClick={async (e) => {
                  e.preventDefault();
                  try { const pm = await rpc("cast_spell", { _char: charId, _spell: s.id }); onCast(pm as number); toast.success(`${s.name} conjurada! −${s.pm_cost} PM`); }
                  catch { /* rpc já avisa */ }
                }}>Conjurar</Button>
                <Button size="icon" variant="ghost" onClick={(e) => { e.preventDefault(); onRemove(s.id); }}><Trash2 className="h-4 w-4" /></Button>
              </span>
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">{s.school} · Custo: {s.cost} · Alcance: {s.range} · Duração: {s.duration}</p>
            <p className="mt-1 whitespace-pre-line text-sm">{s.description}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}
