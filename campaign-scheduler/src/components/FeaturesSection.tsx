"use client";

import { Globe, Zap, RefreshCcw, Shield, Layers, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export function FeaturesSection() {
  const features = [
    {
      icon: <Globe className="h-5 w-5" />,
      title: "Unlimited Infrastructure",
      description: "Scale your email automation without limits on volume or account count. Built for high-volume traders."
    },
    {
      icon: <Shield className="h-5 w-5" />,
      title: "Official Google Compliance",
      description: "Built strictly on official Gmail APIs. Zero risk of account suspension due to unauthorized patterns."
    },
    {
      icon: <Zap className="h-5 w-5" />,
      title: "Swift Execution",
      description: "Real-time campaign triggering and sequence automation with sub-second latency for all users."
    },
    {
      icon: <RefreshCcw className="h-5 w-5" />,
      title: "Dynamic Load Balancing",
      description: "Intelligent distribution across nodes. Automatically adjusts based on real-time health metrics."
    },
    {
      icon: <Layers className="h-5 w-5" />,
      title: "Unified Command Center",
      description: "Manage thousands of identities from a single pane of glass. Full-spectrum visibility into every reply."
    },
    {
      icon: <BarChart3 className="h-5 w-5" />,
      title: "Deep Analytics",
      description: "Granular data reporting and conversion tracking to optimize your outreach performance in real-time."
    }
  ];

  return (
    <section id="features" className="py-24 px-6 max-w-6xl mx-auto relative">
      <div className="text-center mb-16">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-4">
          Core <span className="text-orange-500">Protocol</span>
        </h2>
        <p className="text-slate-400 max-w-xl mx-auto text-base">
          Sovereign infrastructure designed for high-deliverability outreach at scale.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((feature, index) => (
          <FeatureCard
            key={index}
            icon={feature.icon}
            title={feature.title}
            description={feature.description}
          />
        ))}
      </div>
    </section>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="group relative p-6 rounded-2xl bg-zinc-900/50 border border-white/5 hover:border-white/10 transition-all duration-300 hover:bg-zinc-900/80">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-all duration-300">
          {icon}
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-medium text-white mb-2">
            {title}
          </h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
