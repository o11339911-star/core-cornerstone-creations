create policy media_raw_update on storage.objects for update to authenticated
using (
  bucket_id = 'media-360-raw'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and private.can(auth.uid(), 'media'::public.app_module, 'update'::public.app_action, null, ((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'media-360-raw'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and private.can(auth.uid(), 'media'::public.app_module, 'update'::public.app_action, null, ((storage.foldername(name))[1])::uuid)
);

create policy media_public_update on storage.objects for update to authenticated
using (
  bucket_id = 'media-360-public'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and private.can(auth.uid(), 'media'::public.app_module, 'share'::public.app_action, null, ((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'media-360-public'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and private.can(auth.uid(), 'media'::public.app_module, 'share'::public.app_action, null, ((storage.foldername(name))[1])::uuid)
);