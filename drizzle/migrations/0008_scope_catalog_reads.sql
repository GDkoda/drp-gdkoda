DROP POLICY IF EXISTS "shop read" ON public.shop_items;
CREATE POLICY "shop read" ON public.shop_items FOR SELECT TO authenticated
USING ((active AND (public.has_role(auth.uid(),'player') OR public.has_role(auth.uid(),'master'))) OR public.has_role(auth.uid(),'master'));
DROP POLICY IF EXISTS "monsters read" ON public.monsters;
CREATE POLICY "monsters read" ON public.monsters FOR SELECT TO authenticated
USING ((active AND public.has_role(auth.uid(),'player')) OR public.has_role(auth.uid(),'master'));
DROP POLICY IF EXISTS "spells read" ON public.spells;
CREATE POLICY "spells read" ON public.spells FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'player') OR public.has_role(auth.uid(),'master'));
DROP POLICY IF EXISTS "lore categories read" ON public.lore_categories;
CREATE POLICY "lore categories read" ON public.lore_categories FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'player') OR public.has_role(auth.uid(),'master'));
DROP POLICY IF EXISTS "site backgrounds published or master readable" ON storage.objects;
CREATE POLICY "site backgrounds published or master readable" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'site-backgrounds' AND auth.uid() IS NOT NULL AND (
  public.has_role(auth.uid(),'master')
  OR (public.has_role(auth.uid(),'player') AND name = (SELECT s.appearance->>'backgroundPath' FROM public.site_settings s WHERE s.id = 1))));