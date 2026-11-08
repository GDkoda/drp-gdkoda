import { useEffect, useState } from "react";
import { Check, Moon, Palette, Sun, X } from "lucide-react";

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

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const active = palettes.find((item) => item.id === palette) ?? palettes[0];

  return (
    <div className={`relative flex shrink-0 items-center ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Abrir aparência. Tema: ${active.label}, modo ${mode === "dark" ? "escuro" : "claro"}`}
        title={`Aparência: ${active.label} · ${mode === "dark" ? "Escuro" : "Claro"}`}
        className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm transition-all hover:border-primary/60 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Palette className="h-[1.1rem] w-[1.1rem]" />
        <span className="absolute -bottom-1 -right-1 flex h-[1.05rem] w-[1.05rem] items-center justify-center rounded-full border border-card bg-primary text-primary-foreground">
          {mode === "dark" ? <Moon className="h-2.5 w-2.5" /> : <Sun className="h-2.5 w-2.5" />}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-3 sm:p-5">
          <button
            type="button"
            aria-label="Fechar opções de aparência"
            className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Configurações de aparência"
            className="relative z-10 flex max-h-[min(84dvh,42rem)] w-[min(25rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[1.4rem] border border-border/80 bg-popover text-popover-foreground shadow-[0_24px_80px_rgb(0_0_0/0.42)]"
          >
            <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-4 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><Palette className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <h2 className="font-display text-base font-semibold leading-tight">Aparência</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Deixe a mesa com a sua cara</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar janela de aparência"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              ><X className="h-4 w-4" /></button>
            </header>

            <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
              <section aria-label="Modo de exibição">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Modo de exibição</p>
                  <span className="text-[11px] text-muted-foreground">Atual: {mode === "dark" ? "Escuro" : "Claro"}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border/70 bg-muted/60 p-1.5">
                  <button
                    type="button"
                    onClick={() => setMode("dark")}
                    aria-pressed={mode === "dark"}
                    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-all ${mode === "dark" ? "bg-card text-foreground shadow-sm ring-1 ring-border/70" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"}`}
                  ><Moon className="h-4 w-4" />Escuro</button>
                  <button
                    type="button"
                    onClick={() => setMode("light")}
                    aria-pressed={mode === "light"}
                    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-all ${mode === "light" ? "bg-card text-foreground shadow-sm ring-1 ring-border/70" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"}`}
                  ><Sun className="h-4 w-4" />Claro</button>
                </div>
              </section>

              <section aria-label="Paletas de cores">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Paletas de cores</p>
                  <span className="text-[11px] text-muted-foreground">6 estilos</span>
                </div>
                <div className="space-y-1.5">
                  {palettes.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPalette(item.id)}
                      aria-pressed={palette === item.id}
                      className={`group flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${palette === item.id ? "border-primary/50 bg-primary/10 shadow-sm" : "border-border/60 bg-card/40 hover:border-primary/30 hover:bg-muted/70"}`}
                    >
                      <span className="flex h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border/80 shadow-inner">
                        {item.colors.map((color, index) => <span key={index} className="h-full flex-1" style={{ backgroundColor: color }} />)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold leading-tight">{item.label}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.description}</span>
                      </span>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${palette === item.id ? "bg-primary text-primary-foreground" : "text-transparent group-hover:text-muted-foreground"}`}>
                        {palette === item.id && <Check className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
            <footer className="border-t border-border/70 bg-muted/30 px-4 py-2.5 text-center sm:px-5">
              <p className="text-[11px] text-muted-foreground">Sua escolha é salva automaticamente neste dispositivo.</p>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
