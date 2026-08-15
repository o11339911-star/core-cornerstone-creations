CREATE OR REPLACE FUNCTION public.create_entity_invitation(_entity_id uuid, _email text, _role app_role DEFAULT 'member'::app_role, _valid_days integer DEFAULT 7)
 RETURNS TABLE(invitation_id uuid, token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_token text;
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.can(v_actor, 'members', 'manage_members', _entity_id, null) then
    raise exception 'Not allowed to invite members to this entity' using errcode = '42501';
  end if;
  if _role = 'owner' and not private.has_role(v_actor, _entity_id, 'owner') then
    raise exception 'Only an owner can invite another owner' using errcode = '42501';
  end if;

  update public.entity_invitations
    set status = 'expired'
    where entity_id = _entity_id and status = 'pending' and expires_at <= now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.entity_invitations
    (entity_id, email, role, token_hash, expires_at, invited_by)
  values
    (_entity_id, lower(_email), _role,
     encode(sha256(convert_to(v_token, 'utf8')), 'hex'),
     now() + make_interval(days => greatest(_valid_days, 1)),
     v_actor)
  returning id into v_id;

  return query select v_id, v_token;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_entity_invitation(uuid, text, app_role, integer) FROM anon;