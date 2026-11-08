import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Moon, Palette, Sun, X } from "lucide-react";

type ThemeMode = "dark" | "light";
type PaletteId = "ousado" | "eletrizante" | "destemido" | "futurista" | "prata-grafite" | "areia-vinho" | "sangue" | "fervor" | "taverna-zendikar" | "po-de-fada";

const palettes: { id: PaletteId; label: string; description: string; colors: [string, string, string] }[] = [
  { id: "ousado", label: "Brasa do Dragão", description: "Ouro vivo · carvão · ametista", colors: ["#FFF21A", "#171717", "#A66BFF"] },
  { id: "eletrizante", label: "Tempestade Arcana", description: "Safira · noite · raio-lima", colors: ["#030407", "#1558C9", "#D4FF24"] },
  { id: "destemido", label: "Juramento da Lâmina", description: "Ébano · rosa · verde-luz", colors: ["#0B0B0B", "#FF2DAB", "#D4FF3F"] },
  { id: "futurista", label: "Oráculo Esmeralda", description: "Petróleo · marfim · turquesa", colors: ["#031211", "#EBE4D3", "#00AEBB"] },
  { id: "prata-grafite", label: "Cavaleiro de Prata", description: "Ferro negro · grafite · prata", colors: ["#08090B", "#34383F", "#C7CCD4"] },
  { id: "areia-vinho", label: "Crepúsculo de Vinho", description: "Sálvia · areia · rubi escuro", colors: ["#A5A79B", "#E8D2B5", "#590907"] },
  { id: "sangue", label: "Pacto Rubro", description: "Sangue · ônix · neve", colors: ["#8F0715", "#080808", "#F5F5F5"] },
  { id: "fervor", label: "Dança da Fênix", description: "Rosa ardente · carmim · fogo", colors: ["#FF1493", "#D71920", "#FF7A1A"] },
  { id: "taverna-zendikar", label: "Taverna do Zendikar", description: "Marrom · bege claro · amarelo", colors: ["#70452B", "#F1DFC0", "#E9B83F"] },
  { id: "po-de-fada", label: "Pó de Fada", description: "Azul-claro · rosa · lavanda", colors: ["#A9D8FF", "#F3A9D5", "#B9A7F5"] },
];

function syncBrowserThemeColor() {
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const background = styles.getPropertyValue("--background").trim();
  const primary = styles.getPropertyValue("--primary").trim();
  const color = background || (root.dataset.theme === "light" ? "#f5f0e6" : "#171717");
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", color);
  });

  // Favicon vetorial do navegador: o traço acompanha a cor primária do tema.
  const iconColor = primary || "#d7a83e";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 4 55 17v30L32 60 9 47V17L32 4Z" fill="${color}" stroke="${iconColor}" stroke-width="3"/><path d="m32 14 9 13-9 23-9-23 9-13Z" fill="${iconColor}" fill-opacity=".18" stroke="${iconColor}" stroke-width="2.5" stroke-linejoin="round"/><path d="M32 20v24M20 32h24" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round"/><circle cx="32" cy="32" r="4" fill="${iconColor}"/></svg>`;
  const favicon = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach((link) => {
    link.setAttribute("href", favicon);
    link.setAttribute("type", "image/svg+xml");
  });
}

function storedMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  try { return window.localStorage.getItem("mesa-theme") === "light" ? "light" : "dark"; }
  catch { return "dark"; }
}

function storedPalette(): PaletteId {
  if (typeof window === "undefined") return "ousado";
  try {
    const value = window.localStorage.getItem("mesa-palette");
    return palettes.some((palette) => palette.id === value) ? value as PaletteId : "ousado";
  } catch { return "ousado"; }
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [palette, setPalette] = useState<PaletteId>("ousado");
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const savedMode = storedMode();
    const savedPalette = storedPalette();
    setMode(savedMode);
    setPalette(savedPalette);
    document.documentElement.dataset.theme = savedMode;
    document.documentElement.dataset.palette = savedPalette;
    syncBrowserThemeColor();
  }, []);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.dataset.palette = palette;
    syncBrowserThemeColor();
  }, [mode, palette]);

  useEffect(() => {
    try {
      window.localStorage.setItem("mesa-theme", mode);
      window.localStorage.setItem("mesa-palette", palette);
    } catch { /* A aparência continua funcional sem persistência. */ }
  }, [mode, palette]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
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
        className="theme-trigger relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm transition-all hover:border-primary/60 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Palette className="h-[1.1rem] w-[1.1rem]" />
        <span className="absolute -bottom-1 -right-1 flex h-[1.05rem] w-[1.05rem] items-center justify-center rounded-full border border-card bg-primary text-primary-foreground">
          {mode === "dark" ? <Moon className="h-2.5 w-2.5" /> : <Sun className="h-2.5 w-2.5" />}
        </span>
      </button>

      {open && createPortal(
        <div className="theme-dialog-backdrop fixed inset-0 z-[100] grid place-items-center p-3 sm:p-5">
          <button type="button" aria-label="Fechar opções de aparência" className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-md" onClick={() => setOpen(false)} />
          <section role="dialog" aria-modal="true" aria-label="Configurações de aparência"
            className="theme-dialog relative z-10 flex max-h-[min(78dvh,38rem)] w-[min(30rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[1.35rem] border border-border/80 bg-popover text-popover-foreground shadow-[0_28px_90px_rgb(0_0_0/0.48)]">
            <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary"><Palette className="h-[1.05rem] w-[1.05rem]" /></span>
                <div className="min-w-0">
                  <h2 className="font-display text-[.98rem] font-bold leading-tight">Aparência da Mesa</h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Escolha as cores da sua crônica</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar janela de aparência"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-3.5 sm:p-4">
              <section aria-label="Modo de exibição">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Iluminação</p>
                  <span className="text-[10px] text-muted-foreground">{mode === "dark" ? "Salão das sombras" : "Luz do dia"}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border/70 bg-muted/55 p-1">
                  <button type="button" onClick={() => setMode("dark")} aria-pressed={mode === "dark"}
                    className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition-all ${mode === "dark" ? "bg-card text-foreground shadow-sm ring-1 ring-border/70" : "text-muted-foreground hover:text-foreground"}`}>
                    <Moon className="h-3.5 w-3.5" /> Noite
                  </button>
                  <button type="button" onClick={() => setMode("light")} aria-pressed={mode === "light"}
                    className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition-all ${mode === "light" ? "bg-card text-foreground shadow-sm ring-1 ring-border/70" : "text-muted-foreground hover:text-foreground"}`}>
                    <Sun className="h-3.5 w-3.5" /> Dia
                  </button>
                </div>
              </section>

              <section aria-label="Temas">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Crônicas de cor</p>
                  <span className="text-[10px] tabular-nums text-muted-foreground">10 temas</span>
                </div>
                <div className="grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-2">
                  {palettes.map((item) => (
                    <button key={item.id} type="button" onClick={() => setPalette(item.id)} aria-pressed={palette === item.id}
                      className={`theme-palette-card group flex min-w-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${palette === item.id ? "is-selected border-primary/60 bg-primary/10 shadow-sm" : "border-border/60 bg-card/45 hover:border-primary/35 hover:bg-muted/65"}`}>
                      <span className="flex h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-border/80 shadow-inner">
                        {item.colors.map((color, index) => <span key={index} className="h-full flex-1" style={{ backgroundColor: color }} />)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-bold leading-tight">{item.label}</span>
                        <span className="mt-0.5 block truncate text-[10px] leading-tight text-muted-foreground">{item.description}</span>
                      </span>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${palette === item.id ? "bg-primary text-primary-foreground" : "text-transparent"}`}>
                        {palette === item.id && <Check className="h-3 w-3" />}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
            <footer className="border-t border-border/70 bg-muted/25 px-4 py-2 text-center">
              <p className="text-[10px] text-muted-foreground">Sua escolha fica salva automaticamente neste dispositivo.</p>
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
