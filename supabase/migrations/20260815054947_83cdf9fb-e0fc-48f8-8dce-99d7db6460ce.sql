create or replace function private.can_access_request_ctx(_user_id uuid, _project_id uuid, _requested_by uuid, _assigned_user uuid, _assigned_entity uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    _user_id is not null and (
      coalesce(_requested_by = _user_id, false)
      or coalesce(_assigned_user = _user_id, false)
      or coalesce(private.is_project_insider(_user_id, _project_id), false)
      or coalesce(
        _assigned_entity is not null
        and private.is_entity_member(_user_id, _assigned_entity)
        and private.accepted_party_entity(_user_id, _project_id) = _assigned_entity, false)
    ), false);
$$;

create or replace function private.can_see_message_ctx(_user_id uuid, _message_id uuid, _thread_id uuid, _author_id uuid, _visibility text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    private.can_access_thread(_user_id, _thread_id)
    and (
      coalesce(_author_id = _user_id, false)
      or _visibility = 'shared'
      or (
        _visibility = 'internal_note'
        and private.is_project_insider(_user_id, private.thread_project(_thread_id))
      )
      or (
        _visibility = 'party_limited'
        and exists (
          select 1 from public.correspondence_message_audience a
          where a.message_id = _message_id
            and (
              a.audience_user_id = _user_id
              or (a.audience_entity_id is not null and private.is_entity_member(_user_id, a.audience_entity_id))
            )
        )
      )
    ), false);
$$;

grant execute on function private.can_access_request_ctx(uuid, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function private.can_see_message_ctx(uuid, uuid, uuid, uuid, text) to authenticated;