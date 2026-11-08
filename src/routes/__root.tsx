import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { AppCustomizationProvider } from "@/lib/app-customization";
import { PwaInstallProvider } from "@/components/PwaInstall";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Caminho perdido</h2>
        <p className="mt-2 text-sm text-muted-foreground">Esta trilha não leva a lugar algum.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Voltar
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Algo deu errado</h1>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
            Tentar de novo
          </button>
          <a href="/" className="rounded-md border px-4 py-2 text-sm">Início</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Mesa 3D&T Alpha" },
      { name: "description", content: "Mesa de RPG 3D&T Alpha: fichas, loja, baú e mini-jogos." },
      { name: "theme-color", content: "#211b18" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Mesa 3D&T" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Crimson+Pro:wght@400;600&display=swap" },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/pwa-icon-192.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="dark" data-palette="ousado">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var m=localStorage.getItem("mesa-theme");var p=localStorage.getItem("mesa-palette");var valid=["ousado","eletrizante","destemido","futurista","prata-grafite","areia-vinho","sangue","fervor","taverna-zendikar","po-de-fada"];document.documentElement.dataset.theme=m==="light"?"light":"dark";document.documentElement.dataset.palette=valid.indexOf(p)>=0?p:"ousado";}catch(e){document.documentElement.dataset.theme="dark";document.documentElement.dataset.palette="ousado";}})();` }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  // O badge é injetado pelo runtime de publicação; esconda-o também se for recriado após a hidratação.
  useEffect(() => {
    const suppressBadge = () => {
      const badge = document.getElementById("lovable-badge");
      if (!badge) return;
      badge.setAttribute("aria-hidden", "true");
      badge.style.setProperty("display", "none", "important");
      badge.style.setProperty("visibility", "hidden", "important");
      badge.style.setProperty("pointer-events", "none", "important");
    };
    suppressBadge();
    const observer = new MutationObserver(suppressBadge);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AppCustomizationProvider>
        <PwaInstallProvider>
          <Outlet />
        </PwaInstallProvider>
        <Toaster />
      </AppCustomizationProvider>
    </QueryClientProvider>
  );
}
