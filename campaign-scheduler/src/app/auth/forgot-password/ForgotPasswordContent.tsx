"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";


const COLORS = {
  page: "#0f0f0f",
  card: "#141414",
  border: "#222222",
  accent: "#F59E0B",
  text: "#FFFFFF",
  muted: "#888888",
};

const easeOut = [0.16, 1, 0.3, 1] as const;

export default function ForgotPasswordContent() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const reducedMotion = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const isLightMode = resolvedTheme === 'light';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to request password reset");
      }

      setIsSubmitted(true);
    } catch (error: any) {
      alert(error.message || "An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: COLORS.page }}
    >
      {/* Ambient glow */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[600px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(245,158,11,0.1) 0%, rgba(245,158,11,0) 70%)" }}
      />

      {/* Minimal Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 md:px-8">
        <Link href="/" className="flex items-center gap-2.5 group">
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
        <Link
          href="/auth/signin"
          className="text-sm transition-colors flex items-center gap-2"
          style={{ color: COLORS.muted }}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.muted)}
        >
          <ArrowLeft size={16} /> Back to Sign In
        </Link>
      </nav>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-6 pt-24 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: easeOut }}
          className="w-full max-w-[480px] p-12 rounded-[12px]"
          style={{
            backgroundColor: COLORS.card,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          {isSubmitted ? (
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${COLORS.accent}20`, border: `1px solid ${COLORS.accent}40` }}
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 12, stiffness: 200 }}
                  >
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke={COLORS.accent} strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </motion.div>
                </div>
              </div>
              <h1 className="text-[24px] font-bold" style={{ color: COLORS.text }}>
                Check your email
              </h1>
              <p className="text-sm" style={{ color: COLORS.muted }}>
                We've sent a password reset link to <span className="font-medium text-white">{email}</span>.
              </p>
              <button
                onClick={() => setIsSubmitted(false)}
                className="text-sm transition-colors"
                style={{ color: COLORS.accent }}
              >
                Didn't receive the email? Try again
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center mb-8">
                <h1 className="text-[28px] font-bold text-center" style={{ color: COLORS.text }}>
                  Reset password
                </h1>
                <p className="text-sm mt-2 text-center" style={{ color: COLORS.muted }}>
                  Enter your email address and we'll send you a link to reset your password.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="text-[13px] uppercase tracking-widest font-medium ml-1"
                    style={{ color: COLORS.muted }}
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="you@agency.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-12 rounded-[10px] px-4 text-white placeholder:text-[#888888] outline-none transition-all"
                    style={{
                      backgroundColor: COLORS.page,
                      border: `1px solid ${COLORS.border}`,
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = COLORS.accent;
                      e.target.style.boxShadow = "0 0 0 3px rgba(245,158,11,0.15)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = COLORS.border;
                      e.target.style.boxShadow = "none";
                    }}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !email}
                  className="relative w-full h-12 rounded-[10px] font-medium uppercase tracking-wide transition-all disabled:opacity-50"
                  style={{
                    backgroundColor: COLORS.accent,
                    color: COLORS.page,
                  }}
                >
                  {!reducedMotion && !isLoading && (
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 rounded-[10px] pointer-events-none"
                      style={{ border: `1px solid rgba(245,158,11,0.55)` }}
                      animate={{ scale: [1, 1.4], opacity: [0.4, 0] }}
                      transition={{ duration: 1.1, ease: easeOut, repeat: Infinity, repeatDelay: 1.9 }}
                    />
                  )}
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </form>
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}
