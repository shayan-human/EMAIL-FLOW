"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import {
  motion,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from "framer-motion";

import { Calendar, Code, FileText, User, Clock } from "lucide-react";
import { TestimonialsColumn, type Testimonial } from "@/components/ui/testimonials-column";
import RadialOrbitalTimeline from "@/components/ui/radial-orbital-timeline";
import HeroSection, { PageBackground, FullPageParticles } from "@/components/HeroSection";

const COLORS = {
  page: "#0f0f0f",
  card: "#141414",
  border: "#222222",
  accent: "#F59E0B",
  text: "#FFFFFF",
  muted: "#888888",
} as const;

const easeOut = [0.16, 1, 0.3, 1] as const;
const easeInOut = [0.42, 0, 0.58, 1] as const;

const revealTransition = { duration: 0.6, ease: easeOut } as const;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function useCountUp(params: {
  value: number;
  enabled: boolean;
  durationMs?: number;
  decimals?: number;
}) {
  const { value, enabled, durationMs = 2000, decimals = 0 } = params;
  const [current, setCurrent] = React.useState(0);

  React.useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = easeOutCubic(t);
      const next = value * eased;
      const pow = Math.pow(10, decimals);
      setCurrent(Math.round(next * pow) / pow);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [decimals, durationMs, enabled, value]);

  return current;
}

function Container(props: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={"mx-auto w-full max-w-6xl px-12 " + (props.className ?? "")} style={props.style}>
      {props.children}
    </div>
  );
}

function Reveal(props: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ ...revealTransition, delay: props.delay ?? 0 }}
      className={props.className}
    >
      {props.children}
    </motion.div>
  );
}

function RevealY(props: { children: React.ReactNode; className?: string; y?: number; delay?: number }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });
  const y = props.y ?? 60;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ ...revealTransition, delay: props.delay ?? 0 }}
      className={props.className}
    >
      {props.children}
    </motion.div>
  );
}

function Card(props: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={
        inView
          ? {
              opacity: 1,
              y: 0,
              transition: revealTransition,
            }
          : undefined
      }
      transition={{ duration: 0.2, ease: easeOut }}
      whileHover={{ y: -6, boxShadow: "0 20px 40px rgba(245, 158, 11, 0.08)" }}
      className={"rounded-[12px] border " + (props.className ?? "")}
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
    >
      {props.children}
    </motion.div>
  );
}

function LogoMark(props: { size?: number }) {
  const s = props.size ?? 32;
  return (
    <div
      className="grid place-items-center rounded-[10px] font-bold"
      style={{ width: s, height: s, backgroundColor: COLORS.accent, color: COLORS.page }}
    >
      E
    </div>
  );
}

function SepDot() {
  return (
    <span
      aria-hidden
      className="mx-2 inline-block h-1 w-1 rounded-full align-middle"
      style={{ backgroundColor: COLORS.border }}
    />
  );
}

function NavIcon(props: { d: string; active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d={props.d}
        stroke={props.active ? COLORS.accent : COLORS.muted}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NoiseOverlay() {
  const noiseSvg =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ backgroundImage: `url(${noiseSvg})`, opacity: 0.03, mixBlendMode: "overlay" }}
    />
  );
}

function IconLink() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0 0-7.07 5 5 0 0 0-7.07 0L10.7 5.22"
        stroke={COLORS.accent}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.07 0L5.52 12.41a5 5 0 0 0 0 7.07 5 5 0 0 0 7.07 0l.71-.71"
        stroke={COLORS.accent}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconZap() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M13 2L3 14h7l-1 8 12-14h-7l1-6Z"
        stroke={COLORS.accent}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconInbox() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 4h16v12l-3 4H7l-3-4V4Z"
        stroke={COLORS.accent}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M4 16h5l1 2h4l1-2h5"
        stroke={COLORS.accent}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarRow() {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill={COLORS.accent} xmlns="http://www.w3.org/2000/svg">
          <path d="M12 17.3 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.3Z" />
        </svg>
      ))}
    </div>
  );
}

function TrustIconLock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 11V8a5 5 0 0 1 10 0v3" stroke={COLORS.muted} strokeWidth="2" strokeLinecap="round" />
      <path d="M6 11h12v10H6V11Z" stroke={COLORS.muted} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function TrustIconGmail() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 7l8 6 8-6" stroke={COLORS.muted} strokeWidth="2" strokeLinejoin="round" />
      <path d="M4 7v10h16V7" stroke={COLORS.muted} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function TrustIconClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" stroke={COLORS.muted} strokeWidth="2" />
      <path d="M12 6v6l4 2" stroke={COLORS.muted} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function FeatureIcon(props: { path: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d={props.path} stroke={COLORS.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function LandingPage() {
  const reducedMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const [navSolid, setNavSolid] = React.useState(false);
  const { resolvedTheme } = useTheme();
  const isLightMode = resolvedTheme === 'light';

  useMotionValueEvent(scrollY, "change", (latest) => {
    setNavSolid(latest > 60);
  });

  const headlineParent = React.useMemo(
    () => ({
      hidden: {},
      show: { transition: { staggerChildren: 0.12 } },
    }),
    []
  );
  const headlineWord = React.useMemo(
    () => ({
      hidden: { opacity: 0, y: 40 },
      show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: easeOut } },
    }),
    []
  );

  const headlineTokens = [
    "Run",
    "Every",
    "Client",
    "Campaign.",
    "One",
    "Dashboard.",
    "Zero",
    "Chaos.",
  ];

  const testimonials = [
    {
      text: "We run campaigns for 6 clients simultaneously. EmailFlow is the only tool where I don't lose track of which reply belongs to which client. The unified inbox is a game changer.",
      image: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&h=100&fit=crop&crop=faces",
      name: "Jordan M.",
      role: "Founder",
      company: "LeadLayer Agency",
    },
    {
      text: "Onboarding a new client used to mean setting up a whole new tool stack. Now it's just OAuth and go. We cut our setup time from 2 hours to 10 minutes.",
      image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&h=100&fit=crop&crop=faces",
      name: "Priya S.",
      role: "Operations Lead",
      company: "ScaleReach",
    },
    {
      text: "Our clients keep asking how we get 18%+ reply rates. The answer is simple sequences, real Gmail accounts, and EmailFlow keeping everything organized.",
      image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=faces",
      name: "Marcus T.",
      role: "CEO",
      company: "OutboundOS",
    },
    {
      text: "The unified inbox alone saved us 4 hours a week. We can now manage all client replies from one place without switching tabs.",
      image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&h=100&fit=crop&crop=faces",
      name: "Sarah K.",
      role: "Director",
      company: "OutreachPros",
    },
    {
      text: "Finally, a tool that understands how agencies work. Connecting 15 client accounts took less than 10 minutes.",
      image: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&h=100&fit=crop&crop=faces",
      name: "David R.",
      role: "CEO",
      company: "GrowthStack",
    },
    {
      text: "Reply tracking is the difference. When a client asks where replies came from, we can answer instantly by campaign and account.",
      image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=faces",
      name: "Alex T.",
      role: "Head of Sales",
      company: "PipelinePro",
    },
    {
      text: "Our clients love the reporting. We can show them exactly what's working and close more deals based on real data.",
      image: "https://images.unsplash.com/photo-1598550874175-4d0ef436c909?w=100&h=100&fit=crop&crop=faces",
      name: "Michelle L.",
      role: "Agency Owner",
      company: "ConvertWise",
    },
    {
      text: "Zero suspension risk with the official Gmail API. We sleep better at night knowing our client accounts are safe.",
      image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces",
      name: "Chris P.",
      role: "Managing Partner",
      company: "B2B Force",
    },
    {
      text: "Campaign setup is blazing fast. We launched 3 new client campaigns this week alone without any headaches.",
      image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=faces",
      name: "Emma R.",
      role: "Growth Manager",
      company: "ScaleLab",
    },
  ];

  const timelineData = [
    {
      id: 1,
      title: "Connect",
      date: "Step 1",
      content: "Connect your clients' Gmail accounts via secure Google OAuth in one click. No passwords stored, no risk.",
      category: "Connect",
      icon: User,
      relatedIds: [2],
      status: "completed" as const,
      energy: 100,
    },
    {
      id: 2,
      title: "Launch",
      date: "Step 2",
      content: "Build personalized campaigns with variables like first name and business name. Schedule and trigger in real time.",
      category: "Launch",
      icon: Calendar,
      relatedIds: [1, 3],
      status: "completed" as const,
      energy: 90,
    },
    {
      id: 3,
      title: "Track",
      date: "Step 3",
      content: "Monitor every reply across all client accounts in a unified threaded inbox. No tab-switching ever again.",
      category: "Track",
      icon: Clock,
      relatedIds: [2, 4],
      status: "in-progress" as const,
      energy: 60,
    },
    {
      id: 4,
      title: "Report",
      date: "Step 4",
      content: "Generate client-ready reports showing sends, replies, and campaign performance across all accounts.",
      category: "Report",
      icon: FileText,
      relatedIds: [3],
      status: "pending" as const,
      energy: 30,
    },
  ];

  // Social proof counters
  const socialRef = React.useRef<HTMLDivElement | null>(null);
  const socialInView = useInView(socialRef, { once: true, amount: 0.15 });
  const delivered = useCountUp({ value: 24892, enabled: socialInView, durationMs: 2000, decimals: 0 });
  const avgReply = useCountUp({ value: 18.5, enabled: socialInView, durationMs: 2000, decimals: 1 });
  const industry = useCountUp({ value: 8, enabled: socialInView, durationMs: 2000, decimals: 0 });
  const compliant = useCountUp({ value: 100, enabled: socialInView, durationMs: 2000, decimals: 0 });

  return (
    <div className="min-h-screen font-sans relative" style={{ backgroundColor: COLORS.page, color: COLORS.text }}>
      <PageBackground />
      <FullPageParticles />
      {/* SECTION 1: NAVBAR */}
      <motion.nav
        initial={false}
        animate={{
          backgroundColor: navSolid ? COLORS.page : "rgba(15,15,15,0)",
          borderColor: navSolid ? COLORS.border : "rgba(34,34,34,0)",
        }}
        transition={{ duration: 0.25, ease: easeOut }}
        className="sticky top-0 z-50 border-b backdrop-blur"
        style={{ height: 72 }}
      >
        <div className="flex h-full w-full items-center justify-between px-12">
          <div className="flex items-center gap-3">
            <Link href="/">
              <div className={isLightMode ? "rounded-lg p-1.5 bg-white" : ""}>
                <Image 
                  src="/email_flow_logo.png" 
                  alt="Email Flow" 
                  height={40} 
                  width={120}
                  style={{ width: 'auto', height: 40 }}
                />
              </div>
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm" style={{ color: COLORS.muted }}>
            <motion.a href="#features" whileHover={{ color: COLORS.text }} transition={{ duration: 0.18, ease: easeOut }}>
              Features
            </motion.a>
            <motion.a href="#how" whileHover={{ color: COLORS.text }} transition={{ duration: 0.18, ease: easeOut }}>
              How It Works
            </motion.a>
            <motion.a href="#about" whileHover={{ color: COLORS.text }} transition={{ duration: 0.18, ease: easeOut }}>
              About
            </motion.a>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/auth/signin"
              className="inline-flex items-center justify-center rounded-[10px] border px-4 py-2 text-sm font-semibold"
              style={{ borderColor: COLORS.border, color: COLORS.text, backgroundColor: "transparent" }}
            >
              Sign In
            </Link>
            <Link
              href="/auth/signin"
              className="inline-flex items-center justify-center rounded-[10px] px-4 py-2 text-sm font-semibold"
              style={{ backgroundColor: COLORS.accent, color: COLORS.page }}
            >
              Get Started
            </Link>
          </div>
        </div>
      </motion.nav>

      {/* SECTION 2: HERO */}
      <HeroSection />

      {/* SECTION 3: SOCIAL PROOF BAR */}
      <section className="py-[100px]">
        <div className="w-full border-y" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, paddingTop: 28, paddingBottom: 28 }}>
          <div ref={socialRef} className="mx-auto w-full max-w-6xl px-12">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:flex lg:items-center lg:justify-center lg:gap-12">
            {[
              {
                value: socialInView ? `${Math.round(delivered).toLocaleString("en-US")}+` : "0+",
                label: "Emails Delivered",
              },
              {
                value: socialInView ? `${avgReply.toFixed(1)}%` : "0.0%",
                label: "Average Reply Rate",
              },
              {
                value: socialInView ? `${industry.toFixed(0)}%` : "0%",
                label: "Industry Average",
                badge: "we 2x this",
              },
              {
                value: socialInView ? `${compliant.toFixed(0)}%` : "0%",
                label: "Gmail API Compliant",
              },
            ].map((x, idx) => (
              <Reveal key={x.label} delay={idx * 0.06} className="text-center md:text-left">
                <div className="text-3xl font-bold" style={{ color: COLORS.accent }}>
                  {x.value}
                </div>
                <div className="mt-1 text-sm" style={{ color: COLORS.muted }}>
                  <span>{x.label}</span>
                  {x.badge ? (
                    <span
                      className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]"
                      style={{ borderColor: COLORS.border, color: COLORS.muted, backgroundColor: COLORS.page }}
                    >
                      {x.badge}
                    </span>
                  ) : null}
                </div>
              </Reveal>
            ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: HOW IT WORKS */}
      <section id="how" className="py-[100px]">
        <Container>
          <div className="text-center">
            <Reveal>
              <div className="text-xs font-semibold tracking-[0.28em]" style={{ color: COLORS.accent }}>
                THE PROCESS
              </div>
            </Reveal>
            <Reveal delay={0.04}>
              <div className="mt-4 text-[32px] md:text-[40px] font-semibold" style={{ color: COLORS.text }}>
                Agency-ready in three steps.
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <div className="mx-auto mt-4 max-w-[520px] text-sm md:text-base" style={{ color: COLORS.muted }}>
                From connecting your first client account to reporting results - EmailFlow fits into your agency workflow in minutes.
              </div>
            </Reveal>
          </div>

          <div className="mt-14 flex flex-col items-stretch gap-6 md:flex-row md:items-stretch md:gap-6">
            {[
              {
                step: "01",
                icon: <IconLink />,
                title: "Connect",
                desc: "Connect your clients' Gmail accounts via secure Google OAuth in one click. No passwords stored, no risk.",
              },
              {
                step: "02",
                icon: <IconZap />,
                title: "Launch",
                desc: "Build personalized campaigns with variables like first name and business name. Schedule and trigger in real time.",
              },
              {
                step: "03",
                icon: <IconInbox />,
                title: "Track",
                desc: "Monitor every reply across all client accounts in a unified threaded inbox. No tab-switching ever again.",
              },
            ].map((s, idx) => (
              <React.Fragment key={s.step}>
                <Card className="flex-1 p-8">
                  <div className="text-[48px] font-bold leading-none" style={{ color: COLORS.accent }}>
                    {s.step}
                  </div>
                  <div className="mt-5">{s.icon}</div>
                  <div className="mt-5 text-[20px] font-bold">{s.title}</div>
                  <div className="mt-3 text-[15px]" style={{ color: COLORS.muted }}>
                    {s.desc}
                  </div>
                </Card>
                {idx !== 2 ? (
                  <div className="hidden md:flex items-center justify-center" aria-hidden>
                    <div className="w-16 border-t border-dashed" style={{ borderColor: COLORS.accent, opacity: 0.7 }} />
                  </div>
                ) : null}
              </React.Fragment>
            ))}
          </div>
        </Container>
      </section>

      {/* SECTION 5: PRODUCT DEMO MOCKUP */}
      <section id="about" className="py-[100px]">
        <Container>
          <div className="text-center">
            <Reveal>
              <div className="text-xs font-semibold tracking-[0.28em]" style={{ color: COLORS.accent }}>
                THE PLATFORM
              </div>
            </Reveal>
            <Reveal delay={0.04}>
              <div className="mt-4 text-[32px] md:text-[40px] font-semibold">Your agency&apos;s command center.</div>
            </Reveal>
            <Reveal delay={0.08}>
              <div className="mx-auto mt-4 max-w-[720px] text-sm md:text-base" style={{ color: COLORS.muted }}>
                Every client. Every campaign. Every reply. All in one place.
              </div>
            </Reveal>
          </div>

          <RevealY className="mt-14" y={60}>
            <div className="relative">
              <div
                aria-hidden
                className="absolute -bottom-10 left-1/2 h-40 w-[70%] -translate-x-1/2 rounded-full blur-[60px]"
                style={{ background: "radial-gradient(circle, rgba(245,158,11,0.18) 0%, rgba(245,158,11,0) 70%)" }}
              />

              <div className="relative overflow-hidden rounded-[12px] border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                {/* Browser bar */}
                <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: COLORS.border, backgroundColor: "#101010" }}>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full border" style={{ borderColor: COLORS.border, backgroundColor: COLORS.page }} />
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS.accent }} />
                    <div className="h-3 w-3 rounded-full border" style={{ borderColor: COLORS.border, backgroundColor: COLORS.page }} />
                  </div>
                  <div
                    className="mx-auto w-[min(520px,70%)] rounded-full border px-4 py-1.5 text-xs"
                    style={{ borderColor: COLORS.border, color: COLORS.muted, backgroundColor: COLORS.page }}
                  >
                    app.emailflow.io/campaigns
                  </div>
                </div>

                <div className="grid min-h-[420px] grid-cols-12">
                  {/* Sidebar */}
                  <div className="col-span-3 border-r p-4" style={{ borderColor: COLORS.border, backgroundColor: COLORS.page }}>
                    <div className="grid gap-2">
                      {[
                        { label: "Dashboard", active: false, d: "M4 13h7V4H4v9Zm9 7h7V11h-7v9ZM4 20h7v-5H4v5Zm9-7h7V4h-7v9Z" },
                        { label: "Campaigns", active: true, d: "M4 6h16M4 12h10M4 18h16" },
                        { label: "Inbox", active: false, d: "M4 4h16v12l-3 4H7l-3-4V4Zm0 12h5l1 2h4l1-2h5" },
                        { label: "Accounts", active: false, d: "M16 11V8a4 4 0 0 0-8 0v3M6 11h12v9H6v-9Z" },
                        { label: "Settings", active: false, d: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3a7.8 7.8 0 0 0-.1-1l2-1.5-2-3.5-2.3 1a7.9 7.9 0 0 0-1.7-1L13.7 2h-3.4L9.1 5a7.9 7.9 0 0 0-1.7 1L5.1 5l-2 3.5 2 1.5a7.8 7.8 0 0 0 0 2l-2 1.5 2 3.5 2.3-1c.5.4 1.1.8 1.7 1l1.2 3h3.4l1.2-3c.6-.2 1.2-.6 1.7-1l2.3 1 2-3.5-2-1.5c.1-.3.1-.7.1-1Z" },
                      ].map((x) => (
                        <div
                          key={x.label}
                          className="flex items-center gap-3 rounded-[12px] border px-3 py-2"
                          style={{
                            borderColor: x.active ? COLORS.accent : COLORS.border,
                            backgroundColor: x.active ? "rgba(245,158,11,0.08)" : "transparent",
                            color: x.active ? COLORS.text : COLORS.muted,
                          }}
                        >
                          <NavIcon d={x.d} active={x.active} />
                          <div className="text-sm font-semibold">{x.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Main */}
                  <div className="col-span-9 p-5">
                    <div className="grid gap-3 md:grid-cols-3">
                      {[
                        { label: "Emails Sent", value: "24,892" },
                        { label: "Total Replies", value: "4,612" },
                        { label: "Active Campaigns", value: "7" },
                      ].map((s) => (
                        <div
                          key={s.label}
                          className="rounded-[12px] border p-4"
                          style={{ borderColor: COLORS.border, backgroundColor: COLORS.card }}
                        >
                          <div className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: COLORS.muted }}>
                            {s.label}
                          </div>
                          <div className="mt-2 text-2xl font-bold" style={{ color: COLORS.accent }}>
                            {s.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6">
                      <div className="text-sm font-semibold">Campaign Performance</div>
                      <div className="mt-3 overflow-hidden rounded-[12px] border" style={{ borderColor: COLORS.border }}>
                        <div className="grid grid-cols-5 gap-3 px-4 py-3 text-[11px] font-semibold" style={{ color: COLORS.muted, backgroundColor: COLORS.page }}>
                          <div>Campaign Name</div>
                          <div>Gmail Account</div>
                          <div>Emails Sent</div>
                          <div>Replies</div>
                          <div>Status</div>
                        </div>
                        {[
                          { name: "Acme Corp Outreach", acct: "@acme.co", sent: "6,140", replies: "482", status: "Active" },
                          { name: "LeadLayer Q1", acct: "@leadlayer.io", sent: "4,920", replies: "301", status: "Paused" },
                          { name: "SaaS Founders List", acct: "@founders.co", sent: "3,210", replies: "198", status: "Completed" },
                          { name: "Roofing Leads March", acct: "@roofing.pro", sent: "2,680", replies: "167", status: "Active" },
                          { name: "Agency Partners", acct: "@partners.io", sent: "7,942", replies: "1,104", status: "Active" },
                        ].map((r, idx) => {
                          const bg = idx % 2 === 0 ? COLORS.card : "#1a1a1a";
                          const statusStyle =
                            r.status === "Active"
                              ? { backgroundColor: "rgba(245,158,11,0.10)", color: COLORS.text, borderColor: "rgba(245,158,11,0.25)" }
                              : r.status === "Paused"
                                ? { backgroundColor: "rgba(136,136,136,0.10)", color: COLORS.muted, borderColor: COLORS.border }
                                : { backgroundColor: "rgba(245,158,11,0.10)", color: COLORS.accent, borderColor: "rgba(245,158,11,0.25)" };

                          return (
                            <div
                              key={r.name}
                              className="grid grid-cols-5 gap-3 px-4 py-3 text-sm"
                              style={{ backgroundColor: bg, borderTop: `1px solid ${COLORS.border}` }}
                            >
                              <div className="truncate font-medium">{r.name}</div>
                              <div className="truncate" style={{ color: COLORS.muted }}>
                                {r.acct}
                              </div>
                              <div style={{ color: COLORS.muted }}>{r.sent}</div>
                              <div style={{ color: COLORS.accent, fontWeight: 700 }}>{r.replies}</div>
                              <div>
                                <span
                                  className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                                  style={statusStyle}
                                >
                                  {r.status}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </RevealY>
        </Container>
      </section>

      {/* SECTION 6: FEATURES GRID */}
      <section id="features" className="py-[100px]">
        <Container>
          <div>
            <Reveal>
              <div className="text-xs font-semibold tracking-[0.28em]" style={{ color: COLORS.accent }}>
                FEATURES
              </div>
            </Reveal>
            <Reveal delay={0.04}>
              <div className="mt-4 text-[32px] md:text-[40px] font-semibold">Everything your agency needs.</div>
            </Reveal>
            <Reveal delay={0.08}>
              <div className="mt-4 max-w-[720px] text-sm md:text-base" style={{ color: COLORS.muted }}>
                No extra tools. No duct tape. EmailFlow is purpose-built for agency-scale outreach.
              </div>
            </Reveal>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Multi-Account Gmail OAuth",
                desc: "Connect unlimited client Gmail accounts with one-click secure Google authorization.",
                icon: <FeatureIcon path="M16 11V7a4 4 0 0 0-8 0v4M6 11h12v9H6v-9Z" />,
              },
              {
                title: "Campaign Builder",
                desc: "Build personalized email sequences with slash-command variables for any client list.",
                icon: <FeatureIcon path="M4 6h16M4 12h10M4 18h16" />,
              },
              {
                title: "Unified Inbox",
                desc: "All client replies land in one threaded inbox organized by campaign and account.",
                icon: <FeatureIcon path="M4 4h16v12l-3 4H7l-3-4V4Zm0 12h5l1 2h4l1-2h5" />,
              },
              {
                title: "Reply Tracking",
                desc: "See exactly who replied, from which campaign, and on which Gmail account, in real time.",
                icon: <FeatureIcon path="M21 12a9 9 0 1 1-3-6.7M21 4v6h-6" />,
              },
              {
                title: "Official Google Compliance",
                desc: "Built exclusively on the Gmail API. No scraping, no third-party SMTP tricks, zero suspension risk.",
                icon: <FeatureIcon path="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4Z" />,
              },
              {
                title: "Real-Time Analytics",
                desc: "Track sends and replies per campaign and per account with live-updating stats.",
                icon: <FeatureIcon path="M4 19V5M8 17v-6m4 6V7m4 10v-4m4 4V9" />,
              },
            ].map((f) => (
              <Card key={f.title} className="p-7">
                <div className="grid h-10 w-10 place-items-center rounded-[12px] border" style={{ borderColor: COLORS.border, backgroundColor: COLORS.page }}>
                  {f.icon}
                </div>
                <div className="mt-5 text-[17px] font-bold">{f.title}</div>
                <div className="mt-2 text-[14px]" style={{ color: COLORS.muted }}>
                  {f.desc}
                </div>
              </Card>
            ))}
          </div>

          <Reveal delay={0.12}>
            <div className="mt-16">
              <div className="text-center mb-8">
                <div className="text-sm font-semibold" style={{ color: COLORS.accent }}>
                  See how it works
                </div>
                <div className="text-lg font-bold mt-2" style={{ color: COLORS.text }}>
                  Click any step to explore
                </div>
              </div>
              <RadialOrbitalTimeline timelineData={timelineData} />
            </div>
          </Reveal>
        </Container>
      </section>

      {/* SECTION 7: TESTIMONIALS */}
      <section className="py-[100px] relative" style={{ backgroundColor: COLORS.page }}>
        <div className="container mx-auto px-4 z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: easeOut }}
            viewport={{ once: true }}
            className="flex flex-col items-center justify-center max-w-[540px] mx-auto"
          >
            <div className="flex justify-center">
              <div
                className="text-xs font-semibold tracking-[0.28em] px-4 py-1 rounded-lg border"
                style={{ borderColor: COLORS.accent, color: COLORS.accent, backgroundColor: "rgba(245,158,11,0.08)" }}
              >
                SOCIAL PROOF
              </div>
            </div>

            <h2 className="text-[32px] md:text-[40px] font-bold mt-5 text-center" style={{ color: COLORS.text }}>
              Agencies ship more with EmailFlow.
            </h2>
            <p className="text-center mt-4" style={{ color: COLORS.muted }}>
              See what agency owners are saying about us.
            </p>
          </motion.div>

          <div
            className="flex justify-center gap-6 mt-10 overflow-hidden"
            style={{ maskImage: "linear-gradient(to bottom,transparent,black_25%,black_75%,transparent)" }}
          >
            <TestimonialsColumn
              testimonials={testimonials.slice(0, 3) as Testimonial[]}
              duration={15}
            />
            <TestimonialsColumn
              testimonials={testimonials.slice(3, 6) as Testimonial[]}
              className="hidden md:block"
              duration={19}
            />
            <TestimonialsColumn
              testimonials={testimonials.slice(6, 9) as Testimonial[]}
              className="hidden lg:block"
              duration={17}
            />
          </div>
        </div>
      </section>

      {/* SECTION 8: FINAL CTA */}
      <section className="py-[100px]">
        <div
          className="w-full"
          style={{
            background:
              "radial-gradient(circle at 50% 30%, rgba(245,158,11,0.05) 0%, rgba(15,15,15,0) 60%)",
          }}
        >
          <Container>
            <div className="mx-auto max-w-3xl text-center">
              <Reveal>
                <div className="text-[36px] md:text-[48px] font-bold leading-tight">Ready to scale your agency&apos;s outreach?</div>
              </Reveal>
              <Reveal delay={0.04}>
                <div className="mt-4 text-sm md:text-base" style={{ color: COLORS.muted }}>
                  Connect your first client account in 2 minutes. No credit card required.
                </div>
              </Reveal>

              <Reveal delay={0.08}>
                <div className="mt-8 flex items-center justify-center">
                  <Link
                    href="/auth/signin"
                    className="relative inline-flex items-center justify-center rounded-[12px] px-10 py-4 text-base font-semibold"
                    style={{ backgroundColor: COLORS.accent, color: COLORS.page }}
                  >
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 rounded-[12px]"
                      style={{ border: "1px solid rgba(245,158,11,0.55)" }}
                      animate={reducedMotion ? undefined : { scale: [1, 1.4], opacity: [0.4, 0] }}
                      transition={
                        reducedMotion
                          ? undefined
                          : { duration: 1.1, ease: easeOut, repeat: Infinity, repeatDelay: 1.9 }
                      }
                    />
                    Get Started Free
                  </Link>
                </div>
              </Reveal>

              <Reveal delay={0.12}>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs" style={{ color: COLORS.muted }}>
                  <span className="inline-flex items-center gap-2">
                    <TrustIconLock /> Secure OAuth
                  </span>
                  <SepDot />
                  <span className="inline-flex items-center gap-2">
                    <TrustIconGmail /> Official Gmail API
                  </span>
                  <SepDot />
                  <span className="inline-flex items-center gap-2">
                    <TrustIconClock /> 2 min setup
                  </span>
                </div>
              </Reveal>
            </div>
          </Container>
        </div>
      </section>

      {/* SECTION 9: FOOTER */}
      <footer className="border-t py-10" style={{ borderColor: COLORS.border }}>
        <div className="mx-auto w-full max-w-6xl px-12">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-3" style={{ color: COLORS.muted }}>
              <div className={isLightMode ? "rounded-lg p-1 bg-white" : ""}>
                <Image 
                  src="/email_flow_logo.png" 
                  alt="Email Flow" 
                  height={32} 
                  width={96}
                  style={{ width: 'auto', height: 32, opacity: 0.8 }}
                />
              </div>
              <div className="text-sm">© 2025 EmailFlow</div>
            </div>
            <div className="flex items-center gap-6 text-sm" style={{ color: COLORS.muted }}>
              <motion.a href="#" whileHover={{ color: COLORS.text }} transition={{ duration: 0.18, ease: easeOut }}>
                Privacy
              </motion.a>
              <motion.a href="#" whileHover={{ color: COLORS.text }} transition={{ duration: 0.18, ease: easeOut }}>
                Terms
              </motion.a>
              <motion.a href="#" whileHover={{ color: COLORS.text }} transition={{ duration: 0.18, ease: easeOut }}>
                Twitter
              </motion.a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
