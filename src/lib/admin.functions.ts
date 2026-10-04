import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // master_purge_user checks the caller is master and removes all game data
    const { error } = await context.supabase.rpc("master_purge_user" as never, { _user: data.userId } as never);
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: e2 } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });
