CREATE TABLE public.site_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  texts jsonb NOT NULL DEFAULT '{}'::jsonb,
  appearance jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT UPDATE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site settings readable by everyone"
ON public.site_settings FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "site settings editable by master"
ON public.site_settings FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'master'))
WITH CHECK (public.has_role(auth.uid(), 'master'));

CREATE OR REPLACE FUNCTION public.touch_site_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_site_settings_before_update
BEFORE UPDATE ON public.site_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_site_settings();

CREATE POLICY "site backgrounds readable by signed in users"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'site-backgrounds');

CREATE POLICY "master uploads site backgrounds"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'site-backgrounds'
  AND public.has_role(auth.uid(), 'master')
  AND (storage.foldername(name))[1] = 'active'
);

CREATE POLICY "master updates site backgrounds"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'site-backgrounds' AND public.has_role(auth.uid(), 'master'))
WITH CHECK (
  bucket_id = 'site-backgrounds'
  AND public.has_role(auth.uid(), 'master')
  AND (storage.foldername(name))[1] = 'active'
);

CREATE POLICY "master deletes site backgrounds"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'site-backgrounds' AND public.has_role(auth.uid(), 'master'));