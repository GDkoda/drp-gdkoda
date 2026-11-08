import { useEffect, useState } from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";

type ThemeMode = "dark" | "light";
type PaletteId = "medieval" | "arcane" | "forest" | "crimson" | "obsidian" | "ocean";

const palettes: { id: PaletteId; label: string; description: string; colors: [string, string, string] }[] = [
  { id: "medieval", label: "Taverna", description: "Ouro antigo e madeira acolhedora", colors: ["#d7a83e", "#302721", "#211b18"] },
  { id: "arcane", label: "Arcano", description: "Violeta místico e azul etéreo", colors: ["#a78bfa", "#252039", "#171522"] },
  { id: "forest", label: "Floresta", description: "Verde esmeralda e tons naturais", colors: ["#4fbd91", "#20352e", "#14221d"] },
  { id: "crimson", label: "Sangue & aço", description: "Carmesim intenso e grafite", colors: ["#fb7185", "#38232b", "#21171d"] },
  { id: "obsidian", label: "Obsidiana", description: "Preto profundo, grafite e prata", colors: ["#c4cbd5", "#292d34", "#111318"] },
  { id: "ocean", label: "Abismo", description: "Azul-marinho e azul luminoso", colors: ["#60b8f5", "#203c5c", "#0d1c30"] },
];

function storedMode(): ThemeMode {
  if (typeof window === "undefined") return "medieval";
  try { return window.localStorage.getItem("mesa-theme") === "light" ? "light" : "dark"; }
  catch { return "dark"; }
}

function storedPalette(): PaletteId {
  if (typeof window === "undefined") return "dark";
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
    <div className={`relative flex shrink-0 items-center ${className}`}>
      <button type="button" onClick={() => setOpen((current) => !current)}
        aria-expanded={open} aria-haspopup="dialog"
        aria-label={`Abrir aparência. Tema: ${active.label}, modo ${mode === "dark" ? "escuro" : "claro"}`}
        title={`Aparência: ${active.label} · ${mode === "dark" ? "Escuro" : "Claro"}`}
        className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm transition-colors hover:border-primary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Palette className="h-[1.1rem] w-[1.1rem]" />
        <span className="absolute -bottom-1 -right-1 flex h-[1.05rem] w-[1.05rem] items-center justify-center rounded-full border border-card bg-primary text-primary-foreground">
          {mode === "dark" ? <Moon className="h-2.5 w-2.5" /> : <Sun className="h-2.5 w-2.5" />}
        </span>
      </button>
      {open && (
        <>
          <button type="button" aria-label="Fechar opções de aparência" className="fixed inset-0 z-40 cursor-default bg-black/20 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="Configurações de aparência" className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-2xl">
            <div className="flex items-start justify-between gap-3 px-2 pb-3">
              <div><p className="font-display text-base">Aparência</p><p className="text-xs text-muted-foreground">Escolha a paleta e o modo de exibição.</p></div>
              <Palette className="mt-1 h-4 w-4 text-primary" />
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
              <button type="button" onClick={() => setMode("dark")} aria-pressed={mode === "dark"} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-2 text-sm font-semibold transition-colors ${mode === "dark" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Moon className="h-4 w-4" />Escuro</button>
              <button type="button" onClick={() => setMode("light")} aria-pressed={mode === "light"} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-2 text-sm font-semibold transition-colors ${mode === "light" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Sun className="h-4 w-4" />Claro</button>
            </div>
            <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Paletas de cores</p>
            <div className="max-h-[min(55vh,26rem)] space-y-1 overflow-y-auto pr-1">
              {palettes.map((item) => (
                <button key={item.id} type="button" onClick={() => setPalette(item.id)} aria-pressed={palette === item.id}
                  className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${palette === item.id ? "border-primary/50 bg-primary/10" : "border-transparent hover:bg-muted"}`}>
                  <span className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-border">
                    {item.colors.map((color, index) => <span key={index} className="h-full flex-1" style={{ backgroundColor: color }} />)}
                  </span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.label}</span><span className="block text-xs text-muted-foreground">{item.description}</span></span>
                  {palette === item.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
