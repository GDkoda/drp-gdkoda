import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, sumBonus, d6, rpc, useRefresh, bonusLabel, type Trait } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Backpack, BookOpen, Check, ChevronDown, ChevronLeft, CircleDot,
  Dice6, Printer, Trash2, Plus, ShieldCheck, ShieldOff, Sparkles,
  Swords, StickyNote, UserRound, WandSparkles, X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fichas/$id")({
  head: () => ({ meta: [{ title: "Ficha — Mesa 3D&T" }, { name: "description", content: "Ficha de personagem 3D&T Alpha." }] }),
  component: Sheet,
});

type Char = {
  id: string; owner_id: string; name: string; concept: string;
  f: number; h: number; r: number; a: number; pdf: number;
  pv_current: number; pm_current: number; pp_total: number; xp: number;
  fa_bonus: number; fd_bonus: number; custom_rolls: CustomRoll[];
  advantages: Trait[]; disadvantages: Trait[]; skills: Trait[];
  notes: string; known_spells: string[];
};

type RollAttribute = "f" | "h" | "r" | "a" | "pdf";
type CustomRoll = { id: string; name: string; kind: "FA" | "FD" | "FA-F" | "FA-PdF"; attr1?: RollAttribute; attr2?: RollAttribute; bonus: number; dice?: number; sides?: number };

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
    queryFn: async () => {
      const { data, error } = await supabase.from("chest_items").select("*").eq("equipped_character_id", id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [c, setC] = useState<Char | null>(null);
  const [roll, setRoll] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [customKind, setCustomKind] = useState<"FA" | "FD">("FA");
  const [customAttr1, setCustomAttr1] = useState<RollAttribute>("f");
  const [customAttr2, setCustomAttr2] = useState<RollAttribute>("h");
  const [customResults, setCustomResults] = useState<Record<string, number>>({});
  const [customBonus, setCustomBonus] = useState(0);
  const [customMenuOpen, setCustomMenuOpen] = useState(false);
  const [customCreateOpen, setCustomCreateOpen] = useState(false);
  const [activationBusy, setActivationBusy] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  useEffect(() => { if (loaded) setC(loaded); }, [loaded]);

  // Autosave com indicação de estado, sem disparar uma gravação no primeiro carregamento.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const first = useRef(true);
  useEffect(() => {
    if (!c) return;
    if (first.current) { first.current = false; return; }
    clearTimeout(timer.current);
    setSaveState("saving");
    timer.current = setTimeout(async () => {
      const { id: _i, owner_id: _o, ...rest } = c;
      const { error } = await supabase.from("characters").update({
        ...rest,
        advantages: rest.advantages as any,
        disadvantages: rest.disadvantages as any,
        skills: rest.skills as any,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) {
        setSaveState("error");
        toast.error("Não foi possível salvar a ficha: " + error.message);
      } else {
        setSaveState("saved");
      }
    }, 650);
    return () => clearTimeout(timer.current);
  }, [c, id]);

  const b = useMemo(() => sumBonus(equipped ?? []), [equipped]);
  if (!c) {
    return (
      <div className="character-studio-loading">
        <div className="character-studio-loading-mark"><Dice6 className="h-6 w-6" /></div>
        <p>{isLoading ? "Preparando sua ficha…" : isError ? "Não foi possível carregar esta ficha." : "Ficha indisponível."}</p>
        <Button variant="outline" onClick={() => nav({ to: "/fichas" })}><ChevronLeft className="h-4 w-4" />Voltar às fichas</Button>
      </div>
    );
  }

  const isOwner = c.owner_id === me?.id;
  const isActive = me?.profile?.active_character_id === c.id;
  const F = c.f + b.f, H = c.h + b.h, R = c.r + b.r, A = c.a + b.a, P = c.pdf + b.pdf;
  const pvMax = Math.max(1, R * 5);
  const pmMax = Math.max(1, R * 5 + b.pm);
  const sum = (items: Trait[]) => items.reduce((total, trait) => total + (Number(trait.cost) || 0), 0);
  const spent = c.f + c.h + c.r + c.a + c.pdf + sum(c.advantages ?? []) + sum(c.skills ?? []) - sum(c.disadvantages ?? []);
  const set = (patch: Partial<Char>) => setC((current) => current ? { ...current, ...patch } : current);

  async function toggleActive() {
    if (!isOwner || !me?.id || activationBusy) return;
    setActivationBusy(true);
    try {
      const nextId = isActive ? null : c.id;
      const { error } = await supabase.from("profiles").update({ active_character_id: nextId }).eq("id", me.id);
      if (error) throw error;
      await refresh();
      toast.success(isActive
        ? "Ficha desativada. O combate não usará mais este personagem."
        : "Ficha ativa! Este personagem será usado no minigame de combate.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar a ficha ativa.");
    } finally {
      setActivationBusy(false);
    }
  }

  const rollFA = (useP: boolean) => {
    const die = d6();
    const base = (useP ? P : F) + H;
    const manual = Number(c.fa_bonus) || 0;
    const total = base + manual + die;
    setRoll("FA (" + (useP ? "PdF" : "F") + "): " + base + (manual ? " + bônus " + manual : "") + " + 1d6[" + die + "] = " + total);
  };
  const rollFD = () => {
    const die = d6();
    const base = A + H;
    const manual = Number(c.fd_bonus) || 0;
    const total = base + manual + die;
    setRoll("FD: " + base + (manual ? " + bônus " + manual : "") + " + 1d6[" + die + "] = " + total);
  };
  const attributeValues: Record<RollAttribute, number> = { f: F, h: H, r: R, a: A, pdf: P };
  const attributeLabels: Record<RollAttribute, string> = { f: "Força", h: "Habilidade", r: "Resistência", a: "Armadura", pdf: "Poder de Fogo" };
  const runCustomRoll = (item: CustomRoll) => {
    // Compatibilidade com rolagens antigas salvas antes desta reformulação.
    const first = item.attr1 ?? (item.kind === "FA-PdF" ? "pdf" : item.kind === "FD" ? "a" : "f");
    const second = item.attr2 ?? "h";
    const die = d6();
    const total = attributeValues[first] + attributeValues[second] + (Number(item.bonus) || 0) + die;
    setCustomResults((current) => ({ ...current, [item.id]: total }));
    setRoll(item.name + " · " + total + " (" + attributeLabels[first] + " + " + attributeLabels[second] + " + 1d6" + (item.bonus ? " + bônus " + item.bonus : "") + ")");
  };
  const addCustomRoll = () => {
    const name = customName.trim();
    if (!name) { toast.error("Dê um nome para a rolagem personalizada."); return; }
    const item: CustomRoll = { id: crypto.randomUUID(), name, kind: customKind, attr1: customAttr1, attr2: customAttr2, bonus: Number(customBonus) || 0 };
    set({ custom_rolls: [...(c.custom_rolls ?? []), item] });
    setCustomName("");
    setCustomBonus(0);
    toast.success("Rolagem personalizada adicionada.");
  };

  return (
    <div className="character-studio print-sheet">
      <header className="character-studio-header">
        <div className="character-studio-topline">
          <Button variant="ghost" size="sm" className="character-back-button" onClick={() => nav({ to: "/fichas" })}>
            <ChevronLeft className="h-4 w-4" />Fichas
          </Button>
          <span className={"character-save-indicator is-" + saveState} aria-live="polite">
            {saveState === "saving" ? <><span className="character-save-dot" />Salvando</>
              : saveState === "saved" ? <><Check className="h-3.5 w-3.5" />Salvo</>
                : saveState === "error" ? <><X className="h-3.5 w-3.5" />Erro ao salvar</>
                  : <><CircleDot className="h-3.5 w-3.5" />Autosave</>}
          </span>
        </div>

        <div className="character-studio-identity">
          <div className="character-studio-avatar"><UserRound className="h-7 w-7" /></div>
          <div className="character-studio-title">
            <span className="character-studio-eyebrow">PERSONAGEM · MESA 3D&T ALPHA</span>
            <h1>{c.name?.trim() || "Personagem sem nome"}</h1>
            <p>{c.concept?.trim() || "Conceito ainda não definido"}</p>
          </div>
          {isOwner ? (
            <button
              type="button"
              className={"character-active-toggle no-print " + (isActive ? "is-active" : "is-inactive")}
              onClick={() => void toggleActive()}
              disabled={activationBusy}
              aria-pressed={isActive}
              title={isActive ? "Desativar esta ficha para o combate" : "Usar esta ficha no minigame de combate"}
            >
              {isActive ? <ShieldCheck className="h-4 w-4" /> : <Swords className="h-4 w-4" />}
              <span>{activationBusy ? "Atualizando…" : isActive ? "Desativar ficha" : "Ativar para combate"}</span>
              {isActive ? <span className="character-active-toggle-dot" /> : null}
            </button>
          ) : (
            <span className="character-owner-note">Ficha de outro jogador</span>
          )}
        </div>
      </header>

      <section className="character-studio-vitals" aria-label="Recursos do personagem">
        <Bar label="Pontos de Vida" shortLabel="PV" cur={c.pv_current} max={pvMax} color="bg-blood" onChange={(value) => set({ pv_current: value })} />
        <Bar label="Pontos de Magia" shortLabel="PM" cur={c.pm_current} max={pmMax} color="bg-mana" onChange={(value) => set({ pm_current: value })} />
        <div className="character-studio-roll-panel no-print">
          <div className="character-roll-heading"><strong>Rolagens automáticas</strong><small>1d6 + atributo + H</small></div>
          <div className="character-roll-bonuses">
            <label> Bônus manual FA <Input aria-label="Bônus manual de FA" type="number" inputMode="numeric" value={c.fa_bonus ?? 0} onChange={(event) => set({ fa_bonus: Number(event.target.value) || 0 })} /></label>
            <label> Bônus manual FD <Input aria-label="Bônus manual de FD" type="number" inputMode="numeric" value={c.fd_bonus ?? 0} onChange={(event) => set({ fd_bonus: Number(event.target.value) || 0 })} /></label>
          </div>
          <div className="character-studio-rolls">
            <Button size="sm" variant="secondary" onClick={() => rollFA(false)}><Dice6 className="h-4 w-4" />FA · F</Button>
            <Button size="sm" variant="secondary" onClick={() => rollFA(true)}>FA · PdF</Button>
            <Button size="sm" variant="secondary" onClick={rollFD}>FD</Button>
          </div>
          <div className="character-custom-rolls">
            <Button type="button" size="sm" variant="outline" className="character-custom-roll-trigger" aria-expanded={customMenuOpen} onClick={() => { setCustomMenuOpen((open) => !open); setCustomCreateOpen(false); }}>
              <Dice6 className="h-4 w-4" />Rolagens personalizadas <span className="character-custom-roll-count">{(c.custom_rolls ?? []).length}</span><ChevronDown className={"h-3.5 w-3.5 character-custom-roll-chevron " + (customMenuOpen ? "is-open" : "")} />
            </Button>
            {customMenuOpen && <div className="character-custom-roll-menu">
              <div className="character-roll-heading"><strong>Suas rolagens</strong><small>{(c.custom_rolls ?? []).length} salvas</small></div>
              {(c.custom_rolls ?? []).length > 0
                ? <div className="character-custom-roll-list">{c.custom_rolls.map((item) => <div key={item.id} className="character-custom-roll-entry"><span><strong>{item.name}</strong><small>{item.kind === "FD" ? "Força de Defesa" : "Força de Ataque"} · {(item.attr1 ?? (item.kind === "FA-PdF" ? "pdf" : item.kind === "FD" ? "a" : "f")).toUpperCase()} + {(item.attr2 ?? "h").toUpperCase()} · bônus {item.bonus >= 0 ? "+" : ""}{item.bonus}</small></span><Button size="sm" variant="secondary" className="character-custom-roll-die" onClick={() => runCustomRoll(item)}><Dice6 className="h-3.5 w-3.5" /><span>Rolar</span></Button>{customResults[item.id] !== undefined && <strong className="character-custom-roll-value" aria-live="polite">{customResults[item.id]}</strong>}<Button size="icon" variant="ghost" aria-label={"Excluir " + item.name} onClick={() => set({ custom_rolls: c.custom_rolls.filter((entry) => entry.id !== item.id) })}><X className="h-3.5 w-3.5" /></Button></div>)}</div>
                : <p className="character-fold-empty">Nenhuma rolagem criada ainda.</p>}
              {!customCreateOpen ? <Button type="button" size="sm" className="character-custom-roll-new" onClick={() => setCustomCreateOpen(true)}><Plus className="h-3.5 w-3.5" />Nova rolagem</Button>
                : <div className="character-custom-roll-form">
                  <Input aria-label="Nome da rolagem personalizada" placeholder="Nome da rolagem" value={customName} onChange={(event) => setCustomName(event.target.value)} />
                  <div className="character-custom-roll-kind" role="group" aria-label="Tipo de rolagem">
                    <button type="button" className={customKind === "FA" ? "is-selected" : ""} aria-pressed={customKind === "FA"} onClick={() => setCustomKind("FA")}>⚔ FA</button>
                    <button type="button" className={customKind === "FD" ? "is-selected" : ""} aria-pressed={customKind === "FD"} onClick={() => setCustomKind("FD")}>🛡 FD</button>
                  </div>
                  <div className="character-custom-roll-attributes">
                    <label><span>Atributo I</span><select aria-label="Primeiro atributo" value={customAttr1} onChange={(event) => setCustomAttr1(event.target.value as RollAttribute)}>
                      <option value="f">Força</option><option value="h">Habilidade</option><option value="r">Resistência</option><option value="a">Armadura</option><option value="pdf">Poder de Fogo</option>
                    </select></label>
                    <label><span>Atributo II</span><select aria-label="Segundo atributo" value={customAttr2} onChange={(event) => setCustomAttr2(event.target.value as RollAttribute)}>
                      <option value="f">Força</option><option value="h">Habilidade</option><option value="r">Resistência</option><option value="a">Armadura</option><option value="pdf">Poder de Fogo</option>
                    </select></label>
                  </div>
                  <label className="character-custom-roll-bonus"><span>Bônus adicional</span><Input aria-label="Bônus da rolagem personalizada" type="number" value={customBonus} onChange={(event) => setCustomBonus(Number(event.target.value) || 0)} /></label>
                  <div className="character-custom-roll-form-actions"><Button type="button" size="sm" onClick={() => { addCustomRoll(); setCustomCreateOpen(false); }}><Plus className="h-3.5 w-3.5" />Salvar</Button><Button type="button" size="sm" variant="ghost" onClick={() => setCustomCreateOpen(false)}>Cancelar</Button></div>
                </div>}
            </div>}
          </div>
        </div>
        {roll && <div className="character-studio-roll-result" role="status">{roll}</div>}
      </section>

      <section className="character-studio-core character-studio-identity-core">
        <div className="character-studio-section-heading">
          <div><span>01 · IDENTIDADE</span><h2>Seu herói</h2></div>
        </div>
        <div className="character-studio-fields">
          <label className="character-studio-field">
            <span>Nome</span>
            <Input className="font-display" value={c.name} onChange={(event) => set({ name: event.target.value })} placeholder="Nome do personagem" />
          </label>
          <label className="character-studio-field">
            <span>Conceito / raça / classe</span>
            <Input value={c.concept} onChange={(event) => set({ concept: event.target.value })} placeholder="Ex.: Cavaleiro errante, elfo…" />
          </label>
        </div>
        <div className="character-identity-progress" aria-label="Progressão do personagem">
          <div className="character-identity-progress-heading">
            <span>PROGRESSÃO</span>
            <small>{spent > c.pp_total ? "Pontos acima do limite" : (c.pp_total - spent) + " pontos livres"}</small>
          </div>
          <div className="character-identity-progress-grid">
            <div className="character-identity-progress-card">
              <span>Pontos gastos / total</span>
              <div className="character-identity-points-value">
                <strong className={spent > c.pp_total ? "text-destructive" : ""}>{spent}</strong>
                <span>/</span>
                <Input aria-label="Pontos totais da ficha" type="number" min={0} inputMode="numeric" value={c.pp_total} onChange={(event) => set({ pp_total: Number(event.target.value) || 0 })} />
              </div>
              <small>{c.pp_total - spent} pontos disponíveis</small>
            </div>
            <label className="character-identity-progress-card">
              <span>Experiência</span>
              <Input aria-label="Experiência do personagem" className="character-identity-progress-input" type="number" min={0} inputMode="numeric" value={c.xp} onChange={(event) => set({ xp: Number(event.target.value) || 0 })} />
            </label>
            <div className="character-identity-progress-card">
              <span>Força de Ataque · FA</span>
              <strong>F {F + H} <span className="character-progress-separator">/</span> PdF {P + H}</strong>
              <small>F + H / PdF + H</small>
            </div>
            <div className="character-identity-progress-card">
              <span>Força de Defesa · FD</span>
              <strong>{A + H}</strong>
              <small>Armadura + Habilidade</small>
            </div>
          </div>
        </div>
      </section>

      <section className="character-studio-core">
        <div className="character-studio-section-heading">
          <div><span>02 · ATRIBUTOS</span><h2>Capacidades</h2></div>
          <small>Valores finais com bônus equipados</small>
        </div>
        <div className="character-studio-attributes">
          {([
            ["f", "F", "Força", F],
            ["h", "H", "Habilidade", H],
            ["r", "R", "Resistência", R],
            ["a", "A", "Armadura", A],
            ["pdf", "PdF", "Poder de Fogo", P],
          ] as const).map(([key, label, description, total]) => (
            <label key={key} className="character-studio-attribute">
              <span>{label}</span>
              <Input type="number" min={0} max={5} inputMode="numeric" aria-label={description} value={c[key]} onChange={(event) => set({ [key]: Math.max(0, Number(event.target.value) || 0) } as Partial<Char>)} />
              {b[key] ? <small>{total} final · +{b[key]} item</small> : <small>{description}</small>}
            </label>
          ))}
        </div>
      </section>

      <section className="character-studio-advanced">
        <div className="character-studio-fold-grid">
          <TraitList title="Vantagens" subtitle="Características positivas" items={c.advantages ?? []} onChange={(value) => set({ advantages: value })} icon={<Sparkles className="h-4 w-4" />} />
          <TraitList title="Desvantagens" subtitle="Limitações e complicações" items={c.disadvantages ?? []} onChange={(value) => set({ disadvantages: value })} negative icon={<CircleDot className="h-4 w-4" />} />
          <TraitList title="Perícias" subtitle="Treinamentos e especializações" items={c.skills ?? []} onChange={(value) => set({ skills: value })} icon={<BookOpen className="h-4 w-4" />} />
          <InventorySection items={equipped ?? []} meId={me?.id} onUnequip={async (itemId) => {
            try {
              await rpc("equip_item", { _chest: itemId, _char: null });
              await refresh();
              toast.success("Item desequipado.");
            } catch { /* rpc já exibe a falha */ }
          }} />
          <SpellSection
            ids={c.known_spells ?? []}
            charId={c.id}
            onRemove={(spellId) => set({ known_spells: (c.known_spells ?? []).filter((item) => item !== spellId) })}
            onCast={(pm) => set({ pm_current: pm })}
          />
          <details className="character-studio-fold character-notes-fold">
            <summary>
              <span className="character-fold-icon"><StickyNote className="h-4 w-4" /></span>
              <span className="character-fold-label"><strong>Anotações</strong><small>História, aliados e segredos</small></span>
              <span className="character-fold-chevron"><ChevronDown className="h-4 w-4" /></span>
            </summary>
            <div className="character-fold-content">
              <Textarea rows={7} value={c.notes ?? ""} onChange={(event) => set({ notes: event.target.value })} placeholder="História, aliados, segredos, objetivos…" />
            </div>
          </details>
        </div>
      </section>

      <footer className="character-studio-footer no-print">
        <div className="character-studio-footer-status">
          {isActive ? <><ShieldCheck className="h-4 w-4" />Esta é a ficha que alimenta o minigame de combate.</> : <><ShieldOff className="h-4 w-4" />Esta ficha não está selecionada para o combate.</>}
        </div>
        <div className="character-studio-footer-actions">
          <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir / PDF</Button>
          <Button variant="destructive" onClick={async () => {
            if (!confirm("Apagar esta ficha?")) return;
            const { error } = await supabase.from("characters").delete().eq("id", c.id);
            if (error) { toast.error(error.message); return; }
            nav({ to: "/fichas" });
          }}><Trash2 className="h-4 w-4" />Apagar</Button>
        </div>
      </footer>
    </div>
  );
}

function Bar({ label, shortLabel, cur, max, color, onChange }: {
  label: string; shortLabel: string; cur: number; max: number; color: string; onChange: (value: number) => void;
}) {
  const percentage = Math.min(100, Math.max(0, (cur / max) * 100));
  return (
    <div className="character-vital">
      <div className="character-vital-topline">
        <span><strong>{shortLabel}</strong><small>{label}</small></span>
        <span className="character-vital-controls">
          <button type="button" aria-label={"Diminuir " + shortLabel} onClick={() => onChange(Math.max(0, cur - 1))}>−</button>
          <strong>{cur}<small>/{max}</small></strong>
          <button type="button" aria-label={"Aumentar " + shortLabel} onClick={() => onChange(Math.min(max, cur + 1))}>+</button>
        </span>
      </div>
      <div className="character-vital-track"><span className={color} style={{ width: percentage + "%" }} /></div>
    </div>
  );
}

function TraitList({ title, subtitle, items, onChange, negative, icon }: {
  title: string; subtitle: string; items: Trait[]; onChange: (value: Trait[]) => void;
  negative?: boolean; icon: ReactNode;
}) {
  const update = (index: number, patch: Partial<Trait>) => onChange(items.map((item, current) => current === index ? { ...item, ...patch } : item));
  const points = items.reduce((total, item) => total + (Number(item.cost) || 0), 0);
  return (
    <details className="character-studio-fold">
      <summary>
        <span className="character-fold-icon">{icon}</span>
        <span className="character-fold-label"><strong>{title}</strong><small>{subtitle}</small></span>
        <span className="character-fold-count">{items.length} · {negative ? "−" : ""}{points} pts</span>
        <span className="character-fold-chevron"><ChevronDown className="h-4 w-4" /></span>
      </summary>
      <div className="character-fold-content space-y-2">
        {items.map((item, index) => (
          <div key={index} className="character-studio-trait-row">
            <Input placeholder="Nome da característica" aria-label={"Nome em " + title} value={item.name} onChange={(event) => update(index, { name: event.target.value })} />
            <Input type="number" inputMode="numeric" aria-label={"Custo em pontos de " + title} value={item.cost} onChange={(event) => update(index, { cost: Number(event.target.value) || 0 })} />
            <Button type="button" size="icon" variant="ghost" aria-label={"Remover característica " + (item.name || index + 1)} onClick={() => onChange(items.filter((_, current) => current !== index))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, { name: "", cost: 1 }])}><Plus className="h-4 w-4" />Adicionar</Button>
      </div>
    </details>
  );
}

function InventorySection({ items, meId, onUnequip }: {
  items: any[]; meId?: string; onUnequip: (id: string) => void | Promise<void>;
}) {
  return (
    <details className="character-studio-fold">
      <summary>
        <span className="character-fold-icon"><Backpack className="h-4 w-4" /></span>
        <span className="character-fold-label"><strong>Equipamentos</strong><small>Itens que concedem bônus à ficha</small></span>
        <span className="character-fold-count">{items.length} equipados</span>
        <span className="character-fold-chevron"><ChevronDown className="h-4 w-4" /></span>
      </summary>
      <div className="character-fold-content">
        {items.length ? (
          <ul className="character-inventory-list">
            {items.map((item) => (
              <li key={item.id}>
                <span><strong>{item.name}</strong><small>{bonusLabel(item.bonus)}</small></span>
                {item.owner_id === meId && <Button type="button" size="sm" variant="ghost" onClick={() => void onUnequip(item.id)}>Desequipar</Button>}
              </li>
            ))}
          </ul>
        ) : <p className="character-fold-empty">Nenhum item equipado. Visite o Baú para equipar equipamentos.</p>}
      </div>
    </details>
  );
}

function SpellSection({ ids, charId, onRemove, onCast }: {
  ids: string[]; charId: string; onRemove: (id: string) => void; onCast: (pm: number) => void;
}) {
  const { data: spells, isLoading } = useQuery({
    queryKey: ["known-spells", ids.join(",")],
    queryFn: async () => {
      if (!ids.length) return [];
      const { data, error } = await supabase.from("spells").select("*").in("id", ids).order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: ids.length > 0,
  });
  return (
    <details className="character-studio-fold">
      <summary>
        <span className="character-fold-icon"><WandSparkles className="h-4 w-4" /></span>
        <span className="character-fold-label"><strong>Magias</strong><small>Feitiços aprendidos no Grimório</small></span>
        <span className="character-fold-count">{ids.length} conhecidas</span>
        <span className="character-fold-chevron"><ChevronDown className="h-4 w-4" /></span>
      </summary>
      <div className="character-fold-content">
        {isLoading ? <p className="character-fold-empty">Consultando grimório…</p>
          : !spells?.length ? <p className="character-fold-empty">Nenhuma magia aprendida. Adicione magias pelo Grimório.</p>
            : <ul className="character-spell-list">
              {spells.map((spell: any) => (
                <li key={spell.id}>
                  <details className="character-spell-item">
                    <summary>
                      <span><strong>{spell.name}</strong><small>{spell.school} · {spell.pm_cost} PM</small></span>
                      <ChevronDown className="h-4 w-4" />
                    </summary>
                    <p>{spell.description}</p>
                    <small>Custo: {spell.cost} · Alcance: {spell.range} · Duração: {spell.duration}</small>
                  </details>
                  <div className="character-spell-actions no-print">
                    <Button type="button" size="sm" onClick={async () => {
                      try {
                        const pm = await rpc("cast_spell", { _char: charId, _spell: spell.id });
                        onCast(pm as number);
                        toast.success(spell.name + " conjurada! −" + spell.pm_cost + " PM");
                      } catch { /* rpc já exibe a falha */ }
                    }}>Conjurar</Button>
                    <Button type="button" size="icon" variant="ghost" aria-label={"Esquecer " + spell.name} onClick={() => onRemove(spell.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </li>
              ))}
            </ul>}
      </div>
    </details>
  );
}
