CREATE OR REPLACE FUNCTION public.entity_license_state(_entity_id uuid)
 RETURNS TABLE(has_license boolean, is_valid boolean, license_number text, expires_on date, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare l public.entity_licenses%rowtype;
begin
  select el.* into l from public.entity_licenses el
   where el.entity_id = _entity_id and el.status = 'active'
   order by (el.expires_on is null) desc, el.expires_on desc nulls last limit 1;
  if l.id is null then
    return query select false, false, null::text, null::date, 'NO_LICENSE'::text; return;
  end if;
  if l.verified_at is null then
    return query select true, false, l.license_number, l.expires_on, 'NOT_VERIFIED'::text; return;
  end if;
  if l.expires_on is not null and l.expires_on < current_date then
    return query select true, false, l.license_number, l.expires_on, 'EXPIRED'::text; return;
  end if;
  return query select true, true, l.license_number, l.expires_on, 'VALID'::text;
end; $function$;