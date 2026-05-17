"use client";

import { useEffect } from "react";

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "danger" | "warning" | "default";
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmModal({
    isOpen,
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "default",
    onConfirm,
    onCancel,
}: ConfirmModalProps) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;
            if (e.key === "Escape") {
                onCancel();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onCancel]);

    if (!isOpen) return null;

    const getVariantStyles = () => {
        switch (variant) {
            case "danger":
                return {
                    buttonBg: "#EF4444",
                    buttonText: "#FFFFFF",
                };
            case "warning":
                return {
                    buttonBg: "#F59E0B",
                    buttonText: "#0f0f0f",
                };
            default:
                return {
                    buttonBg: "#F59E0B",
                    buttonText: "#0f0f0f",
                };
        }
    };

    const variantStyles = getVariantStyles();

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
                zIndex: 50,
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
                    position: "relative",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Title */}
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

                {/* Message */}
                <p
                    style={{
                        color: "#888888",
                        fontSize: "14px",
                        textAlign: "center",
                        lineHeight: 1.6,
                        maxWidth: "360px",
                        margin: "16px auto 0",
                    }}
                >
                    {message}
                </p>

                {/* Buttons */}
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
                            backgroundColor: variantStyles.buttonBg,
                            color: variantStyles.buttonText,
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
