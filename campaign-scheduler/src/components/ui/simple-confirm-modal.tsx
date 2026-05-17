"use client";

import { useEffect } from "react";

interface SimpleConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export function SimpleConfirmModal({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: SimpleConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  const getButtonStyles = () => {
    if (variant === "danger") {
      return { bg: "#EF4444", color: "#FFFFFF" };
    }
    if (variant === "warning") {
      return { bg: "#F59E0B", color: "#0f0f0f" };
    }
    return { bg: "#F59E0B", color: "#0f0f0f" };
  };

  const btnStyles = getButtonStyles();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: "#141414",
          border: "1px solid #222222",
          borderRadius: "16px",
          maxWidth: "480px",
          width: "100%",
          padding: "40px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            color: "white",
            fontSize: "20px",
            fontWeight: "bold",
            textAlign: "center",
            marginTop: "16px",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            color: "#888888",
            fontSize: "14px",
            textAlign: "center",
            lineHeight: 1.6,
            marginTop: "16px",
          }}
        >
          {message}
        </p>
        <div
          style={{
            display: "flex",
            gap: "12px",
            marginTop: "32px",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              height: "44px",
              borderRadius: "10px",
              backgroundColor: "#1a1a1a",
              border: "1px solid #222222",
              color: "white",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              height: "44px",
              borderRadius: "10px",
              backgroundColor: btnStyles.bg,
              color: btnStyles.color,
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              border: "none",
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
