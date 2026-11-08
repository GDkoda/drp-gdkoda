import { useState } from "react";
import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/game";
import { Beer, ScrollText, Store, Package, Crown, LogOut, Coins, Swords, BookOpen, Menu, X } from "lucide-react";
import { useCustomization } from "@/lib/app-customization";
import { ThemeToggle } from "@/components/theme-toggle";
import { AionEmblem } from "@/components/aion-emblem";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const links = [
    { to: "/taverna", label: text("nav_taverna"), icon: Beer },
    { to: "/fichas", label: text("nav_fichas"), icon: ScrollText },
    { to: "/jogos", label: text("nav_jogos"), icon: Swords },
    { to: "/grimorio", label: "Grimório", icon: BookOpen },
    { to: "/lore", label: "Lore", icon: BookOpen },
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
    <div className="min-h-screen pb-24 md:pb-0">
      <header className="app-top-chrome no-print sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap sm:px-5 sm:py-3 lg:px-8">
          <Link to="/taverna" className="flex min-w-0 max-w-[42%] shrink items-center gap-1.5 rounded-lg font-display text-sm font-bold tracking-wide text-gold sm:max-w-none sm:shrink-0 sm:gap-2 sm:text-xl"><span className="app-brand-sigil flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary sm:h-9 sm:w-9" aria-hidden="true"><AionEmblem className="h-8 w-8" aria-hidden="true" /></span><span className="truncate">{text("brand")}</span></Link>
          <nav aria-label="Navegação principal" className="hidden min-w-0 flex-1 flex-wrap items-center justify-center gap-1 lg:flex">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground" activeProps={{ className: "bg-primary/10 font-semibold text-gold" }}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center justify-end gap-1 sm:gap-2 lg:gap-3">
            <ThemeToggle />
            <span className="flex max-w-[6.5rem] shrink-0 items-center gap-1 rounded-xl border border-primary/25 bg-primary/10 px-2 py-1.5 text-xs font-semibold tabular-nums text-gold sm:max-w-none sm:gap-1.5 sm:px-3 sm:py-2 sm:text-sm"><Coins className="h-4 w-4" />{me?.profile?.coins ?? "…"}</span>
            <span className="hidden max-w-36 truncate text-sm text-muted-foreground xl:inline">{me?.profile?.display_name}</span>
            <button type="button" onClick={signOut} aria-label="Sair" title="Sair" className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
        <nav aria-label="Navegação secundária" className="mx-auto hidden max-w-7xl flex-wrap items-center justify-center gap-1 px-3 pb-2 sm:px-5 md:flex lg:hidden">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground" activeProps={{ className: "bg-primary/10 font-semibold text-gold" }}>
              {l.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-5 sm:py-7 lg:px-8"><Outlet /></main>

      <div className="no-print fixed bottom-[max(env(safe-area-inset-bottom),.75rem)] right-3 z-50 md:hidden">
        {mobileMenuOpen && (
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-background/35 backdrop-blur-[2px]"
          />
        )}
        <div
          id="mobile-navigation-panel"
          aria-hidden={!mobileMenuOpen}
          className={`absolute bottom-14 right-0 z-50 flex max-h-[min(70dvh,32rem)] w-[min(19rem,calc(100vw-1.5rem))] origin-bottom-right flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/95 p-2 shadow-[0_18px_60px_rgb(0_0_0/0.3)] backdrop-blur-2xl transition-all duration-300 ease-out motion-reduce:transition-none ${mobileMenuOpen ? "visible translate-y-0 scale-100 opacity-100" : "invisible pointer-events-none translate-y-3 scale-95 opacity-0"}`}
        >
          <div className="flex items-center justify-between px-3 pb-2 pt-1">
            <div>
              <p className="font-display text-sm font-semibold text-foreground">Navegação</p>
              <p className="text-[11px] text-muted-foreground">Para onde vamos?</p>
            </div>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-gold">MENU</span>
          </div>
          <nav aria-label="Menu principal mobile" className="min-h-0 space-y-1 overflow-y-auto overscroll-contain">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[.99]"
                activeProps={{ className: "bg-primary/10 font-semibold text-gold" }}
              >
                <l.icon className="h-[1.1rem] w-[1.1rem] shrink-0" />
                <span className="min-w-0 flex-1 truncate">{l.label}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-primary/0" />
              </Link>
            ))}
          </nav>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-label={mobileMenuOpen ? "Recolher menu" : "Abrir menu"}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation-panel"
          className="relative z-50 inline-flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-primary text-primary-foreground shadow-[0_8px_28px_rgb(0_0_0/0.32)] transition-[transform,box-shadow,background-color] duration-300 hover:scale-105 hover:shadow-[0_12px_34px_rgb(0_0_0/0.38)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
        >
          <span className={`absolute transition-all duration-200 ${mobileMenuOpen ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"}`}><Menu className="h-6 w-6" /></span>
          <span className={`absolute transition-all duration-200 ${mobileMenuOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"}`}><X className="h-6 w-6" /></span>
        </button>
      </div>
    </div>
  );
}
