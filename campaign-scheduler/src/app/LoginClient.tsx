"use client";

import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Shield, Globe, Cpu } from "lucide-react";
import { signIn } from "next-auth/react";
import { LampContainer } from "@/components/ui/lamp";
import { Button } from "@/components/ui/button";

export default function LoginClient() {
    const handleSignIn = async () => {
        try {
            await signIn('google', { callbackUrl: '/dashboard' });
        } catch (error) {
            console.error("Sign in failed:", error);
        }
    };

    return (
        <main className="bg-slate-950 min-h-screen overflow-hidden">
            <LampContainer>
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="w-full max-w-[420px] p-8 rounded-[2rem] bg-slate-900/50 backdrop-blur-3xl border border-white/5 shadow-2xl relative"
                >
                    <div className="flex flex-col items-center text-center space-y-8">
                        {/* Premium Logo Wrapper */}
                        <div className="relative group">
                            <div className="absolute -inset-4 bg-orange-500/20 rounded-full blur-2xl group-hover:bg-orange-500/30 transition-all duration-700" />
                            <div className="w-20 h-20 bg-gradient-to-tr from-orange-600 to-amber-400 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(249,115,22,0.3)] relative z-10">
                                <Sparkles className="w-10 h-10 text-white" />
                            </div>
                        </div>

                        <div>
                            <h1 className="text-4xl font-extrabold text-white tracking-tighter mb-2">
                                EmailFlow <span className="text-orange-500 font-light">Engine</span>
                            </h1>
                            <p className="text-slate-400 text-[14px] font-medium leading-relaxed max-w-[280px]">
                                Industrial-grade email orchestration for outbound specialists.
                            </p>
                        </div>

                        <div className="w-full space-y-6 pt-4">
                            <button
                                onClick={handleSignIn}
                                className="group relative w-full py-4 px-6 bg-white text-slate-950 font-bold rounded-2xl transition-all duration-500 hover:bg-orange-50 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 overflow-hidden shadow-xl shadow-white/5"
                            >
                                <span className="relative z-10 flex items-center gap-2">
                                    Authenticate with Google
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </span>
                            </button>

                            <div className="flex flex-col items-center gap-4">
                                <span className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold">
                                    Trusted by 50+ Growth Teams
                                </span>
                                <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-slate-800 to-transparent" />
                            </div>
                        </div>

                        {/* Feature Badges */}
                        <div className="grid grid-cols-3 gap-6 w-full pt-2">
                            <div className="flex flex-col items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
                                <div className="p-2 rounded-lg bg-slate-800/50 border border-white/5">
                                    <Shield className="w-4 h-4 text-orange-500" />
                                </div>
                                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Secure</span>
                            </div>
                            <div className="flex flex-col items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
                                <div className="p-2 rounded-lg bg-slate-800/50 border border-white/5">
                                    <Globe className="w-4 h-4 text-orange-500" />
                                </div>
                                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Global</span>
                            </div>
                            <div className="flex flex-col items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
                                <div className="p-2 rounded-lg bg-slate-800/50 border border-white/5">
                                    <Cpu className="w-4 h-4 text-orange-500" />
                                </div>
                                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">AI-Led</span>
                            </div>
                        </div>
                    </div>
                </motion.div>
                
                {/* Background "OS" Text */}
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 pointer-events-none opacity-[0.03]">
                    <h2 className="text-[12rem] font-black tracking-tighter text-white select-none leading-none">
                        ORCHESTRA
                    </h2>
                </div>
            </LampContainer>
        </main>
    );
}
