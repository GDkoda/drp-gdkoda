import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

export function useGameSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await (supabase as any).from("game_settings").select("*").eq("id", 1).single()).data as { vigor_daily: number; vigor_cost_1: number; vigor_cost_5: number } | null,
  });
}

export function VigorRestore({ vigor }: { vigor: number | undefined }) {
  const qc = useQueryClient();
  const { data: s } = useGameSettings();
  if (!s) return null;
  const max = s.vigor_daily ?? 5;
  const v = vigor ?? 0;
  const buy = async (n: 1 | 5) => {
    try {
      await rpc("restore_vigor", { _amount: n }, `+${n} vigor restaurado`);
    } finally {
      qc.invalidateQueries();
    }
  };
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="flex items-center gap-2 text-lg"><Zap className="h-4 w-4 text-mana" />Restaurar vigor</h2>
      <p className="text-sm text-muted-foreground">Vigor {v}/{max}. Renova sozinho à meia-noite (horário de Brasília).</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={v + 1 > max} onClick={() => buy(1)}>+1 vigor · {s.vigor_cost_1} moedas</Button>
        <Button variant="secondary" disabled={v + 5 > max} onClick={() => buy(5)}>+5 vigor · {s.vigor_cost_5} moedas</Button>
      </div>
    </section>
  );
}
