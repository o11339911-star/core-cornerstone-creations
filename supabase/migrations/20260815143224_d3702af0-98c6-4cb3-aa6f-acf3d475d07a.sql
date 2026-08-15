create policy "appointment participants read their timers"
on public.duration_timers for select to authenticated
using (
  subject_kind = 'appointment'
  and exists (
    select 1 from public.appointments a
    join public.entity_memberships m
      on m.entity_id in (a.requester_entity_id, a.provider_entity_id)
    where a.id = duration_timers.subject_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);