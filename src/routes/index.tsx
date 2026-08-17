import { Link, createFileRoute } from "@tanstack/react-router";

import heroImage from "../assets/rakeez-hero.jpg";
import { AuthHeader } from "@/components/auth-header";
import { useI18n, useT } from "@/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ركيز — حلول رقمية راسخة" },
      {
        name: "description",
        content:
          "ركيز: شريكك لبناء أساس رقمي متين. نقدم استراتيجيات وتصاميم وحلول تقنية تساعد أعمالك على النمو بثبات.",
      },
      { property: "og:title", content: "ركيز — حلول رقمية راسخة" },
      {
        property: "og:description",
        content:
          "ركيز: شريكك لبناء أساس رقمي متين. نقدم استراتيجيات وتصاميم وحلول تقنية تساعد أعمالك على النمو بثبات.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: heroImage },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: heroImage },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-background font-sans text-foreground">
      <Header />
      <main className="flex-1">
        <Hero />
        <Features />
        <About />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return <AuthHeader />;
}

function Hero() {
  const t = useT();

  return (
    <section id="hero" className="border-b border-border bg-background">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-28">
        <div className="min-w-0 text-center lg:text-start">
          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">
            {t("hero.badge")}
          </span>
          <h1 className="mt-6 text-balance text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">
            {t("hero.title")}
          </h1>
          <p className="mt-6 max-w-xl text-balance text-lg leading-relaxed text-muted-foreground lg:mx-0">
            {t("hero.subtitle")}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <a
              href="#contact"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              {t("hero.primaryCta")}
            </a>
            <a
              href="#services"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-card px-6 py-3 text-base font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              {t("hero.secondaryCta")}
            </a>
          </div>
        </div>

        <div className="relative min-w-0">
          <div className="aspect-[4/3] overflow-hidden rounded-3xl border border-border bg-secondary shadow-sm">
            <img
              src={heroImage}
              alt={t("hero.imageAlt")}
              width={1920}
              height={1080}
              className="h-full w-full object-cover"
            />
          </div>
          <div
            aria-hidden="true"
            className="absolute -bottom-4 -start-4 hidden h-20 w-20 rounded-2xl border border-primary/20 bg-primary/10 lg:block"
          />
        </div>
      </div>
    </section>
  );
}

function Features() {
  const t = useT();

  const features = [
    { key: "strategy", icon: CompassIcon },
    { key: "design", icon: LayersIcon },
    { key: "innovation", icon: SparklesIcon },
  ];

  return (
    <section id="services" className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("features.title")}
          </h2>
          <p className="mt-4 text-balance text-lg text-muted-foreground">
            {t("features.subtitle")}
          </p>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.key}
              className="group relative rounded-2xl border border-border bg-card p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-foreground">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-6 text-xl font-semibold text-card-foreground">
                {t(`features.${feature.key}.title`)}
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                {t(`features.${feature.key}.description`)}
              </p>
              <div className="absolute inset-x-0 bottom-0 h-1 rounded-b-2xl bg-primary opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function About() {
  const t = useT();

  const stats = [
    { value: t("about.stat1Value"), label: t("about.stat1Label") },
    { value: t("about.stat2Value"), label: t("about.stat2Label") },
    { value: t("about.stat3Value"), label: t("about.stat3Label") },
  ];

  return (
    <section id="about" className="border-y border-border bg-secondary/40 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {t("about.title")}
            </h2>
            <p className="mt-6 text-balance text-lg leading-relaxed text-muted-foreground">
              {t("about.paragraph1")}
            </p>
            <p className="mt-4 text-balance text-lg leading-relaxed text-muted-foreground">
              {t("about.paragraph2")}
            </p>

            <div className="mt-10 grid grid-cols-3 gap-6 text-center">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <div className="text-3xl font-bold text-primary">{stat.value}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-secondary shadow-sm">
              <img
                src={heroImage}
                alt={t("about.imageAlt")}
                width={1920}
                height={1080}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-6 -start-6 hidden h-24 w-24 rounded-2xl border border-primary/20 bg-primary/10 lg:block" />
            <div className="absolute -top-6 -end-6 hidden h-16 w-16 rounded-full border-4 border-primary/20 lg:block" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Contact() {
  const t = useT();

  return (
    <section id="contact" className="py-24 sm:py-32">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {t("contact.title")}
        </h2>
        <p className="mt-4 text-balance text-lg text-muted-foreground">{t("contact.subtitle")}</p>

        <form
          className="mt-12 space-y-6 rounded-2xl border border-border bg-card p-8 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2 text-start">
              <label htmlFor="name" className="text-sm font-medium text-foreground">
                {t("contact.nameLabel")}
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder={t("contact.namePlaceholder")}
                className="flex h-11 w-full rounded-lg border border-input bg-background px-4 py-2 text-sm text-foreground shadow-sm outline-none ring-ring transition-all placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
            </div>
            <div className="space-y-2 text-start">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                {t("contact.emailLabel")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                dir="ltr"
                placeholder={t("contact.emailPlaceholder")}
                className="flex h-11 w-full rounded-lg border border-input bg-background px-4 py-2 text-start text-sm text-foreground shadow-sm outline-none ring-ring transition-all placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
            </div>
          </div>
          <div className="space-y-2 text-start">
            <label htmlFor="message" className="text-sm font-medium text-foreground">
              {t("contact.messageLabel")}
            </label>
            <textarea
              id="message"
              name="message"
              rows={4}
              placeholder={t("contact.messagePlaceholder")}
              className="flex w-full rounded-lg border border-input bg-background px-4 py-2 text-sm text-foreground shadow-sm outline-none ring-ring transition-all placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 sm:w-auto"
          >
            {t("contact.submit")}
          </button>
        </form>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useI18n();

  const links = [
    { key: "nav.home", to: "#hero" },
    { key: "nav.servicesShort", to: "#services" },
    { key: "nav.contact", to: "#contact" },
  ];

  return (
    <footer className="border-t border-border bg-card py-12 text-foreground">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              {t("common.appInitial")}
            </span>
            <span className="text-lg font-bold">{t("common.appName")}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("footer.rights", { year: new Date().getFullYear() })}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            <Link
              to="/verify-file"
              className="inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              تحقق من ملف
            </Link>
            {links.map((link) => (
              <a
                key={link.to}
                href={link.to}
                className="inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                {t(link.key)}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function CompassIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m16.2 7.8-4.6 4.6-4.6-4.6" />
      <path d="m7.8 16.2 4.6-4.6 4.6 4.6" />
    </svg>
  );
}

function LayersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3-1.9 5.8H4l5.1 3.7L6.2 19 12 14.8 17.8 19l-2.9-6.5L20 8.8h-6.1Z" />
    </svg>
  );
}
