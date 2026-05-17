"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, ChevronRight, Play } from "lucide-react";

const COLORS = {
  page: "#0a0a0f",
  glassBg: "rgba(255,255,255,0.04)",
  glassBorder: "rgba(245,158,11,0.15)",
  primary: "#F59E0B",
  secondary: "#FBBF24",
  text: "#F8FAFC",
  muted: "#94A3B8",
  green: "#22C55E",
};

const easeOut = [0.16, 1, 0.3, 1] as const;

function AnimatedGrid() {
  return (
    <div 
      className="absolute inset-0 pointer-events-none opacity-[0.06]"
      style={{
        backgroundImage: `
          linear-gradient(${COLORS.primary} 1px, transparent 1px),
          linear-gradient(90deg, ${COLORS.primary} 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        animation: 'gridDrift 20s linear infinite',
      }}
    >
      <style jsx>{`
        @keyframes gridDrift {
          0% { transform: translateY(0); }
          100% { transform: translateY(60px); }
        }
      `}</style>
    </div>
  );
}

export function PageBackground() {
  return (
    <>
      <div 
        className="fixed inset-0 pointer-events-none opacity-40"
        style={{
          background: 'radial-gradient(ellipse at 30% 20%, rgba(245,158,11,0.15) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(245,158,11,0.1) 0%, transparent 50%)',
        }}
      />
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.06]"
        style={{
          backgroundImage: `
            linear-gradient(${COLORS.primary} 1px, transparent 1px),
            linear-gradient(90deg, ${COLORS.primary} 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          animation: 'gridDrift 20s linear infinite',
        }}
      >
        <style jsx>{`
          @keyframes gridDrift {
            0% { transform: translateY(0); }
            100% { transform: translateY(60px); }
          }
        `}</style>
      </div>
    </>
  );
}

export function FullPageParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId: number;

    const updateCanvas = () => {
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
    };
    updateCanvas();
    window.addEventListener('resize', updateCanvas);

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      opacity: number;
    }> = [];

    const particleCount = 25;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: 0.2 + Math.random() * 0.4,
        vy: -0.1 + Math.random() * 0.3,
        radius: 1 + Math.random() * 1.5,
        opacity: 0.2 + Math.random() * 0.3,
      });
    }

    const animate = () => {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x > window.innerWidth + 20) {
          p.x = -10;
          p.y = Math.random() * window.innerHeight;
        }
        if (p.y < -20) {
          p.y = window.innerHeight + 10;
          p.x = Math.random() * window.innerWidth;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 2);
        gradient.addColorStop(0, `rgba(245, 158, 11, ${p.opacity})`);
        gradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fill();
      });

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateCanvas);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[5]"
    />
  );
}

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      if (window.innerWidth >= 768) {
        setDimensions({ width: window.innerWidth / 2, height: window.innerHeight });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (dimensions.width === 0 || typeof window === 'undefined') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      opacity: number;
      trail: Array<{ x: number; y: number; opacity: number }>;
    }> = [];

    const particleCount = 35;
    const cardCenterX = dimensions.width * 0.5;
    const cardCenterY = dimensions.height * 0.5;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * dimensions.width,
        y: Math.random() * dimensions.height,
        vx: 0.8 + Math.random() * 1.2,
        vy: -0.3 + Math.random() * 0.6,
        radius: 1.5 + Math.random() * 1.5,
        opacity: 0.4 + Math.random() * 0.4,
        trail: [],
      });
    }

    let rafId: number;
    const startTime = Date.now();

    const animate = () => {
      if (!ctx || !canvas) return;
      const elapsed = Date.now() - startTime;
      
      if (elapsed < 400) {
        rafId = requestAnimationFrame(animate);
        return;
      }

      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      particles.forEach((p) => {
        p.trail.unshift({ x: p.x, y: p.y, opacity: p.opacity });
        if (p.trail.length > 8) p.trail.pop();

        const dx = cardCenterX - p.x;
        const dy = cardCenterY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 150) {
          const absorbFactor = 1 - dist / 150;
          p.opacity *= 0.95;
          p.vx += (dx / dist) * absorbFactor * 0.1;
          p.vy += (dy / dist) * absorbFactor * 0.1;
        }

        p.x += p.vx;
        p.y += p.vy;

        if (p.x > dimensions.width + 20) {
          p.x = -10;
          p.y = Math.random() * dimensions.height;
          p.opacity = 0.4 + Math.random() * 0.4;
          p.vx = 0.8 + Math.random() * 1.2;
        }

        p.trail.forEach((t, i) => {
          const trailOpacity = t.opacity * (1 - i / p.trail.length) * 0.3;
          ctx.beginPath();
          ctx.arc(t.x, t.y, p.radius * (1 - i / p.trail.length * 0.5), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(245, 158, 11, ${trailOpacity})`;
          ctx.fill();
        });

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3);
        gradient.addColorStop(0, `rgba(245, 158, 11, ${p.opacity})`);
        gradient.addColorStop(0.5, `rgba(245, 158, 11, ${p.opacity * 0.5})`);
        gradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fill();
      });

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [dimensions]);

  if (typeof window !== 'undefined' && window.innerWidth < 768) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-20"
      style={{ width: dimensions.width, height: dimensions.height }}
    />
  );
}

function GlassDashboardCard() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: easeOut, delay: 0.2 }}
      className="relative z-10"
    >
      <div className="absolute -inset-8 rounded-3xl bg-gradient-to-br from-amber-500/20 to-yellow-500/10 blur-2xl" />
      
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3, ease: "easeInOut", repeat: Infinity }}
        className="relative rounded-2xl border overflow-hidden"
        style={{
          backgroundColor: COLORS.glassBg,
          borderColor: COLORS.glassBorder,
          backdropFilter: 'blur(20px)',
          boxShadow: `0 0 60px rgba(245, 158, 11, 0.15), 0 25px 50px rgba(0, 0, 0, 0.5)`,
        }}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: COLORS.glassBorder }}>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-white">Campaigns</span>
            <span 
              className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)', color: COLORS.green }}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: COLORS.green }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: COLORS.green }} />
              </span>
              Live
            </span>
          </div>
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-all hover:scale-105"
            style={{ backgroundColor: COLORS.primary, color: '#000' }}
          >
            + New
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 p-4">
          {[
            { label: "Sent", value: "24,892", color: COLORS.primary },
            { label: "Replies", value: "4,612", color: COLORS.secondary },
            { label: "Active", value: "7", color: COLORS.green },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border p-3 text-center"
              style={{ 
                backgroundColor: 'rgba(255,255,255,0.02)', 
                borderColor: COLORS.glassBorder 
              }}
            >
              <div className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
              <div className="text-xs" style={{ color: COLORS.muted }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="border-t px-4 pb-3" style={{ borderColor: COLORS.glassBorder }}>
          <div className="grid grid-cols-4 gap-2 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: COLORS.muted }}>
            <div>Campaign</div>
            <div>Account</div>
            <div>Sent</div>
            <div>Replies</div>
          </div>
          {[
            { name: "Acme Corp", acct: "@acme.co", sent: "6,140", replies: "482", status: "active" },
            { name: "LeadLayer", acct: "@leadlayer.io", sent: "4,920", replies: "301", status: "active" },
            { name: "SaaS Founders", acct: "@founders.co", sent: "3,210", replies: "198", status: "paused" },
          ].map((row, idx) => (
            <div
              key={row.name}
              className="grid grid-cols-4 gap-2 py-2.5 text-sm items-center"
              style={{ 
                backgroundColor: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' 
              }}
            >
              <div className="font-medium text-white truncate">{row.name}</div>
              <div className="truncate text-xs" style={{ color: COLORS.muted }}>{row.acct}</div>
              <div className="text-xs" style={{ color: COLORS.muted }}>{row.sent}</div>
              <div className="font-semibold" style={{ color: row.status === 'active' ? COLORS.primary : COLORS.muted }}>
                {row.replies}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function TrustBadge({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: COLORS.muted }}>
      <span className="flex items-center justify-center">
        {icon}
      </span>
      {text}
    </span>
  );
}

export default function HeroSection() {
  return (
    <section 
      className="relative min-h-screen overflow-hidden"
      style={{ backgroundColor: 'transparent' }}
    >
      <ParticleCanvas />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 pt-16 md:flex-row md:items-center md:gap-8 md:px-12 md:pt-0">
        <div className="w-full md:w-[46%]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: easeOut }}
            className="mb-5 inline-flex items-center rounded-full border px-3.5 py-1.5 text-xs font-semibold"
            style={{ 
              borderColor: COLORS.primary, 
              color: COLORS.primary,
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              boxShadow: `0 0 20px rgba(245, 158, 11, 0.2)`,
            }}
          >
            <span className="mr-2 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full opacity-75" style={{ backgroundColor: COLORS.primary }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: COLORS.primary }} />
            </span>
            Built for Cold Email Agencies
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: easeOut, delay: 0.1 }}
            className="text-[2.2rem] font-extrabold leading-[1.15] md:text-[2.8rem] lg:text-[3.5rem]"
            style={{ color: COLORS.text }}
          >
            <span className="block">Run Every Client</span>
            <span className="block">Campaign.</span>
            <span 
              className="block bg-gradient-to-r from-amber-500 to-yellow-400 bg-clip-text text-transparent"
              style={{ backgroundImage: `linear-gradient(90deg, ${COLORS.primary}, ${COLORS.secondary})` }}
            >
              One Dashboard.
            </span>
            <span className="block">Zero Chaos.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: easeOut, delay: 0.3 }}
            className="mt-5 max-w-sm text-base md:text-base"
            style={{ color: COLORS.muted, lineHeight: 1.6 }}
          >
            EmailFlow connects all your client Gmail accounts in one place — launch campaigns, track replies, report results. No tab-switching. Ever.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: easeOut, delay: 0.4 }}
            className="mt-7 flex flex-col gap-3 sm:flex-row"
          >
            <Link
              href="/auth/signin"
              className="group relative inline-flex items-center justify-center rounded-[10px] px-7 py-3.5 text-sm font-bold transition-all hover:scale-[1.03]"
              style={{ 
                backgroundColor: COLORS.primary,
                color: '#000',
                boxShadow: '0 0 24px rgba(245, 158, 11, 0.5)',
              }}
            >
              <span 
                className="absolute inset-0 rounded-[10px] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{ 
                  boxShadow: '0 0 40px rgba(245, 158, 11, 0.75)',
                  animation: 'pulse-glow 2s ease-in-out infinite',
                }}
              />
              <span className="relative flex items-center gap-2">
                Get Started Free
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
              <style jsx>{`
                @keyframes pulse-glow {
                  0%, 100% { box-shadow: 0 0 24px rgba(245, 158, 11, 0.5); }
                  50% { box-shadow: 0 0 36px rgba(245, 158, 11, 0.7); }
                }
              `}</style>
            </Link>
            
            <Link
              href="/auth/signin"
              className="inline-flex items-center justify-center rounded-[10px] border px-6 py-3.5 text-sm font-semibold transition-all hover:bg-white/5"
              style={{ 
                borderColor: COLORS.glassBorder, 
                color: COLORS.text 
              }}
            >
              <Play className="mr-2 h-4 w-4" style={{ color: COLORS.primary }} />
              See How It Works
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: easeOut, delay: 0.5 }}
            className="mt-6 flex flex-wrap items-center gap-3 gap-y-2 text-xs"
            style={{ color: COLORS.muted }}
          >
            <TrustBadge 
              icon={<Check className="h-3.5 w-3.5" style={{ color: COLORS.primary }} />} 
              text="Official Gmail API" 
            />
            <TrustBadge 
              icon={<Check className="h-3.5 w-3.5" style={{ color: COLORS.primary }} />} 
              text="No credit card" 
            />
            <TrustBadge 
              icon={<Check className="h-3.5 w-3.5" style={{ color: COLORS.primary }} />} 
              text="2 min setup" 
            />
          </motion.div>
        </div>

        <div className="mt-10 w-full md:mt-0 md:w-[54%]">
          <GlassDashboardCard />
        </div>
      </div>
    </section>
  );
}
