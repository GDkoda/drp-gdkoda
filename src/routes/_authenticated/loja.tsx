import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { rpc, useRefresh, bonusLabel, categoryLabel, useMe } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Coins } from "lucide-react";
import { useCustomization } from "@/lib/app-customization";

export const Route = createFileRoute("/_authenticated/loja")({
  head: () => ({ meta: [{ title: "Loja — Mesa 3D&T" }, { name: "description", content: "Armas, armaduras e poções." }] }),
  component: Loja,
});

function Loja() {
  const { text } = useCustomization();
  const refresh = useRefresh();
  const { data: me } = useMe();
  const [cat, setCat] = useState("todos");
  const { data: items } = useQuery({
    queryKey: ["shop"],
    queryFn: async () => (await supabase.from("shop_items").select("*").eq("active", true).order("price")).data ?? [],
  });
  const list = items?.filter((i) => cat === "todos" || i.category === cat);
  return (
    <div className="space-y-4">
      <div className="page-heading"><div><p className="page-eyebrow">Equipamentos e consumíveis</p><h1 className="mt-1 text-3xl text-gold">{text("loja_title")}</h1><p className="mt-2 text-sm text-muted-foreground">Escolha itens para preparar seu próximo encontro.</p></div><div className="inline-flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-sm font-semibold text-gold"><Coins className="h-4 w-4" />{me?.profile?.coins ?? 0} moedas</div></div>
      <div aria-label="Filtrar itens por categoria" className="flex flex-wrap gap-2">
        {["todos", "arma", "armadura", "consumivel"].map((c) => (
          <Button key={c} size="sm" variant={cat === c ? "default" : "secondary"} onClick={() => setCat(c)}>{c === "todos" ? text("loja_all") : categoryLabel[c]}</Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list?.map((i) => (
          <div key={i.id} className="flex flex-col rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">{categoryLabel[i.category] ?? i.category}</span>
            <h3 className="mt-1 text-lg font-semibold">{i.name}</h3>
            <p className="flex-1 text-sm text-muted-foreground">{i.description}</p>
            <p className="mt-3 rounded-lg bg-primary/8 px-3 py-2 text-sm font-medium text-gold">{bonusLabel(i.bonus)}</p>
            <Button className="mt-4 w-full justify-between" disabled={(me?.profile?.coins ?? 0) < i.price} onClick={async () => { await rpc("buy_item", { _item: i.id }, `${i.name} foi para o baú`); refresh(); }}>
              <Coins className="h-4 w-4" />{i.price}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
