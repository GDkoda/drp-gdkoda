import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/game";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/grimorio")({
  head: () => ({ meta: [
    { title: "Grimório de Magias — Mesa 3D&T" },
    { name: "description", content: "Compêndio de magias 3D&T Alpha com busca e filtros." },
    { property: "og:title", content: "Grimório de Magias — Mesa 3D&T" },
    { property: "og:description", content: "Compêndio de magias 3D&T Alpha com busca e filtros." },
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
  const [limit, setLimit] = useState(40);
  const { data: spells } = useQuery({
    queryKey: ["spells"],
    queryFn: async () => (await supabase.from("spells").select("*").order("name")).data ?? [],
  });
  const activeId = me?.profile?.active_character_id as string | null | undefined;
  const { data: active } = useQuery({
    queryKey: ["char-spells", activeId],
    enabled: !!activeId,
    queryFn: async () => (await supabase.from("characters").select("id,name,known_spells").eq("id", activeId!).single()).data,
  });
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const pm = maxPm === "" ? Infinity : +maxPm;
    return (spells ?? []).filter((s) =>
      (school === "Todas" || s.school.toLowerCase().includes(school.toLowerCase())) &&
      s.pm_cost <= pm &&
      (!t || s.name.toLowerCase().includes(t) || s.description.toLowerCase().includes(t)));
  }, [spells, q, school, maxPm]);

  async function learn(id: string) {
    if (!active) { toast.error("Defina uma ficha ativa primeiro."); return; }
    const known: string[] = active.known_spells ?? [];
    if (known.includes(id)) return;
    const { error } = await supabase.from("characters").update({ known_spells: [...known, id] }).eq("id", active.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Magia adicionada a ${active.name}`);
    qc.invalidateQueries({ queryKey: ["char-spells"] });
    qc.invalidateQueries({ queryKey: ["char", active.id] });
  }
  async function remove(id: string) {
    if (!confirm("Apagar esta magia do compêndio?")) return;
    const { error } = await supabase.from("spells").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["spells"] });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-gold">Grimório de Magias</h1>
        <p className="text-sm text-muted-foreground">{spells?.length ?? 0} magias · {active ? `Ficha ativa: ${active.name}` : "Sem ficha ativa"}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input placeholder="Buscar por nome ou efeito…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(40); }} />
        <Input type="number" min={0} className="sm:w-36" placeholder="PM máximo" value={maxPm} onChange={(e) => setMaxPm(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-1">
        {SCHOOLS.map((s) => (
          <Button key={s} size="sm" variant={school === s ? "default" : "outline"} onClick={() => setSchool(s)}>{s}</Button>
        ))}
      </div>
      {me?.isMaster && <SpellForm />}
      <ul className="space-y-2">
        {list.slice(0, limit).map((s) => {
          const known = active?.known_spells?.includes(s.id);
          return (
            <li key={s.id} className="rounded-lg border bg-card p-3">
              <details>
                <summary className="cursor-pointer">
                  <span className="font-display">{s.name}</span>{" "}
                  <span className="text-xs text-mana">{s.cost || `${s.pm_cost} PM`}</span>
                  <div className="text-xs text-muted-foreground">{s.school}</div>
                </summary>
                <p className="mt-2 text-xs text-muted-foreground">
                  {s.requirements && <>Exigências: {s.requirements} · </>}Alcance: {s.range || "—"} · Duração: {s.duration || "—"}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm">{s.description}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" disabled={known} onClick={() => learn(s.id)}>{known ? "Já aprendida" : "Aprender na ficha ativa"}</Button>
                  {me?.isMaster && (
                    <>
                      <SpellForm spell={s} />
                      <Button size="sm" variant="destructive" onClick={() => remove(s.id)}>Apagar</Button>
                    </>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      {list.length > limit && <Button variant="outline" className="w-full" onClick={() => setLimit(limit + 40)}>Mostrar mais ({list.length - limit})</Button>}
      {!list.length && <p className="text-muted-foreground">Nenhuma magia encontrada.</p>}
    </div>
  );
}

type SpellRow = { id: string; name: string; school: string; requirements: string; cost: string; pm_cost: number; range: string; duration: string; description: string; combat_effect: "damage" | "pierce" | "heal" | "guard" | "weaken"; combat_power: number; combat_enabled: boolean };

function SpellForm({ spell }: { spell?: SpellRow }) {
  const qc = useQueryClient();
  const empty = { name: "", school: "", cost: "", pm_cost: 0, range: "", duration: "", description: "", requirements: "", combat_effect: "damage" as const, combat_power: 2, combat_enabled: false };
  const [f, setF] = useState(spell ? { name: spell.name, school: spell.school, requirements: spell.requirements, cost: spell.cost, pm_cost: spell.pm_cost, range: spell.range, duration: spell.duration, description: spell.description, combat_effect: spell.combat_effect ?? "damage", combat_power: spell.combat_power ?? 2, combat_enabled: spell.combat_enabled ?? true } : empty);
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
