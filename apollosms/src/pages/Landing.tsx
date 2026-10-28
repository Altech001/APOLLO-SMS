import SEO from "@/components/SEO";
import { BRAND_DESCRIPTION, BRAND_NAME, SITE_URL } from "@/constants/brand";
import { useAuth } from "@/lib/auth";
import {
  ArrowBigUpDash,
  ArrowRight,
  Bell,
  Bot,
  Boxes,
  Brush,
  CalendarDays,
  CircleCheck,
  GitPullRequestArrow,
  Inbox,
  MessageCircleMore,
  MessagesSquare,
  PanelLeft,
  Radio,
  RefreshCw,
  Server,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

const features = [
  { icon: MessagesSquare, label: "Bulk SMS campaigns" },
  { icon: MessageCircleMore, label: "WhatsApp messaging" },
  { icon: Bot, label: "AI writing assistant" },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: BRAND_NAME,
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/logo.png`,
      description: BRAND_DESCRIPTION,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: BRAND_NAME,
      description: BRAND_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: BRAND_NAME,
      url: `${SITE_URL}/`,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: BRAND_DESCRIPTION,
      provider: { "@id": `${SITE_URL}/#organization` },
      featureList: [
        "Bulk SMS campaigns",
        "WhatsApp business messaging",
        "AI-assisted message writing",
        "Contact and group management",
        "Message templates and delivery history",
      ],
    },
  ],
};

/* Preview data that mirrors the real dashboard */
const chartDays = [
  { label: "Oct 22", value: 0 },
  { label: "Oct 23", value: 5 },
  { label: "Oct 24", value: 2 },
  { label: "Oct 25", value: 0 },
  { label: "Oct 26", value: 2 },
  { label: "Oct 27", value: 0 },
  { label: "Oct 28", value: 0 },
];

// 7 rows (days) x 12 columns (weeks). [row, col, level 1-3]
const heatCells: [number, number, number][] = [
  [0, 9, 2], [4, 1, 1], [4, 2, 1], [4, 5, 1], [4, 9, 1],
  [5, 6, 1], [5, 9, 1], [5, 10, 2], [6, 0, 3], [6, 2, 1],
  [6, 3, 1], [6, 4, 1], [6, 6, 2], [6, 7, 1], [6, 9, 1],
];
const heatLevels = Array<number>(84).fill(0);
heatCells.forEach(([r, c, l]) => (heatLevels[r * 12 + c] = l));
const heatColor = ["bg-[#18181c]", "bg-[#0f3d2e]", "bg-[#145a43]", "bg-[#1fa878]"];

const pillClass =
  "inline-flex items-center gap-1.5 rounded-full border border-[#1f6b4d] px-2.5 py-1 text-[9px] font-semibold text-[#22a06b] [&_svg]:size-3";

/* ------------------------------------------------------------------ */
/* Scroll-driven device frame (no extra dependencies)                  */
/* The frame starts tilted back + slightly large, and flattens as the  */
/* section scrolls into view.                                          */
/* ------------------------------------------------------------------ */
function ScrollFrame({ children }: { children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const frame = frameRef.current;
    if (!wrap || !frame) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;

    const apply = () => {
      raf = 0;
      const vh = window.innerHeight;
      const top = wrap.getBoundingClientRect().top;

      // 0 when the section's top is at the bottom of the screen,
      // 1 when it has reached 15% from the top.
      const start = vh;
      const end = vh * 0.15;
      const raw = (start - top) / (start - end);
      const p = reduce ? 1 : Math.min(1, Math.max(0, raw));

      const mobile = window.innerWidth < 768;
      const scaleFrom = mobile ? 0.8 : 1.05;
      const scaleTo = mobile ? 0.95 : 1;

      const rotate = 22 * (1 - p); // degrees
      const scale = scaleFrom + (scaleTo - scaleFrom) * p;
      const lift = -30 * p; // px, slight upward drift

      frame.style.transform = `translateY(${lift}px) rotateX(${rotate}deg) scale(${scale})`;
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={wrapRef} className="[perspective:1000px]">
      <div
        ref={frameRef}
        className="mx-auto max-w-5xl rounded-[30px] border-4 border-[#6c6c6c] bg-[#222] p-2 shadow-[0_0_#0000004d,0_9px_20px_#0000004a,0_37px_37px_#00000042,0_84px_50px_#00000026,0_149px_60px_#0000000a,0_233px_65px_#00000003] will-change-transform [transform-origin:center_top] md:p-4"
        style={{ transform: "rotateX(22deg) scale(1.05)" }}
      >
        <div className="overflow-hidden rounded-2xl bg-[#0e0e11]">{children}</div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const primaryHref = isAuthenticated ? "/chat" : "/signup";
  const verificationToken = import.meta.env.VITE_GOOGLE_SITE_VERIFICATION;

  const ctaBase =
    "inline-flex items-center justify-center gap-[9px] rounded-full border border-[#174c83]/[0.13] font-medium transition duration-150 hover:-translate-y-0.5 hover:bg-[#10375f] hover:text-white motion-reduce:transition-none motion-reduce:hover:translate-y-0 [&_svg]:size-4 [&_svg]:transition-transform [&:hover_svg]:translate-x-[3px]";

  return (
    <div className="relative min-h-svh overflow-x-clip bg-[radial-gradient(circle_at_84%_16%,rgba(91,151,210,0.18),transparent_27rem),linear-gradient(135deg,#f8fafc_0%,#f1f5f8_52%,#eaf1f7_100%)] font-['Barlow','Inter',sans-serif] text-[#0d1b2f]">
      <SEO
        title="Bulk SMS, WhatsApp & AI Messaging"
        description="Send bulk SMS, manage WhatsApp messaging, organize contacts, and create campaigns faster with TINORA AI's business messaging platform."
        keywords="bulk SMS Uganda, SMS marketing platform, WhatsApp business messaging, SMS gateway Uganda, AI messaging assistant, business messaging software"
        path="/"
      />
      <Helmet>
        <html lang="en-UG" />
        <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
        {verificationToken ? <meta name="google-site-verification" content={verificationToken} /> : null}
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>

      {/* dotted texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.18] [background-image:radial-gradient(rgba(13,27,47,0.12)_0.7px,transparent_0.7px)] [background-size:22px_22px]"
      />

      {/* Header */}
      <header
        aria-label="Main navigation"
        className="relative z-10 mx-auto flex min-h-[72px] w-[min(1240px,calc(100%-30px))] items-center justify-between sm:min-h-[88px] sm:w-[min(1240px,calc(100%-48px))]"
      >
        <Link
          to="/"
          aria-label={`${BRAND_NAME} home`}
          className="inline-flex items-center gap-3 text-sm font-extralight tracking-[-0.02em] sm:text-[17px]"
        >
          <span className="grid size-9 place-items-center overflow-hidden rounded-[11px] sm:size-[42px] sm:rounded-[13px]">
            <img src="/logo.png" alt="" width="44" height="44" className="size-full object-cover" />
          </span>
          <span className="text-sm font-bold sm:text-[17px]">{BRAND_NAME}</span>
        </Link>

        <nav aria-label="Account navigation" className="flex items-center gap-3 sm:gap-6">
          {isAuthenticated ? (
            <Link to="/dashboard" className="hidden text-sm font-bold text-[#415167] transition-colors hover:text-[#174c83] sm:block">
              Dashboard
            </Link>
          ) : (
            <Link to="/login" className="hidden text-sm font- text-[#415167] transition-colors hover:text-[#174c83] sm:block">
              Sign in
            </Link>
          )}
          <Link to={primaryHref} className={`${ctaBase} min-h-[39px] px-3.5 text-xs sm:min-h-11 sm:px-[18px] sm:text-[13px]`}>
            {isAuthenticated ? "Start Now" : "Get started"}
            <GitPullRequestArrow aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main className="relative z-10">
        {/* Hero copy */}
        <section
          aria-labelledby="landing-title"
          className="mx-auto w-[min(1240px,calc(100%-30px))] pb-10 pt-12 text-center sm:w-[min(1240px,calc(100%-48px))] sm:pt-16"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border-[0.2px] border-[#174c83] px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-[#174c83] backdrop-blur-md sm:text-xs">
            One workspace. Every conversation.
          </div>

          <h1
            id="landing-title"
            className="mx-auto max-w-[820px] font-['Archivo_Black','Inter',sans-serif] text-[clamp(40px,7vw,76px)] font-normal leading-[0.98] tracking-[-0.055em]"
          >
            Business messaging that{" "}
            <span className="relative inline-block text-[#174c83] after:absolute after:inset-x-[0.02em] after:-bottom-[0.11em] after:h-[0.12em] after:-rotate-[1.2deg] after:rounded-full after:bg-[#d9ff57] after:content-['']">
              moves faster.
            </span>
          </h1>

          <p className="mx-auto mt-7 max-w-[570px] text-base leading-[1.6] text-[#526177] sm:text-lg lg:text-xl">
            Reach customers with bulk SMS and WhatsApp, organize every contact, and use AI to write clear campaigns in seconds.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
            <Link to={primaryHref} className={`${ctaBase} min-h-[55px] w-full px-[25px] text-[15px] sm:w-auto`}>
              {isAuthenticated ? "Open AI assistant" : "Start messaging"}
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link
              to={isAuthenticated ? "/chat" : "/login"}
              className="border-b border-[#0d1b2f]/35 text-sm font-bold leading-[1.8] transition-colors hover:border-[#174c83] hover:text-[#174c83]"
            >
              {isAuthenticated ? "Open AI assistant" : "I already have an account"}
            </Link>
          </div>

          <ul aria-label="Platform features" className="mt-8 flex flex-wrap justify-center gap-x-[22px] gap-y-[14px] p-0">
            {features.map(({ icon: Icon, label }) => (
              <li key={label} className="flex list-none items-center gap-2 text-xs text-[#526177]">
                <span className="grid size-[26px] place-items-center text-[#174c83]">
                  <Icon aria-hidden="true" className="size-[13px]" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </section>

        {/* Scroll-animated product preview */}
        <section
          aria-label="TINORA AI unified messaging preview"
          className="relative mx-auto w-[min(1240px,calc(100%-30px))] pb-24 pt-8 sm:w-[min(1240px,calc(100%-48px))] md:pt-14"
        >
          <div aria-hidden="true" className="absolute left-[12%] top-[10%] h-[70%] w-[76%] rounded-full bg-[#174c83]/20 blur-[58px]" />

          <div className="relative">
            <ScrollFrame>
              <div aria-hidden="true" className="bg-[#0e0e11] font-['Inter',sans-serif] text-[#e8e8ec]">
                {/* app bar */}
                <div className="flex h-12 items-center justify-between border-b border-white/[0.06] px-4">
                  <div className="flex items-center gap-4 text-xs font-semibold">
                    <PanelLeft className="size-4 text-white/70" /> Home
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden items-center gap-1.5 rounded border border-[#2c4a7c] px-2.5 py-1.5 text-[10px] text-[#5a9bf0] sm:inline-flex">
                      <Sparkles className="size-3" /> Free Plan
                    </span>
                    <span className="rounded bg-[#3b82d6] px-3 py-1.5 text-[10px] font-bold text-white">Bal: 101 SMS</span>
                    <span className="relative grid size-7 place-items-center rounded-full bg-[#3b82d6] text-white">
                      <Bell className="size-3.5" />
                      <i className="absolute -right-1 -top-1 rounded-full bg-[#e5484d] px-1 text-[7px] font-bold not-italic leading-[1.4]">9+</i>
                    </span>
                    <span className="grid size-7 place-items-center rounded-full bg-[#f97316] text-[10px] font-bold text-white">AA</span>
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  {/* status pills */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      <span className={pillClass}><CalendarDays /> 28 October 2026</span>
                      <span className={pillClass}><CircleCheck /> API Running</span>
                      <span className={`${pillClass} max-sm:hidden`}><Radio /> SMS Gateway On</span>
                      <span className={`${pillClass} max-md:hidden`}><Server /> Nodes 1</span>
                    </div>
                    <span className="hidden items-center gap-1.5 rounded bg-[#3b82d6] px-3 py-1.5 text-[10px] font-bold text-white sm:inline-flex">
                      <RefreshCw className="size-3" /> Refresh
                    </span>
                  </div>

                  {/* stat cards */}
                  <div className="grid gap-3 md:grid-cols-3">
                    {[
                      { icon: Boxes, label: "SMS Success", value: "25", note: "↗ 100.0%", noteClass: "text-[#22a06b]", badge: "Success", badgeClass: "border-[#1f6b4d] bg-[#0f2a20] text-[#22a06b]" },
                      { icon: Inbox, label: "Enqueued", value: "0", note: "Stable", noteClass: "text-white/50", badge: "Enqueued", badgeClass: "border-[#7a5412] bg-[#2a1f0c] text-[#e8a33d]" },
                    ].map(({ icon: Icon, label, value, note, noteClass, badge, badgeClass }) => (
                      <article key={label} className="relative min-h-[120px] overflow-hidden rounded-md border border-[#2c4a7c] bg-[#101014] p-4">
                        <div className="absolute -right-8 -top-8 size-24 rounded-full bg-white/[0.04]" />
                        <span className="relative grid size-8 place-items-center rounded-md bg-white/[0.06] text-white/80">
                          <Icon className="size-4" />
                        </span>
                        <p className="relative mt-3 text-[10px] text-white/50">{label}</p>
                        <div className="relative flex items-end justify-between">
                          <div className="flex items-baseline gap-2">
                            <strong className="text-2xl font-bold leading-none">{value}</strong>
                            <span className={`text-[9px] font-semibold ${noteClass}`}>{note}</span>
                          </div>
                          <span className={`rounded-full border px-2 py-0.5 text-[8px] font-semibold ${badgeClass}`}>{badge}</span>
                        </div>
                      </article>
                    ))}
                    <article className="relative min-h-[120px] overflow-hidden rounded-md border border-[#2c4a7c] bg-[#101014] p-4">
                      <div className="absolute -right-8 -top-8 size-24 rounded-full bg-white/[0.04]" />
                      <span className="relative grid size-8 place-items-center rounded-md bg-white/[0.06] text-white/80">
                        <Brush className="size-4" />
                      </span>
                      <p className="relative mt-3 text-[11px] font-bold">Total Sent SMS</p>
                      <p className="relative text-[9px] text-white/50">25 messages sent in the selected range</p>
                      <div className="relative mt-3 flex justify-end gap-2 text-[8px] font-semibold">
                        <span className="rounded-full border border-[#1f6b4d] bg-[#0f2a20] px-2 py-0.5 text-[#22a06b]">25 Successful</span>
                        <span className="rounded-full border border-[#7a1f2e] bg-[#2a0f16] px-2 py-0.5 text-[#e5484d]">0 Failed</span>
                      </div>
                    </article>
                  </div>

                  {/* chart + heatmap */}
                  <div className="grid gap-3 md:grid-cols-[1.7fr_1fr]">
                    <article className="rounded-md border border-[#6b5555]/70 bg-[#101014] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-[11px] font-bold">SMS Delivery Analytics</h3>
                          <p className="text-[9px] text-white/50">Delivered vs. failed messages over the last 7 days</p>
                        </div>
                        <div className="flex gap-3 text-[9px] text-white/60">
                          <span className="flex items-center gap-1.5"><i className="size-1.5 rounded-full bg-[#3b82d6]" /> Delivered</span>
                          <span className="flex items-center gap-1.5"><i className="size-1.5 rounded-full bg-[#e5484d]" /> Failed</span>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <div className="flex h-32 flex-col justify-between pb-0 text-right text-[8px] text-white/40 sm:h-40">
                          {[8, 6, 4, 2, 0].map((n) => <span key={n}>{n}</span>)}
                        </div>
                        <div className="flex-1">
                          <div className="relative flex h-32 items-end justify-around sm:h-40">
                            <div className="absolute inset-0 flex flex-col justify-between">
                              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="border-t border-dashed border-white/[0.07]" />)}
                            </div>
                            {chartDays.map((d) => (
                              <div key={d.label} className="relative flex h-full w-full items-end justify-center">
                                {d.value > 0 && (
                                  <div
                                    className="w-3 rounded-t-[2px] bg-gradient-to-b from-[#3b82d6] to-[#1c3f73] sm:w-4"
                                    style={{ height: `${(d.value / 8) * 100}%` }}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 flex justify-around text-[8px] text-white/40">
                            {chartDays.map((d) => <span key={d.label} className="w-full text-center">{d.label}</span>)}
                          </div>
                        </div>
                      </div>
                    </article>

                    <article className="rounded-md border border-[#2f6b57]/70 bg-[#101014] p-4">
                      <h3 className="text-[11px] font-bold">Track SMS Activity</h3>
                      <p className="text-[9px] text-white/50">Message sending activity over the last 12 weeks</p>
                      <div className="mt-4 grid grid-cols-12 gap-1">
                        {heatLevels.map((l, i) => (
                          <i key={i} className={`aspect-square rounded-[3px] ${heatColor[l]}`} />
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[8px] text-white/50">
                        <span>Less active</span>
                        <span className="flex gap-0.5">
                          {heatColor.map((c) => <i key={c} className={`size-1.5 ${c}`} />)}
                        </span>
                        <span>More active</span>
                      </div>
                    </article>
                  </div>
                </div>
              </div>
            </ScrollFrame>
          </div>
        </section>
      </main>

      <footer className="relative z-10 mx-auto flex min-h-[68px] w-[min(1240px,calc(100%-30px))] flex-col items-center justify-center gap-6 border-t border-[#0d1b2f]/[0.09] py-[22px] text-center text-[11px] text-[#738096] sm:w-[min(1240px,calc(100%-48px))] sm:flex-row sm:justify-between sm:py-0 sm:text-left">
        <p>© {new Date().getFullYear()} {BRAND_NAME}. Built for better customer conversations.</p>
        <nav aria-label="Legal links" className="flex gap-[18px]">
          <Link to="/terms" className="transition-colors hover:text-[#174c83]">Terms</Link>
          <Link to="/privacy" className="transition-colors hover:text-[#174c83]">Privacy</Link>
          <Link to="/account-deletion" className="transition-colors hover:text-[#174c83]">Account deletion</Link>
        </nav>
      </footer>
    </div>
  );
}