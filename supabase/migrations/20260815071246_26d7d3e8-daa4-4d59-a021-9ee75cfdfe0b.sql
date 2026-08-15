create or replace function public.can_access_document_version(_version_id uuid, _action app_action default 'view')
returns boolean
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare _doc uuid;
begin
  select document_id into _doc from public.document_versions where id = _version_id;
  if _doc is null then return false; end if;
  return private.can_access_document(auth.uid(), _doc, _action);
end;
$$;