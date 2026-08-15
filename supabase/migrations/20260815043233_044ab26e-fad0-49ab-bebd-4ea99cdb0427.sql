
create or replace function private.can_access_thread_ctx(
  _user_id uuid, _project_id uuid, _contract_id uuid, _stage_id uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select _user_id is not null
    and private.can(_user_id, 'correspondence'::public.app_module, 'view'::public.app_action, null, _project_id)
    and (
      private.is_project_insider(_user_id, _project_id)
      or private.accepted_party_entity(_user_id, _project_id) is not null
    )
    and (_contract_id is null or private.can_access_contract(_user_id, _contract_id))
    and (_stage_id is null or private.stage_in_scope(_user_id, _stage_id, _project_id));
$$;

create or replace function private.can_see_message_ctx(
  _user_id uuid, _message_id uuid, _thread_id uuid, _author_id uuid, _visibility text)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select private.can_access_thread(_user_id, _thread_id)
    and (
      _author_id = _user_id
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
    );
$$;

revoke all on function private.can_access_thread_ctx(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function private.can_see_message_ctx(uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function private.can_access_thread_ctx(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function private.can_see_message_ctx(uuid, uuid, uuid, uuid, text) to authenticated;

drop policy threads_select on public.correspondence_threads;
create policy threads_select on public.correspondence_threads
  for select to authenticated
  using (private.can_access_thread_ctx(auth.uid(), project_id, contract_id, stage_id));

drop policy messages_select on public.correspondence_messages;
create policy messages_select on public.correspondence_messages
  for select to authenticated
  using (private.can_see_message_ctx(auth.uid(), id, thread_id, author_id, visibility));
