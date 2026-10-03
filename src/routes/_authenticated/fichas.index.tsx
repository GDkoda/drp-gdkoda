import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fichas/")({
  head: () => ({ meta: [{ title: "Fichas — Mesa 3D&T" }, { name: "description", content: "Seus personagens 3D&T Alpha." }] }),
  component: Fichas,
});

function Fichas() {
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-gold">{me?.isMaster ? "Todas as fichas" : "Minhas fichas"}</h1>
        <Button onClick={create}><Plus className="h-4 w-4" />Nova ficha</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {chars?.map((c) => (
          <Link key={c.id} to="/fichas/$id" params={{ id: c.id }} className="rounded-lg border bg-card p-4 hover:border-primary">
            <div className="flex items-baseline justify-between">
              <h3 className="text-lg">{c.name}</h3>
              {me?.profile?.active_character_id === c.id && <span className="text-xs text-gold">ATIVA</span>}
            </div>
            <p className="text-sm text-muted-foreground">{c.concept || "Sem conceito"}{me?.isMaster ? ` · ${players?.find((p) => p.id === c.owner_id)?.display_name ?? ""}` : ""}</p>
            <p className="mt-2 font-display text-sm">F{c.f} H{c.h} R{c.r} A{c.a} PdF{c.pdf} · {c.xp} XP</p>
          </Link>
        ))}
        {!chars?.length && <p className="text-muted-foreground">Nenhum herói ainda. Crie o primeiro!</p>}
      </div>
    </div>
  );
}
