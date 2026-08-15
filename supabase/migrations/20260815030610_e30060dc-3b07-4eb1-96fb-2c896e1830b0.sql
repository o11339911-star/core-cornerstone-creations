revoke all on function public.accept_entity_invitation(text) from anon;
revoke all on function public.create_entity_invitation(uuid, text, public.app_role, integer) from anon;
revoke all on function public.offboard_member(uuid, uuid, uuid, text) from anon;