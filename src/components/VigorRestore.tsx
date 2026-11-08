import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

export function useGameSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await (supabase as any).from("game_settings").select("*").eq("id", 1).single()).data as { vigor_daily: number; vigor_cost_1: number; vigor_cost_5: number; dice_max_bet: number } | null,
  });
}

export function VigorRestore({ vigor }: { vigor: number | undefined }) {
  const qc = useQueryClient();
  const { data: s } = useGameSettings();
  if (!s) return null;
  const max = s.vigor_daily ?? 5;
  const current = vigor ?? 0;
  const progress = Math.max(0, Math.min(100, (current / Math.max(max, 1)) * 100));
  const buy = async (amount: 1 | 5) => {
    try {
      await rpc("restore_vigor", { _amount: amount }, "+" + amount + " vigor restaurado");
    } finally {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["vigor"] }),
        qc.invalidateQueries({ queryKey: ["me"] }),
      ]);
    }
  };
  return (
    <section className="tavern-section">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="tavern-section-icon is-mana"><Zap className="h-5 w-5" /></span>
          <div><h2 className="text-sm font-semibold">Restaurar vigor</h2><p className="text-[11px] text-muted-foreground">Renova à meia-noite (horário de Brasília).</p></div>
        </div>
        <span className="text-sm font-semibold tabular-nums text-mana">{current}/{max}</span>
      </div>
      <div className="tavern-vigor-track mt-3"><span style={{ width: progress + "%" }} /></div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" className="h-8 text-xs" disabled={current + 1 > max} onClick={() => void buy(1)}>+1 vigor <span className="ml-1 opacity-70">· {s.vigor_cost_1} moedas</span></Button>
        <Button variant="secondary" size="sm" className="h-8 text-xs" disabled={current + 5 > max} onClick={() => void buy(5)}>+5 vigor <span className="ml-1 opacity-70">· {s.vigor_cost_5} moedas</span></Button>
      </div>
    </section>
  );
}
