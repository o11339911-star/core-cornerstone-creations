grant select on public.deal_messages to authenticated;
grant select on public.deal_message_attachments to authenticated;
grant all on public.deal_messages to service_role;
grant all on public.deal_message_attachments to service_role;
grant all on public.contracting_deal_events to service_role;
revoke insert, update, delete, truncate on public.deal_messages from anon, authenticated;
revoke insert, update, delete, truncate on public.deal_message_attachments from anon, authenticated;
revoke select, insert, update, delete, truncate on public.contracting_deal_events from anon, authenticated;