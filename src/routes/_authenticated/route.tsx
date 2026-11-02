import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/game";
import { Beer, ScrollText, Store, Package, Crown, LogOut, Coins, Swords, BookOpen, Moon, Sun } from "lucide-react";
import { useCustomization } from "@/lib/app-customization";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

function Layout() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { text } = useCustomization();
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return window.localStorage.getItem("mesa-theme") === "light" ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem("mesa-theme", theme); } catch { /* armazenamento pode estar bloqueado pelo navegador */ }
  }, [theme]);
  const links = [
    { to: "/taverna", label: text("nav_taverna"), icon: Beer },
    { to: "/fichas", label: text("nav_fichas"), icon: ScrollText },
    { to: "/jogos", label: text("nav_jogos"), icon: Swords },
    { to: "/grimorio", label: "Grimório", icon: BookOpen },
    { to: "/loja", label: text("nav_loja"), icon: Store },
    { to: "/bau", label: text("nav_bau"), icon: Package },
    ...(me?.isMaster ? [{ to: "/mestre", label: text("nav_mestre"), icon: Crown }] : []),
  ] as const;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="no-print sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-2">
          <Link to="/taverna" className="font-display text-lg text-gold">{text("brand")}</Link>
          <nav className="hidden gap-1 md:flex">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="rounded px-3 py-1 text-sm hover:bg-muted" activeProps={{ className: "bg-muted text-gold" }}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1 text-gold"><Coins className="h-4 w-4" />{me?.profile?.coins ?? "…"}</span>
            <span className="hidden text-muted-foreground sm:inline">{me?.profile?.display_name}</span>
            <button onClick={signOut} aria-label="Sair" className="text-muted-foreground hover:text-foreground"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-5 sm:py-7 lg:px-8"><Outlet /></main>
      <nav aria-label="Navegação principal" className="no-print fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_28px_rgb(0_0_0/0.12)] backdrop-blur-xl md:hidden">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="flex min-h-14 min-w-0 flex-1 touch-manipulation select-none flex-col items-center justify-center gap-1 px-0.5 py-2 text-[10px] leading-tight transition-transform active:scale-95"
            activeProps={{ className: "bg-muted font-semibold text-gold", "aria-current": "page" }}
            inactiveProps={{ className: "text-muted-foreground" }}
          >
            <l.icon className="pointer-events-none h-5 w-5" />
            <span className="pointer-events-none">{l.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
