import { createFileRoute, Link } from "@tanstack/react-router";
import heroImage from "../assets/rakeez-hero.jpg";

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
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
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
  const navLinks = [
    { label: "الرئيسية", to: "#hero" },
    { label: "خدماتنا", to: "#services" },
    { label: "من نحن", to: "#about" },
    { label: "تواصل معنا", to: "#contact" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#hero" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
            ر
          </span>
          <span className="text-lg font-bold tracking-tight text-foreground">
            ركيز
          </span>
        </a>

        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.to}
              href={link.to}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <a
          href="#contact"
          className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
        >
          ابدأ الآن
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section
      id="hero"
      className="relative flex min-h-[80vh] items-center justify-center overflow-hidden"
    >
      <img
        src={heroImage}
        alt="خلفية تجريدية ترمز إلى الثبات والأساس بلونين أزرق داكن وذهبي"
        width={1920}
        height={1080}
        className="absolute inset-0 h-full w-full object-cover"
        priority="true"
      />
      <div className="absolute inset-0 bg-rakeez-navy/70" />
      <div className="absolute inset-0 bg-gradient-to-t from-rakeez-navy/90 via-transparent to-rakeez-navy/30" />

      <div className="relative z-10 mx-auto max-w-4xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <span className="inline-flex items-center rounded-full border border-rakeez-gold/30 bg-rakeez-gold/10 px-3 py-1 text-sm font-medium text-rakeez-gold backdrop-blur-sm">
          حلول رقمية راسخة
        </span>
        <h1 className="mt-6 text-4xl font-extrabold leading-tight text-rakeez-cream sm:text-5xl lg:text-6xl text-balance">
          نبني أساسًا رقميًا قويًا لنمو أعمالك
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-rakeez-cream/80 text-balance">
          في ركيز، نؤمن بأن كل مشروع ناجح يبدأ بفهم عميق وتصميم واعٍ وتنفيذ
          دقيق. نساعدك في وضع حجر الأساس الرقمي لمستقبل أعمالك.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a
            href="#contact"
            className="inline-flex items-center justify-center rounded-full bg-rakeez-gold px-6 py-3 text-base font-semibold text-rakeez-navy shadow-lg transition-all hover:bg-rakeez-gold/90 hover:shadow-xl"
          >
            ابدأ مشروعك
          </a>
          <a
            href="#services"
            className="inline-flex items-center justify-center rounded-full border border-rakeez-cream/30 bg-rakeez-cream/5 px-6 py-3 text-base font-semibold text-rakeez-cream backdrop-blur-sm transition-all hover:bg-rakeez-cream/10"
          >
            اكتشف خدماتنا
          </a>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      title: "استراتيجية رقمية",
      description:
        "نرسم خارطة طريق واضحة لوجودك الرقمي، مبنية على أهدافك وجمهورك وفرص السوق.",
      icon: CompassIcon,
    },
    {
      title: "تصميم وتطوير",
      description:
        "نصمم واجهات أنيقة ونطور تجارب سلسة تعكس هويتك وتقدم قيمة حقيقية لمستخدميك.",
      icon: LayersIcon,
    },
    {
      title: "حلول مبتكرة",
      description:
        "نبني أدوات وتقنيات مخصصة تتكيف مع احتياجاتك وتنمو مع تطور أعمالك.",
      icon: SparklesIcon,
    },
  ];

  return (
    <section id="services" className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-balance">
            ما الذي نقدمه؟
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-balance">
            ثلاثة ركائز أساسية نبني عليها كل مشروع نعمل فيه.
          </p>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group relative rounded-2xl border border-border bg-card p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-foreground">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-6 text-xl font-semibold text-card-foreground">
                {feature.title}
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
              <div className="absolute inset-x-0 bottom-0 h-1 rounded-b-2xl bg-rakeez-gold opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function About() {
  return (
    <section id="about" className="border-y border-border bg-secondary/40 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-balance">
              من نحن؟
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground text-balance">
              ركيز هو استوديو رقمي يساعد الشركات والعلامات التجارية على بناء
              حضور رقمي قوي ومستدام. نجمع بين الفهم العميق للأعمال، والتصميم
              البصري المتقن، والتنفيذ التقني الدقيق.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground text-balance">
              هدفنا ليس تسليم مشروع فحسب، بل إرساء شراكة طويلة المدى تساعدك
              على التكيف والنمو في عالم رقمي متغير.
            </p>

            <div className="mt-10 grid grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-3xl font-bold text-rakeez-gold">+50</div>
                <div className="mt-1 text-sm text-muted-foreground">مشروع منجز</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-rakeez-gold">+30</div>
                <div className="mt-1 text-sm text-muted-foreground">عميل سعيد</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-rakeez-gold">5+</div>
                <div className="mt-1 text-sm text-muted-foreground">سنوات خبرة</div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-rakeez-navy shadow-2xl">
              <img
                src={heroImage}
                alt="تجسيد بصري لقيم ركيز: الثبات والأساس والنمو"
                width={1920}
                height={1080}
                loading="lazy"
                className="h-full w-full object-cover opacity-80"
              />
            </div>
            <div className="absolute -bottom-6 -start-6 hidden h-24 w-24 rounded-2xl bg-rakeez-gold lg:block" />
            <div className="absolute -top-6 -end-6 hidden h-16 w-16 rounded-full border-4 border-rakeez-gold lg:block" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contact" className="py-24 sm:py-32">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-balance">
          جاهز لوضع حجر الأساس؟
        </h2>
        <p className="mt-4 text-lg text-muted-foreground text-balance">
          دعنا نتحدث عن رؤيتك. معًا نحولها إلى منتج رقمي راسخ يحقق أهدافك.
        </p>

        <form
          className="mt-12 space-y-6 rounded-2xl border border-border bg-card p-8 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2 text-start">
              <label htmlFor="name" className="text-sm font-medium text-foreground">
                الاسم
              </label>
              <input
                id="name"
                type="text"
                placeholder="اسمك الكامل"
                className="flex h-11 w-full rounded-lg border border-input bg-background px-4 py-2 text-sm text-foreground shadow-sm outline-none ring-ring transition-all placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
            </div>
            <div className="space-y-2 text-start">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                البريد الإلكتروني
              </label>
              <input
                id="email"
                type="email"
                placeholder="your@email.com"
                className="flex h-11 w-full rounded-lg border border-input bg-background px-4 py-2 text-sm text-foreground shadow-sm outline-none ring-ring transition-all placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
            </div>
          </div>
          <div className="space-y-2 text-start">
            <label htmlFor="message" className="text-sm font-medium text-foreground">
              الرسالة
            </label>
            <textarea
              id="message"
              rows={4}
              placeholder="اخبرنا قليلاً عن مشروعك..."
              className="flex w-full rounded-lg border border-input bg-background px-4 py-2 text-sm text-foreground shadow-sm outline-none ring-ring transition-all placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
          </div>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 sm:w-auto"
          >
            إرسال الرسالة
          </button>
        </form>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-rakeez-navy py-12 text-rakeez-cream">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rakeez-gold text-sm font-bold text-rakeez-navy">
              ر
            </span>
            <span className="text-lg font-bold">ركيز</span>
          </div>
          <p className="text-sm text-rakeez-cream/60">
            © {new Date().getFullYear()} ركيز. جميع الحقوق محفوظة.
          </p>
          <div className="flex items-center gap-6">
            <a
              href="#hero"
              className="text-sm text-rakeez-cream/60 transition-colors hover:text-rakeez-cream"
            >
              الرئيسية
            </a>
            <a
              href="#services"
              className="text-sm text-rakeez-cream/60 transition-colors hover:text-rakeez-cream"
            >
              الخدمات
            </a>
            <a
              href="#contact"
              className="text-sm text-rakeez-cream/60 transition-colors hover:text-rakeez-cream"
            >
              تواصل معنا
            </a>
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
    >
      <path d="m12 3-1.9 5.8H4l5.1 3.7L6.2 19 12 14.8 17.8 19l-2.9-6.5L20 8.8h-6.1Z" />
    </svg>
  );
}
