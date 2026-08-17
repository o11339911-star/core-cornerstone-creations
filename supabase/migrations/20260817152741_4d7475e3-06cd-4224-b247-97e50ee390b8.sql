ALTER TABLE public.contracting_deals DROP CONSTRAINT contracting_deals_status_check;
ALTER TABLE public.contracting_deals ADD CONSTRAINT contracting_deals_status_check
  CHECK (status = ANY (ARRAY['new'::text,'draft'::text,'negotiating'::text,'agreed'::text,'signed'::text,'cancelled'::text]));
ALTER TABLE public.contracting_deals ALTER COLUMN status SET DEFAULT 'new';
UPDATE public.contracting_deals SET status = 'new' WHERE status = 'draft';
ALTER TABLE public.contracting_deals DROP CONSTRAINT contracting_deals_status_check;
ALTER TABLE public.contracting_deals ADD CONSTRAINT contracting_deals_status_check
  CHECK (status = ANY (ARRAY['new'::text,'negotiating'::text,'agreed'::text,'signed'::text,'cancelled'::text]));