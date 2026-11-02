import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useCustomization } from "@/lib/app-customization";

export const Route = createFileRoute("/_authenticated/fichas/")({
  head: () => ({ meta: [{ title: "Fichas — Mesa 3D&T" }, { name: "description", content: "Seus personagens 3D&T Alpha." }] }),
  component: Fichas,
});

function Fichas() {
  const { text } = useCustomization();
  const { data: me } = useMe();
  const nav = useNavigate();
  const { data: chars } = useQuery({
    queryKey: ["chars"],
    queryFn: async () => (await supabase.from("characters").select("id, name, concept, owner_id, f, h, r, a, pdf, xp").order("created_at")).data ?? [],
  });
  const { data: players } = useQuery({
    queryKey: ["players"],
    queryFn: async () => (await supabase.from("profiles").select("id, display_name, username").order("display_name")).data ?? [],
  });

  async function create() {
    const { data, error } = await supabase.from("characters").insert({ owner_id: me!.id }).select("id").single();
    if (error) { toast.error(error.message); return; }
    nav({ to: "/fichas/$id", params: { id: data.id } });
  }

  return (
    <div className="space-y-4">
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">Personagens e progresso</p>
          <h1 className="mt-1 text-3xl text-gold">{me?.isMaster ? text("fichas_master_title") : text("fichas_title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Abra uma ficha para editar atributos, equipamentos e magias.</p>
        </div>
        <Button onClick={create}><Plus className="h-4 w-4" />{text("fichas_new")}</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {chars?.map((c) => (
          <Link key={c.id} to="/fichas/$id" params={{ id: c.id }} className="rounded-2xl border bg-card p-5 hover:border-primary">
            <div className="flex items-baseline justify-between">
              <h3 className="text-lg">{c.name}</h3>
              {me?.profile?.active_character_id === c.id && <span className="text-xs text-gold">ATIVA</span>}
            </div>
            <p className="text-sm text-muted-foreground">{c.concept || "Sem conceito"}{me?.isMaster ? ` · ${players?.find((p) => p.id === c.owner_id)?.display_name ?? ""}` : ""}</p>
            <p className="mt-2 font-display text-sm">F{c.f} H{c.h} R{c.r} A{c.a} PdF{c.pdf} · {c.xp} XP</p>
          </Link>
        ))}
        {!chars?.length && <div className="empty-state sm:col-span-2"><p className="font-display text-lg text-foreground">Sua aventura começa aqui</p><p className="text-sm">{text("fichas_empty")}</p><div className="mt-3"><Button variant="outline" onClick={create}><Plus className="h-4 w-4" />Criar primeira ficha</Button></div></div>}
      </div>
    </div>
  );
}
