import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Evita refetches repetidos ao alternar entre páginas recém-visitadas.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Pré-carrega a página quando o usuário demonstra intenção de navegar.
    defaultPreload: "intent",
    // Mantém o preload quente por 30s, em sintonia com o cache de queries.
    defaultPreloadStaleTime: 30_000,
    defaultPreloadDelay: 80,
  });

  return router;
};
