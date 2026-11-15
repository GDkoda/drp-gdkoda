drop policy if exists "site backgrounds active readable by signed in users" on storage.objects;
create policy "site backgrounds published or master readable" on storage.objects for select to authenticated
using (
  bucket_id = 'site-backgrounds' and (
    public.has_role(auth.uid(), 'master')
    or name = (select s.appearance->>'backgroundPath' from public.site_settings s where s.id = 1)
  )
);