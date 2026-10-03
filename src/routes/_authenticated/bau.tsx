import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rpc, useRefresh, bonusLabel, categoryLabel, useMe } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/bau")({
  head: () => ({ meta: [{ title: "Baú — Mesa 3D&T" }, { name: "description", content: "Itens guardados da sua conta." }] }),
  component: Bau,
});

function Bau() {
  const { data: me } = useMe();
  const refresh = useRefresh();
  const { data: items } = useQuery({
    queryKey: ["chest", me?.id],
    enabled: !!me,
    queryFn: async () => (await supabase.from("chest_items").select("*").eq("owner_id", me!.id).order("created_at")).data ?? [],
  });
  const { data: chars } = useQuery({
    queryKey: ["mychars", me?.id],
    enabled: !!me,
    queryFn: async () => (await supabase.from("characters").select("id, name").eq("owner_id", me!.id)).data ?? [],
  });
  const { data: players } = useQuery({
    queryKey: ["players"],
    queryFn: async () => (await supabase.from("profiles").select("id, display_name, username").order("display_name")).data ?? [],
  });

  async function usePotion(item: { id: string; bonus: unknown; name: string }) {
    if (!me?.profile?.active_character_id) { toast.error("Defina uma ficha ativa primeiro"); return; }
    await rpc("use_consumable", { _chest: item.id }, `${item.name} usada`);
    refresh();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl text-gold">Baú da conta</h1>
      <div className="space-y-3">
        {items?.map((i) => (
          <div key={i.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg">{i.name}</h3>
              <span className="text-xs uppercase text-muted-foreground">{categoryLabel[i.category]}</span>
            </div>
            <p className="text-sm text-gold">{bonusLabel(i.bonus)}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {i.category === "consumivel" ? (
                <Button size="sm" onClick={() => usePotion(i)}>Usar na ficha ativa</Button>
              ) : (
                <Select value={i.equipped_character_id ?? "none"} onValueChange={async (v) => { await rpc("equip_item", { _chest: i.id, _char: v === "none" ? null : v }, "Atualizado"); refresh(); }}>
                  <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Guardado no baú</SelectItem>
                    {chars?.map((c) => <SelectItem key={c.id} value={c.id}>Equipado em {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Select onValueChange={async (v) => { if (!confirm("Enviar este item?")) return; await rpc("transfer_item", { _chest: i.id, _to: v }, "Item enviado"); refresh(); }}>
                <SelectTrigger className="sm:w-56"><SelectValue placeholder="Enviar para jogador…" /></SelectTrigger>
                <SelectContent>
                  {players?.filter((p) => p.id !== me?.id).map((p) => <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
        {!items?.length && <p className="text-muted-foreground">Baú vazio. Visite a loja!</p>}
      </div>
    </div>
  );
}
