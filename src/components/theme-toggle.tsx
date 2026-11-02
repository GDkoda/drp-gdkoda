import { useEffect, useState } from "react";
import { Check, ChevronDown, Moon, Palette, Sun } from "lucide-react";

type ThemeMode = "dark" | "light";
type PaletteId = "medieval" | "arcane" | "forest" | "crimson";

const palettes: { id: PaletteId; label: string; description: string; colors: [string, string, string] }[] = [
  { id: "medieval", label: "Taverna", description: "O tema original, quente e medieval", colors: ["#d7a83e", "#302721", "#211b18"] },
  { id: "arcane", label: "Arcano", description: "Violeta místico e azul etéreo", colors: ["#a78bfa", "#252039", "#171522"] },
  { id: "forest", label: "Floresta", description: "Verde esmeralda e tons naturais", colors: ["#4fbd91", "#20352e", "#14221d"] },
  { id: "crimson", label: "Sangue & aço", description: "Carmesim intenso e grafite", colors: ["#fb7185", "#38232b", "#21171d"] },
];

function storedMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  try { return window.localStorage.getItem("mesa-theme") === "light" ? "light" : "dark"; }
  catch { return "dark"; }
}

function storedPalette(): PaletteId {
  if (typeof window === "undefined") return "medieval";
  try {
    const value = window.localStorage.getItem("mesa-palette");
    return palettes.some((palette) => palette.id === value) ? value as PaletteId : "medieval";
  } catch { return "medieval"; }
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<ThemeMode>(storedMode);
  const [palette, setPalette] = useState<PaletteId>(storedPalette);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.dataset.palette = palette;
    try {
      window.localStorage.setItem("mesa-theme", mode);
      window.localStorage.setItem("mesa-palette", palette);
    } catch { /* O tema segue funcionando sem armazenamento persistente. */ }
  }, [mode, palette]);

  const active = palettes.find((item) => item.id === palette) ?? palettes[0];

  return (
    <div className={`relative flex shrink-0 items-center gap-1.5 ${className}`}>
      <button type="button" onClick={() => setMode((current) => current === "dark" ? "light" : "dark")}
        aria-label={mode === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
        title={mode === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm hover:border-primary/60 hover:text-gold">
        {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="dialog"
        aria-label={`Escolher tema de cores. Atual: ${active.label}`} title={`Tema: ${active.label}`}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 text-sm font-semibold text-foreground shadow-sm hover:border-primary/60 hover:text-gold">
        <Palette className="h-4 w-4" /><span className="hidden xl:inline">{active.label}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="dialog" aria-label="Escolher tema" className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-72 rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-2xl">
          <div className="px-2 pb-2"><p className="font-display text-base">Identidade visual</p><p className="text-xs text-muted-foreground">Quatro paletas, cada uma com modo claro e escuro.</p></div>
          <div className="space-y-1">
            {palettes.map((item) => (
              <button key={item.id} type="button" onClick={() => { setPalette(item.id); setOpen(false); }} aria-pressed={palette === item.id}
                className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${palette === item.id ? "border-primary/50 bg-primary/10" : "border-transparent hover:bg-muted"}`}>
                <span className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/10">
                  {item.colors.map((color, index) => <span key={index} className="h-full flex-1" style={{ backgroundColor: color }} />)}
                </span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.label}</span><span className="block text-xs text-muted-foreground">{item.description}</span></span>
                {palette === item.id && <Check className="h-4 w-4 shrink-0 text-gold" />}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <span>Modo atual</span><span className="inline-flex items-center gap-1.5 font-semibold text-foreground">{mode === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}{mode === "dark" ? "Escuro" : "Claro"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
