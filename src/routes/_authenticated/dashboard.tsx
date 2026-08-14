import { createFileRoute, Link } from "@tanstack/react-router";

import { useT } from "@/i18n";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const t = useT();
  return (
    <div className="flex min-h-screen flex-col bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("common.dashboard")}</h1>
        <p className="mt-4 text-muted-foreground">لوحة التحكم الرئيسية قيد الإنشاء.</p>
        <div className="mt-8">
          <Link
            to="/settings/security"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("common.security")}
          </Link>
        </div>
      </div>
    </div>
  );
}
