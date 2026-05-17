"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { signIn } from "next-auth/react";

const COLORS = {
  page: "#0f0f0f",
  card: "#141414",
  border: "#222222",
  accent: "#F59E0B",
  text: "#FFFFFF",
  muted: "#888888",
};

const easeOut = [0.16, 1, 0.3, 1] as const;

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const reducedMotion = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const isLightMode = resolvedTheme === 'light';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const registerRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await registerRes.json();
      if (!registerRes.ok) {
        throw new Error(data.error || "Failed to create account");
      }

      setSuccessMsg("Account created successfully! Logging you in...");

      // Automatically sign in the user
      const signinRes = await signIn("credentials", {
        redirect: false,
        email,
        password,
      });

      if (signinRes?.error) {
        setErrorMsg("Account created, but automatic sign-in failed. Please try signing in manually.");
      } else {
        window.location.href = "/dashboard";
      }
    } catch (error: any) {
      setErrorMsg(error.message || "An unexpected error occurred during signup");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    try {
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch (error: any) {
      setErrorMsg(error.message || "Google sign-up failed");
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: COLORS.page }}
    >
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[600px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0) 70%)" }}
      />

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
          href="/"
          className="text-sm transition-colors"
          style={{ color: COLORS.muted }}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.muted)}
        >
          ← Back to Home
        </Link>
      </nav>

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
          <div className="flex flex-col items-center mb-8">
            <div className={isLightMode ? "rounded-lg p-2 bg-white mb-4" : "mb-4"}>
              <Image 
                src="/email_flow_logo.png" 
                alt="Email Flow" 
                height={48} 
                width={144}
                style={{ width: 'auto', height: 48 }}
              />
            </div>
            <h1 className="text-[28px] font-bold" style={{ color: COLORS.text }}>
              Create your account.
            </h1>
            <p className="text-sm mt-1" style={{ color: COLORS.muted }}>
              Start your free EmailFlow trial today.
            </p>
          </div>

          <button
            onClick={handleGoogleSignUp}
            className="w-full h-12 rounded-[8px] font-medium text-[#0f0f0f] transition-all flex items-center justify-center gap-3 hover:bg-[#141414] hover:border hover:border-white"
            style={{ backgroundColor: COLORS.text }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full" style={{ borderTop: `1px solid ${COLORS.border}` }} />
            </div>
            <div className="relative flex justify-center">
              <span className="px-4 text-xs" style={{ color: COLORS.muted }}>
                or continue with email
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-[8px] text-sm" style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#EF4444" }}>
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 rounded-[8px] text-sm" style={{ backgroundColor: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10B981" }}>
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="name"
                className="text-[13px] uppercase tracking-widest font-medium ml-1"
                style={{ color: COLORS.muted }}
              >
                Full Name
              </label>
              <input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
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

            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-[13px] uppercase tracking-widest font-medium ml-1"
                style={{ color: COLORS.muted }}
              >
                Email
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

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-[13px] uppercase tracking-widest font-medium ml-1"
                style={{ color: COLORS.muted }}
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 rounded-[10px] px-4 pr-12 text-white placeholder:text-[#888888] outline-none transition-all"
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
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: COLORS.muted }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.text)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.muted)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="relative w-full h-12 rounded-[10px] font-medium uppercase tracking-wide transition-all disabled:opacity-70"
              style={{
                backgroundColor: COLORS.accent,
                color: COLORS.page,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = "brightness(110%)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = "brightness(100%)";
              }}
            >
              {!reducedMotion && (
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
                "Create Account"
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <span className="text-[13px]" style={{ color: COLORS.muted }}>
              Already have an account?{" "}
            </span>
            <Link
              href="/auth/signin"
              className="text-[13px] transition-colors"
              style={{ color: COLORS.accent }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#D97706")}
              onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.accent)}
            >
              Sign in
            </Link>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
