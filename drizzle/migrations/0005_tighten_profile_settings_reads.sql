DROP POLICY IF EXISTS "profiles readable" ON public.profiles;
CREATE POLICY "profiles read own or master" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'master'::app_role));

CREATE OR REPLACE FUNCTION public.list_player_directory()
RETURNS TABLE(id uuid, username text, display_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.username, p.display_name FROM public.profiles p
  WHERE auth.uid() IS NOT NULL ORDER BY p.display_name
$$;
REVOKE ALL ON FUNCTION public.list_player_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_player_directory() TO authenticated;

DROP POLICY IF EXISTS "settings read" ON public.game_settings;
CREATE POLICY "settings read signed in" ON public.game_settings FOR SELECT TO authenticated
  USING (id = 1 AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "site settings readable by everyone" ON public.site_settings;
CREATE POLICY "site settings singleton readable" ON public.site_settings FOR SELECT TO anon, authenticated
  USING (id = 1);
REVOKE SELECT ON public.site_settings FROM anon;
GRANT SELECT (id, texts, appearance, updated_at) ON public.site_settings TO anon;

DROP POLICY IF EXISTS "site backgrounds readable by signed in users" ON storage.objects;
CREATE POLICY "site backgrounds active readable by signed in users" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'site-backgrounds' AND (storage.foldername(name))[1] = 'active' AND auth.uid() IS NOT NULL);