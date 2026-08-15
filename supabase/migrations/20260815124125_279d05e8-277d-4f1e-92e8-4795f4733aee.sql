revoke execute on function public.upsert_entity_public_profile(uuid,text,text,text,text,text[],text[],text,text,text,text,text,text) from anon;
revoke execute on function public.set_entity_public_publish(uuid,boolean,boolean) from anon;
revoke execute on function public.set_entity_slug(uuid,text) from anon;

revoke all on public.entity_public_profiles from anon;
revoke references, trigger, maintain, delete, truncate on public.entity_public_profiles from authenticated;