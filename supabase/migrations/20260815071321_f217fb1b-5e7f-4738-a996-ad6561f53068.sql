do $$
declare r record;
begin
  set session_replication_role = replica;
  for r in select d.id from public.documents d join public.entities e on e.id = d.owner_entity_id where e.name = 'TTL TMP ENTITY' loop
    delete from storage.objects o using public.document_versions v where v.document_id = r.id and o.bucket_id = v.storage_bucket and o.name = v.storage_path;
    delete from public.document_audience where document_id = r.id;
    delete from public.document_links where document_id = r.id;
    update public.documents set current_version_id = null where id = r.id;
    delete from public.document_versions where document_id = r.id;
    delete from public.documents where id = r.id;
  end loop;
  delete from public.entity_memberships where entity_id in (select id from public.entities where name = 'TTL TMP ENTITY');
  delete from public.entities where name = 'TTL TMP ENTITY';
  set session_replication_role = origin;
end $$;