import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const defaultTexts = {
  brand: "3D&T",
  nav_taverna: "Taverna", nav_fichas: "Fichas", nav_jogos: "Jogos", nav_loja: "Loja", nav_bau: "Baú", nav_mestre: "Mestre",
  home_eyebrow: "Bem-vindo, viajante", home_title: "Taverna 3D&T", home_description: "A mesa onde heróis guardam suas fichas, gastam moedas suadas e desafiam a sorte nos dados.", home_enter: "Entrar na taverna",
  taverna_title: "Taverna", taverna_checkin_title: "Check-in diário", taverna_checkin_help: "Recompensa cresce a cada dia seguido.", taverna_checkin_button: "Fazer check-in", taverna_send_title: "Enviar moedas", taverna_send_button: "Enviar", taverna_history_title: "Últimas movimentações",
  fichas_title: "Minhas fichas", fichas_master_title: "Todas as fichas", fichas_new: "Nova ficha", fichas_empty: "Nenhum herói ainda. Crie o primeiro!",
  jogos_title: "Mini-jogos", jogos_help: "O vigor renova todo dia. Combate custa 2, dados e enigmas custam 1.", jogos_combat: "Combate", jogos_dice: "Dados", jogos_puzzle: "Enigmas", jogos_fight: "Lutar (2 vigor)", jogos_roll: "Rolar (1 vigor)", jogos_new_puzzle: "Novo enigma (1 vigor)",
  loja_title: "Loja do Ferreiro", loja_all: "Todos",
  bau_title: "Baú da conta", bau_use: "Usar na ficha ativa", bau_stored: "Guardado no baú", bau_send: "Enviar para jogador…", bau_empty: "Baú vazio. Visite a loja!",
  mestre_title: "Painel do Mestre", mestre_players: "Jogadores", mestre_shop: "Loja", mestre_rules: "Regras", mestre_monsters: "Monstros", mestre_puzzles: "Enigmas", mestre_log: "Registro", mestre_appearance: "Aparência e textos",
} as const;

export type TextKey = keyof typeof defaultTexts;
export type Texts = Record<TextKey, string>;
export type Appearance = {
  textColor: string; primaryColor: string; backgroundColor: string; cardColor: string;
  textSize: number; titleSize: number; itemScale: number;
  backgroundPath: string; backgroundOpacity: number; backgroundPosition: "cover" | "contain";
};
export const defaultAppearance: Appearance = {
  textColor: "#eadfca", primaryColor: "#d7a83e", backgroundColor: "#241e19", cardColor: "#352b23",
  textSize: 17, titleSize: 1, itemScale: 1, backgroundPath: "", backgroundOpacity: 0.2, backgroundPosition: "cover",
};
export type Customization = { texts: Texts; appearance: Appearance };

const Context = createContext<{ settings: Customization; preview: Customization | null; setPreview: (v: Customization | null) => void; refresh: () => Promise<void> } | null>(null);
const hex = /^#[0-9a-f]{6}$/i;
const number = (v: unknown, fallback: number, min: number, max: number) => typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

function normalize(texts: unknown, appearance: unknown): Customization {
  const rawTexts = texts && typeof texts === "object" ? texts as Record<string, unknown> : {};
  const rawAppearance = appearance && typeof appearance === "object" ? appearance as Record<string, unknown> : {};
  const safeTexts = Object.fromEntries(Object.entries(defaultTexts).map(([k, value]) => [k, typeof rawTexts[k] === "string" && rawTexts[k].trim() ? String(rawTexts[k]).slice(0, 240) : value])) as Texts;
  const color = (key: keyof Appearance) => typeof rawAppearance[key] === "string" && hex.test(String(rawAppearance[key])) ? String(rawAppearance[key]) : defaultAppearance[key] as string;
  return { texts: safeTexts, appearance: {
    textColor: color("textColor"), primaryColor: color("primaryColor"), backgroundColor: color("backgroundColor"), cardColor: color("cardColor"),
    textSize: number(rawAppearance.textSize, 17, 14, 22), titleSize: number(rawAppearance.titleSize, 1, .8, 1.5), itemScale: number(rawAppearance.itemScale, 1, .85, 1.25),
    backgroundPath: typeof rawAppearance.backgroundPath === "string" ? rawAppearance.backgroundPath : "",
    backgroundOpacity: number(rawAppearance.backgroundOpacity, .2, 0, .7), backgroundPosition: rawAppearance.backgroundPosition === "contain" ? "contain" : "cover",
  }};
}

export function AppCustomizationProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<Customization | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const query = useQuery({ queryKey: ["site-settings"], queryFn: async () => {
    const { data, error } = await supabase.from("site_settings").select("texts, appearance").eq("id", 1).maybeSingle();
    if (error) throw error;
    return normalize(data?.texts, data?.appearance);
  }, staleTime: 60_000 });
  const settings = query.data ?? normalize({}, {});
  const active = preview ?? settings;
  useEffect(() => {
    let current = true;
    if (!active.appearance.backgroundPath) { setBackgroundUrl(""); return; }
    supabase.storage.from("site-backgrounds").createSignedUrl(active.appearance.backgroundPath, 3600).then(({ data }) => { if (current) setBackgroundUrl(data?.signedUrl ?? ""); });
    return () => { current = false; };
  }, [active.appearance.backgroundPath]);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--app-foreground", active.appearance.textColor);
    root.style.setProperty("--app-primary", active.appearance.primaryColor);
    root.style.setProperty("--app-background", active.appearance.backgroundColor);
    root.style.setProperty("--app-card", active.appearance.cardColor);
    root.style.setProperty("--app-text-size", `${active.appearance.textSize}px`);
    root.style.setProperty("--app-title-scale", String(active.appearance.titleSize));
    root.style.setProperty("--app-item-scale", String(active.appearance.itemScale));
    root.style.setProperty("--app-bg-image", backgroundUrl ? `url(${JSON.stringify(backgroundUrl)})` : "none");
    root.style.setProperty("--app-bg-opacity", String(active.appearance.backgroundOpacity));
    root.style.setProperty("--app-bg-size", active.appearance.backgroundPosition);
  }, [active, backgroundUrl]);
  const value = useMemo(() => ({ settings, preview, setPreview, refresh: async () => { await qc.invalidateQueries({ queryKey: ["site-settings"] }); } }), [settings, preview, qc]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCustomization() {
  const value = useContext(Context);
  if (!value) throw new Error("AppCustomizationProvider ausente");
  const active = value.preview ?? value.settings;
  return { ...value, active, text: (key: TextKey) => active.texts[key] };
}
