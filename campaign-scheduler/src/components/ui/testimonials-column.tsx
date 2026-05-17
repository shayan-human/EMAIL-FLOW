"use client";

import React from "react";
import { motion } from "framer-motion";

const COLORS = {
  page: "#0f0f0f",
  card: "#141414",
  border: "#222222",
  accent: "#F59E0B",
  text: "#FFFFFF",
  muted: "#888888",
} as const;

export type Testimonial = {
  text: string;
  image: string;
  name: string;
  role: string;
  company: string;
};

export const TestimonialsColumn = (props: {
  className?: string;
  testimonials: Testimonial[];
  duration?: number;
}) => {
  return (
    <div className={props.className}>
      <motion.div
        animate={{
          translateY: "-50%",
        }}
        transition={{
          duration: props.duration || 15,
          repeat: Infinity,
          ease: "linear",
          repeatType: "loop",
        }}
        className="flex flex-col gap-6 pb-6"
        style={{ backgroundColor: COLORS.page }}
      >
        {[
          ...new Array(2).fill(0).map((_, index) => (
            <React.Fragment key={index}>
              {props.testimonials.map((t, i) => (
                <div
                  className="p-6 rounded-[12px] border max-w-sm w-full"
                  key={i}
                  style={{
                    backgroundColor: COLORS.card,
                    borderColor: COLORS.border,
                    boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
                  }}
                >
                  <div
                    className="text-sm leading-relaxed"
                    style={{ color: COLORS.text }}
                  >
                    &ldquo;{t.text}&rdquo;
                  </div>
                  <div className="flex items-center gap-3 mt-5">
                    <div
                      className="h-10 w-10 rounded-full"
                      style={{
                        background: `linear-gradient(135deg, #222222 0%, #333333 100%)`,
                      }}
                    />
                    <div className="flex flex-col">
                      <div
                        className="font-semibold text-sm tracking-tight"
                        style={{ color: COLORS.text }}
                      >
                        {t.name}
                      </div>
                      <div className="text-xs" style={{ color: COLORS.muted }}>
                        {t.role}, {t.company}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </React.Fragment>
          )),
        ]}
      </motion.div>
    </div>
  );
};
