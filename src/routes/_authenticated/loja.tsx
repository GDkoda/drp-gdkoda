import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { rpc, useRefresh, bonusLabel, categoryLabel, useMe } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Coins } from "lucide-react";

export const Route = createFileRoute("/_authenticated/loja")({
  head: () => ({ meta: [{ title: "Loja — Mesa 3D&T" }, { name: "description", content: "Armas, armaduras e poções." }] }),
  component: Loja,
});

function Loja() {
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
      <h1 className="text-2xl text-gold">Loja do Ferreiro</h1>
      <div className="flex gap-2 overflow-x-auto">
        {["todos", "arma", "armadura", "consumivel"].map((c) => (
          <Button key={c} size="sm" variant={cat === c ? "default" : "secondary"} onClick={() => setCat(c)}>{c === "todos" ? "Todos" : categoryLabel[c]}</Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list?.map((i) => (
          <div key={i.id} className="flex flex-col rounded-lg border bg-card p-4">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">{categoryLabel[i.category] ?? i.category}</span>
            <h3 className="text-lg">{i.name}</h3>
            <p className="flex-1 text-sm text-muted-foreground">{i.description}</p>
            <p className="mt-1 text-sm text-gold">{bonusLabel(i.bonus)}</p>
            <Button className="mt-3" disabled={(me?.profile?.coins ?? 0) < i.price} onClick={async () => { await rpc("buy_item", { _item: i.id }, `${i.name} foi para o baú`); refresh(); }}>
              <Coins className="h-4 w-4" />{i.price}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
