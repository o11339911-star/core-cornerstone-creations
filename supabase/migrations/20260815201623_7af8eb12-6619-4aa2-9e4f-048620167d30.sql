do $$
declare v_u uuid; v_e uuid;
begin
  select id into v_u from auth.users where email='pdesign-owner@example.com';
  select id into v_e from public.entities where name='DESIGN-QA-ENTITY';
  if v_u is null then return; end if;
  perform set_config('rakeez.service_link','on', true);
  alter table public.entity_memberships disable trigger user;
  delete from public.policy_acceptances where user_id = v_u;
  delete from public.projects where entity_id = v_e;
  delete from public.entity_memberships where user_id = v_u;
  delete from public.entities where id = v_e;
  alter table public.entity_memberships enable trigger user;
  perform set_config('rakeez.service_link','off', true);
  delete from auth.identities where user_id = v_u;
  delete from auth.users where id = v_u;
end $$;