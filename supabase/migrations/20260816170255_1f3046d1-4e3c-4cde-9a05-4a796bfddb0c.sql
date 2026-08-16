grant select, insert, update, delete on public.archive_folders to authenticated;
grant select, insert, update, delete on public.archive_items to authenticated;
grant select, insert, update, delete on public.entity_correspondence to authenticated;
grant select, insert, update, delete on public.contracting_deals to authenticated;
grant select, insert, update on public.entity_messaging_channels to authenticated;
grant all on public.archive_folders, public.archive_items, public.entity_correspondence,
  public.contracting_deals, public.entity_messaging_channels to service_role;
revoke all on public.archive_folders, public.archive_items, public.entity_correspondence,
  public.contracting_deals, public.entity_messaging_channels from anon;