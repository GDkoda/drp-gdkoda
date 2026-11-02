import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    try { return window.localStorage.getItem("mesa-theme") === "light" ? "light" : "dark"; }
    catch { return "dark"; }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem("mesa-theme", theme); }
    catch { /* O tema continua funcionando mesmo sem armazenamento persistente. */ }
  }, [theme]);

  const nextTheme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema noturno"}
      title={theme === "dark" ? "Ativar tema claro" : "Ativar tema noturno"}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm hover:border-primary/60 hover:text-gold ${className}`}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
