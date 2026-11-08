import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowRight, AtSign, LockKeyhole, ShieldCheck, Sparkles, UserRound } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Mesa 3D&T Alpha" },
      { name: "description", content: "Entre ou crie sua conta de aventureiro." },
      { property: "og:title", content: "Entrar — Mesa 3D&T Alpha" },
      { property: "og:description", content: "Entre ou crie sua conta de aventureiro." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [login, setLogin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email: login.trim().toLowerCase(), password });
        if (error) throw error;
      } else {
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) throw new Error("Nome de usuário: 3-20 letras, números ou _");
        const { data, error } = await supabase.auth.signUp({
          email: login.trim().toLowerCase(),
          password,
          options: { data: { username }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) { toast.success("Conta criada! Confira seu e-mail para confirmar o cadastro."); return; }
      }
      nav({ to: "/taverna" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const signingUp = mode === "up";

  return (
    <main className="auth-shell relative flex min-h-screen items-center justify-center px-4 py-16 sm:px-6 lg:py-12">
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6"><ThemeToggle /></div>
      <div className="auth-layout relative z-10 mx-auto grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-border/70 bg-card/75 shadow-[0_30px_100px_rgba(0,0,0,.22)] backdrop-blur-xl lg:grid-cols-[.92fr_1.08fr]">
        <aside className="auth-welcome relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-12">
          <div className="relative z-10">
            <div className="auth-brand mb-10 inline-flex min-h-[4.5rem] min-w-[10rem] items-center justify-center rounded-2xl border border-white/20 px-6 py-3 shadow-lg">
              <span className="whitespace-nowrap font-display text-3xl font-bold tracking-tight">3D&T</span>
            </div>
            <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[.24em] text-white/65"><Sparkles className="h-4 w-4" /> Sua próxima aventura começa aqui</p>
            <h1 className="max-w-sm font-display text-4xl font-bold leading-tight text-white xl:text-5xl">
              {signingUp ? "Abra as portas para novas histórias." : "Sua mesa está esperando por você."}
            </h1>
            <p className="mt-5 max-w-sm text-base leading-relaxed text-white/75">
              {signingUp ? "Crie seu espaço, prepare seu personagem e venha construir aventuras memoráveis." : "Entre na sua conta e continue de onde sua última aventura parou."}
            </p>
          </div>
          <div className="relative z-10 mt-12 flex items-center gap-3 rounded-2xl border border-white/15 bg-black/15 p-4 text-sm text-white/80">
            <ShieldCheck className="h-5 w-5 shrink-0 text-white" />
            <span>Um espaço para personagens, histórias e boas sessões de RPG.</span>
          </div>
          <div aria-hidden="true" className="auth-orb auth-orb-one" />
          <div aria-hidden="true" className="auth-orb auth-orb-two" />
        </aside>

        <section className="min-w-0 p-5 sm:p-9 lg:p-10 xl:p-12">
          <div className="mb-7 flex items-center justify-between gap-4 lg:hidden">
            <div className="auth-brand inline-flex min-h-[3.75rem] min-w-[8.5rem] items-center justify-center rounded-2xl border border-primary/25 px-5 py-2 shadow-md">
              <span className="whitespace-nowrap font-display text-2xl font-bold tracking-tight">3D&T</span>
            </div>
            <span className="text-right text-xs text-muted-foreground">Mesa de RPG<br />3D&T Alpha</span>
          </div>

          <div className="mb-7">
            <p className="page-eyebrow mb-2">{signingUp ? "Comece sua jornada" : "Que bom ter você de volta"}</p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {signingUp ? "Criar sua conta" : "Bem-vindo de volta"}
            </h2>
            <p className="mt-2 text-base text-muted-foreground">
              {signingUp ? "Só precisamos de alguns dados para preparar sua mesa." : "Entre com seus dados para voltar à aventura."}
            </p>
          </div>

          <div className="mb-7 grid grid-cols-2 rounded-2xl border border-border/70 bg-muted/60 p-1.5" role="group" aria-label="Tipo de acesso">
            <button type="button" onClick={() => setMode("in")} aria-pressed={!signingUp}
              className={`min-h-11 rounded-xl px-3 text-sm font-semibold transition-all ${!signingUp ? "bg-card text-foreground shadow-sm ring-1 ring-border/70" : "text-muted-foreground hover:text-foreground"}`}>
              Entrar
            </button>
            <button type="button" onClick={() => setMode("up")} aria-pressed={signingUp}
              className={`min-h-11 rounded-xl px-3 text-sm font-semibold transition-all ${signingUp ? "bg-card text-foreground shadow-sm ring-1 ring-border/70" : "text-muted-foreground hover:text-foreground"}`}>
              Criar conta
            </button>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="auth-email" className="text-sm font-semibold">E-mail</Label>
              <div className="auth-input-wrap">
                <AtSign aria-hidden="true" className="h-4 w-4" />
                <Input id="auth-email" autoComplete="email" value={login} onChange={(e) => setLogin(e.target.value)} required type="email" placeholder="voce@exemplo.com" className="h-12 border-0 bg-transparent pl-0 shadow-none focus-visible:ring-0" />
              </div>
            </div>
            {signingUp && (
              <div className="space-y-2">
                <Label htmlFor="auth-username" className="text-sm font-semibold">Nome de usuário</Label>
                <div className="auth-input-wrap">
                  <UserRound aria-hidden="true" className="h-4 w-4" />
                  <Input id="auth-username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="Seu nome de aventureiro" className="h-12 border-0 bg-transparent pl-0 shadow-none focus-visible:ring-0" />
                </div>
                <p className="text-xs text-muted-foreground">De 3 a 20 caracteres: letras, números ou _.</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="auth-password" className="text-sm font-semibold">Senha</Label>
              <div className="auth-input-wrap">
                <LockKeyhole aria-hidden="true" className="h-4 w-4" />
                <Input id="auth-password" autoComplete={signingUp ? "new-password" : "current-password"} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="Mínimo de 6 caracteres" className="h-12 border-0 bg-transparent pl-0 shadow-none focus-visible:ring-0" />
              </div>
            </div>
            <Button className="auth-submit mt-2 min-h-12 w-full rounded-xl font-semibold shadow-lg shadow-primary/15" disabled={busy}>
              <span>{busy ? "Aguarde..." : signingUp ? "Criar minha conta" : "Entrar na minha mesa"}</span>
              {!busy && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
            {signingUp ? "Ao criar sua conta, você estará pronto para montar seu personagem e participar da mesa." : "Seus personagens e sua jornada continuam aqui, esperando por você."}
          </p>
        </section>
      </div>
    </main>
  );
}
