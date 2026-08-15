alter type public.app_module add value if not exists 'privacy';
alter type public.platform_queue_source add value if not exists 'dsr_request';
alter table public.duration_timers drop constraint duration_timers_kind_ck;
alter table public.duration_timers add constraint duration_timers_kind_ck check (subject_kind = any (array['request','stage','milestone','retention','warranty','marketing_contract','marketing_license','media_publication','appointment','dsr_request']));