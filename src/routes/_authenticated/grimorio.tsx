import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/game";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  BookOpen, BookMarked, Search, Sparkles, WandSparkles, Flame, Shield,
  HeartPulse, Sword, ChevronDown, Plus, LibraryBig, Stars, CircleHelp,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/grimorio")({
  head: () => ({ meta: [
    { title: "Grimório de Magias — Mesa 3D&T" },
    { name: "description", content: "Compêndio arcano de magias 3D&T Alpha com busca, escolas e ficha ativa." },
    { property: "og:title", content: "Grimório de Magias — Mesa 3D&T" },
    { property: "og:description", content: "Descubra, filtre e aprenda magias para sua ficha 3D&T Alpha." },
  ] }),
  component: Grimorio,
});

const SCHOOLS = ["Todas", "Branca", "Negra", "Elemental", "fogo", "água", "terra", "ar", "espírito"];

function Grimorio() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [school, setSchool] = useState("Todas");
  const [maxPm, setMaxPm] = useState("");
  const [limit, setLimit] = useState(36);
  const [collection, setCollection] = useState<"all" | "known" | "unknown">("all");
  const { data: spells, isLoading } = useQuery({
    queryKey: ["spells"],
    queryFn: async () => {
      const { data, error } = await supabase.from("spells").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
  const activeId = me?.profile?.active_character_id as string | null | undefined;
  const { data: active } = useQuery({
    queryKey: ["char-spells", activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("characters").select("id,name,known_spells").eq("id", activeId!).single();
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
  const knownIds: string[] = active?.known_spells ?? [];
  const knownCount = knownIds.length;
  const list = useMemo(() => {
    const term = q.trim().toLocaleLowerCase("pt-BR");
    const pm = maxPm.trim() === "" ? Infinity : Math.max(0, Number(maxPm));
    return (spells ?? []).filter((spell) => {
      const schoolName = String(spell.school ?? "");
      const searchable = [
        spell.name, spell.description, spell.requirements, spell.range, spell.duration,
      ].map((value) => String(value ?? "").toLocaleLowerCase("pt-BR")).join(" ");
      const known = knownIds.includes(spell.id);
      return (school === "Todas" || schoolName.toLocaleLowerCase("pt-BR").includes(school.toLocaleLowerCase("pt-BR"))) &&
        Number(spell.pm_cost ?? 0) <= pm &&
        (!term || searchable.includes(term)) &&
        (collection === "all" || (collection === "known" ? known : !known));
    });
  }, [spells, q, school, maxPm, collection, knownIds]);
  const schoolCounts = useMemo(() => {
    const all = spells ?? [];
    return {
      all: all.length,
      known: all.filter((spell) => knownIds.includes(spell.id)).length,
      unknown: all.filter((spell) => !knownIds.includes(spell.id)).length,
    };
  }, [spells, knownIds]);

  async function learn(id: string) {
    if (!active) { toast.error("Defina uma ficha ativa primeiro."); return; }
    const known: string[] = active.known_spells ?? [];
    if (known.includes(id)) return;
    const { error } = await supabase.from("characters").update({ known_spells: [...known, id] }).eq("id", active.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Magia adicionada a ${active.name}`);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["char-spells"] }),
      qc.invalidateQueries({ queryKey: ["char", active.id] }),
    ]);
  }

  async function remove(id: string) {
    if (!confirm("Apagar esta magia do compêndio?")) return;
    const { error } = await supabase.from("spells").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Magia removida do compêndio.");
    qc.invalidateQueries({ queryKey: ["spells"] });
  }

  return (
    <div className="grimoire-page space-y-4">
      <header className="grimoire-hero">
        <div className="grimoire-hero-pattern"><Stars /></div>
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="grimoire-eyebrow"><Sparkles className="h-3.5 w-3.5" /> Biblioteca arcana</p>
            <h1 className="mt-1 font-display text-2xl font-bold text-gold sm:text-3xl">Grimório de Magias</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">Conhecimento antigo, poderes esquecidos e feitiços para moldar o destino da sua aventura.</p>
          </div>
          <span className="grimoire-bookmark"><BookOpen className="h-4 w-4" /> 3D&T Alpha</span>
        </div>
        <div className="grimoire-overview">
          <div className="grimoire-overview-item"><LibraryBig className="h-4 w-4" /><span><strong>{schoolCounts.all}</strong><small>magias catalogadas</small></span></div>
          <div className="grimoire-overview-item"><BookMarked className="h-4 w-4" /><span><strong>{knownCount}</strong><small>na ficha ativa</small></span></div>
          <div className="grimoire-overview-item"><WandSparkles className="h-4 w-4" /><span><strong>{active ? active.name : "Nenhuma"}</strong><small>ficha selecionada</small></span></div>
        </div>
      </header>

      {active ? (
        <div className="grimoire-active-sheet"><BookMarked className="h-4 w-4" /><span>Aprendizado vinculado à ficha <strong>{active.name}</strong></span><span className="grimoire-active-count">{knownCount} conhecidas</span></div>
      ) : (
        <div className="grimoire-active-sheet is-empty"><CircleHelp className="h-4 w-4" /><span>Escolha uma ficha ativa para aprender e acompanhar magias.</span></div>
      )}

      <section className="grimoire-tools">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <label className="grimoire-search">
            <Search className="h-4 w-4" />
            <span className="sr-only">Buscar magia</span>
            <Input placeholder="Buscar por nome, poder ou efeito…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(36); }} />
            {q && <button type="button" aria-label="Limpar busca" onClick={() => setQ("")}>×</button>}
          </label>
          <label className="grimoire-pm-filter"><span>PM máximo</span><Input type="number" inputMode="numeric" min={0} placeholder="Sem limite" value={maxPm} onChange={(e) => { setMaxPm(e.target.value); setLimit(36); }} /></label>
        </div>
        <div className="grimoire-collection-tabs" role="group" aria-label="Filtrar por aprendizado">
          <button type="button" className={collection === "all" ? "is-active" : ""} onClick={() => setCollection("all")}>Todas <span>{schoolCounts.all}</span></button>
          <button type="button" className={collection === "known" ? "is-active" : ""} onClick={() => setCollection("known")}>Aprendidas <span>{schoolCounts.known}</span></button>
          <button type="button" className={collection === "unknown" ? "is-active" : ""} onClick={() => setCollection("unknown")}>Não aprendidas <span>{schoolCounts.unknown}</span></button>
        </div>
        <div className="grimoire-school-filters" aria-label="Filtrar por escola">
          {SCHOOLS.map((name) => (
            <button key={name} type="button" className={school === name ? "is-active" : ""} onClick={() => { setSchool(name); setLimit(36); }}>{name === "Todas" ? "Todas as escolas" : name}</button>
          ))}
        </div>
        <div className="grimoire-results-line">
          <span>{list.length} {list.length === 1 ? "magia encontrada" : "magias encontradas"}</span>
          {(q || maxPm || school !== "Todas" || collection !== "all") && <button type="button" onClick={() => { setQ(""); setMaxPm(""); setSchool("Todas"); setCollection("all"); setLimit(36); }}>Limpar filtros</button>}
        </div>
      </section>

      {me?.isMaster && (
        <section className="grimoire-master-tools">
          <div><span className="grimoire-master-icon"><Plus className="h-4 w-4" /></span><span><strong>Forja do Mestre</strong><small>Crie magias próprias para a campanha.</small></span></div>
          <SpellForm />
        </section>
      )}

      {isLoading ? (
        <div className="grimoire-loading"><span className="grimoire-loading-orb" /><p>Consultando os tomos antigos…</p></div>
      ) : (
        <ul className="grimoire-spell-grid">
          {list.slice(0, limit).map((spell) => {
            const known = knownIds.includes(spell.id);
            const schoolName = String(spell.school || "Sem escola");
            const combat = !!spell.combat_enabled;
            return (
              <li key={spell.id} className="grimoire-spell-card">
                <details>
                  <summary className="grimoire-spell-summary">
                    <span className="grimoire-spell-sigil"><WandSparkles className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="grimoire-spell-title">{spell.name}</span>
                      <span className="grimoire-spell-subtitle">{schoolName} · {spell.range || "Alcance variável"}</span>
                    </span>
                    <span className="grimoire-spell-cost">{spell.cost || `${spell.pm_cost ?? 0} PM`}</span>
                    {known && <span className="grimoire-known-mark"><BookMarked className="h-3.5 w-3.5" /> Aprendida</span>}
                    <ChevronDown className="grimoire-spell-chevron h-4 w-4" />
                  </summary>
                  <div className="grimoire-spell-details">
                    <div className="grimoire-spell-metadata">
                      <span><strong>PM</strong> {spell.pm_cost ?? 0}</span>
                      <span><strong>Alcance</strong> {spell.range || "—"}</span>
                      <span><strong>Duração</strong> {spell.duration || "—"}</span>
                      {spell.requirements && <span><strong>Exigências</strong> {spell.requirements}</span>}
                    </div>
                    <p className="grimoire-spell-description">{spell.description || "Esta magia ainda não possui descrição."}</p>
                    {combat && (
                      <div className="grimoire-combat-tag"><Sword className="h-3.5 w-3.5" /> Integrada ao combate tático · Potência {spell.combat_power ?? 0}</div>
                    )}
                    <div className="grimoire-spell-actions">
                      <Button size="sm" className="h-9" disabled={known || !active} title={!active ? "Defina uma ficha ativa primeiro" : undefined} onClick={() => void learn(spell.id)}>
                        {known ? <><BookMarked className="h-4 w-4" /> Já aprendida</> : <><Sparkles className="h-4 w-4" /> Aprender magia</>}
                      </Button>
                      {me?.isMaster && (
                        <>
                          <SpellForm spell={spell as SpellRow} />
                          <Button size="sm" variant="ghost" className="h-9 text-destructive hover:text-destructive" onClick={() => void remove(spell.id)}>Apagar</Button>
                        </>
                      )}
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      {!isLoading && list.length > limit && <Button variant="outline" className="w-full" onClick={() => setLimit((current) => current + 36)}>Carregar mais {Math.min(36, list.length - limit)} magias</Button>}
      {!isLoading && !list.length && (
        <div className="grimoire-empty"><BookOpen className="h-8 w-8" /><strong>Nenhuma magia encontrada</strong><span>Altere os filtros ou tente uma busca diferente.</span></div>
      )}
      <p className="flex items-center justify-center gap-2 pb-2 text-center text-[11px] text-muted-foreground"><HeartPulse className="h-3.5 w-3.5" /> O custo em PM e os efeitos seguem as regras configuradas para a sua mesa.</p>
    </div>
  );
}

type SpellRow = { id: string; name: string; school: string; requirements: string; cost: string; pm_cost: number; range: string; duration: string; description: string; combat_effect: "damage" | "pierce" | "heal" | "guard" | "weaken"; combat_power: number; combat_enabled: boolean };

function SpellForm({ spell }: { spell?: SpellRow }) {
  const qc = useQueryClient();
  const empty = { name: "", school: "", cost: "", pm_cost: 0, range: "", duration: "", description: "", requirements: "", combat_effect: "damage" as const, combat_power: 2, combat_enabled: false };
  const [f, setF] = useState(spell ? { name: spell.name, school: spell.school, requirements: spell.requirements, cost: spell.cost, pm_cost: spell.pm_cost, range: spell.range, duration: spell.duration, description: spell.description, combat_effect: spell.combat_effect ?? "damage", combat_power: spell.combat_power ?? 2, combat_enabled: spell.combat_enabled ?? false } : empty);
  const editing = !!spell;
  return (
    <details className={editing ? "contents" : "rounded-lg border bg-card p-3"}>
      <summary className={editing ? "inline-flex h-8 cursor-pointer list-none items-center rounded-md border px-3 text-sm hover:bg-muted" : "cursor-pointer font-display text-gold"}>
        {editing ? "Editar" : "Mestre: criar magia"}
      </summary>
      <div className={editing ? "mt-2 w-full rounded-lg border bg-muted/40 p-3" : "contents"}>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(["name", "school", "requirements", "cost", "range", "duration"] as const).map((k) => (
            <Input key={k} placeholder={{ name: "Nome", school: "Escola", requirements: "Exigências", cost: "Custo (texto)", range: "Alcance", duration: "Duração" }[k]} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          ))}
          <Input type="number" min={0} placeholder="PM gastos ao conjurar" value={f.pm_cost} onChange={(e) => setF({ ...f, pm_cost: Math.max(0, +e.target.value) })} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1.3fr_1fr_auto] sm:items-end">
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>Efeito mecânico no combate</span>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={f.combat_effect} onChange={(e) => setF({ ...f, combat_effect: e.target.value as typeof f.combat_effect })}>
              <option value="damage">Dano mágico (FA normal + potência)</option>
              <option value="pierce">Dano perfurante (ignora A)</option>
              <option value="heal">Cura PV</option>
              <option value="guard">Proteção (bônus na FD)</option>
              <option value="weaken">Enfraquecer (reduz próxima FA inimiga)</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>Potência do efeito</span>
            <Input type="number" min={0} max={10} value={f.combat_power} onChange={(e) => setF({ ...f, combat_power: Math.max(0, Math.min(10, +e.target.value)) })} />
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={f.combat_enabled} onChange={(e) => setF({ ...f, combat_enabled: e.target.checked })} />
            Usar no combate
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">O Mestre define o efeito mecânico da magia. A descrição narrativa continua sendo a referência de interpretação na mesa.</p>
        <textarea className="mt-2 w-full rounded-md border bg-background p-2 text-sm" rows={4} placeholder="Descrição" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <Button className="mt-2" disabled={!f.name} onClick={async (e) => {
          const details = (e.currentTarget.closest("details"));
          const { error } = editing
            ? await supabase.from("spells").update(f as any).eq("id", spell.id)
            : await supabase.from("spells").insert({ ...f, source: "Homebrew" } as any);
          if (error) { toast.error(error.message); return; }
          toast.success(editing ? "Magia atualizada" : "Magia criada");
          if (!editing) setF(empty);
          if (details) details.open = false;
          qc.invalidateQueries({ queryKey: ["spells"] });
        }}>{editing ? "Salvar alterações" : "Salvar magia"}</Button>
      </div>
    </details>
  );
}
