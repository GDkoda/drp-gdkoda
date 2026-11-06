import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";

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
        if (!data.session) { toast.success("Confira seu e-mail para confirmar."); return; }
      }
      nav({ to: "/taverna" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-20 sm:px-6">
      <div className="absolute right-4 top-5 sm:right-6 sm:top-6"><ThemeToggle /></div>
      <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-2xl border border-border/80 bg-card/95 p-6 shadow-2xl shadow-black/10 backdrop-blur sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 font-display text-lg font-bold text-gold">3D&T</div>
          <h1 className="text-center text-2xl font-bold text-gold sm:text-3xl">{mode === "in" ? "Bem-vindo de volta" : "Novo aventureiro"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{mode === "in" ? "Entre para continuar sua jornada." : "Crie sua conta e prepare sua próxima aventura."}</p>
        </div>
        <div className="space-y-2">
          <Label>E-mail</Label>
          <Input autoComplete="email" value={login} onChange={(e) => setLogin(e.target.value)} required type="email" placeholder="voce@exemplo.com" />
        </div>
        {mode === "up" && (
          <div className="space-y-2">
            <Label>Nome de usuário</Label>
            <Input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="Seu nome de aventureiro" />
          </div>
        )}
        <div className="space-y-2">
          <Label>Senha</Label>
          <Input autoComplete={mode === "in" ? "current-password" : "new-password"} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="Mínimo de 6 caracteres" />
        </div>
        <Button className="mt-2 min-h-11 w-full rounded-xl font-display" disabled={busy}>{mode === "in" ? "Entrar" : "Criar conta"}</Button>
        <button type="button" className="w-full rounded-lg py-2 text-sm text-muted-foreground underline-offset-4 hover:text-gold hover:underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Não tem conta? Cadastre-se" : "Já tenho conta"}
        </button>
      </form>
    </main>
  );
}
