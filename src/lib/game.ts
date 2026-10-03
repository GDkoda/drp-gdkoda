import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Bonus = { f?: number; h?: number; r?: number; a?: number; pdf?: number; pv?: number; pm?: number };
export type Trait = { name: string; cost: number; note?: string };

export const toEmail = (login: string) =>
  login.includes("@") ? login.trim().toLowerCase() : `${login.trim().toLowerCase()}@mesa.local`;

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", u.user.id).single(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      ]);
      return { id: u.user.id, profile, isMaster: !!roles?.some((r) => r.role === "master") };
    },
  });
}

export function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export async function rpc(name: string, args: Record<string, unknown>, ok?: string) {
  const { data, error } = await (supabase.rpc as any)(name, args);
  if (error) {
    toast.error(error.message);
    throw error;
  }
  if (ok) toast.success(ok);
  return data;
}

export const sumBonus = (items: { bonus: unknown }[]) =>
  items.reduce<Required<Bonus>>(
    (acc, i) => {
      const b = (i.bonus ?? {}) as Bonus;
      (Object.keys(acc) as (keyof Bonus)[]).forEach((k) => (acc[k] += Number(b[k] ?? 0)));
      return acc;
    },
    { f: 0, h: 0, r: 0, a: 0, pdf: 0, pv: 0, pm: 0 },
  );

export const d6 = () => 1 + Math.floor(Math.random() * 6);

export const bonusLabel = (b: unknown) =>
  Object.entries((b ?? {}) as Bonus)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k.toUpperCase()} ${Number(v) > 0 ? "+" : ""}${v}`)
    .join(", ");

export const categoryLabel: Record<string, string> = {
  arma: "Arma",
  armadura: "Armadura",
  consumivel: "Consumível",
};
