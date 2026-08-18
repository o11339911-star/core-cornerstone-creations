import { createFileRoute, redirect } from "@tanstack/react-router";

/** المسار القديم — يبقى عاملًا ويحوّل دائمًا إلى موقع القوالب داخل لوحة الإدارة. */
export const Route = createFileRoute("/_authenticated/admin/report-templates")({
  beforeLoad: () => {
    throw redirect({ to: "/platform/report-templates", replace: true });
  },
});
