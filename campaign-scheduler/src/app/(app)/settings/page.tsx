"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings as SettingsIcon, Sun, Moon, Monitor, Bell, BellOff, LogOut, Save, X } from "lucide-react";

import { useUser, useAuth } from "@/hooks/use-user";
import { toast } from "@/components/ui/toast-provider";
import { SimpleConfirmModal } from "@/components/ui/simple-confirm-modal";
import { formatInTimezone, getBrowserTimezone } from "@/lib/utils";

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "US/Eastern (ET)" },
  { value: "America/Chicago", label: "US/Central (CT)" },
  { value: "America/Denver", label: "US/Mountain (MT)" },
  { value: "America/Los_Angeles", label: "US/Pacific (PT)" },
  { value: "Europe/London", label: "Europe/London (GMT)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST)" },
];

interface UserSettings {
  id?: string;
  user_id: string;
  timezone: string;
  send_window_from: string;
  send_window_to: string;
  send_window_enabled: boolean;
  theme: string;
  reply_notifications: boolean;
  bounce_notifications: boolean;
  display_name: string | null;
}

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const { signOut } = useAuth();
  const [settings, setSettings] = useState<UserSettings>({
    user_id: "",
    timezone: getBrowserTimezone(),
    send_window_from: "09:00",
    send_window_to: "17:00",
    send_window_enabled: false,
    theme: "dark",
    reply_notifications: true,
    bounce_notifications: true,
    display_name: null,
  });
  const [originalSettings, setOriginalSettings] = useState<UserSettings>(settings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayNameChanged, setDisplayNameChanged] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  useEffect(() => {
    if (isLoaded && user) {
      setSettings(prev => ({ ...prev, user_id: user.id }));
      fetchSettings();
    }
  }, [user, isLoaded]);

  const fetchSettings = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      const { data } = await res.json();

      if (data) {
        const newSettings = {
          ...data,
          send_window_from: data.send_window_from?.slice(0, 5) || "09:00",
          send_window_to: data.send_window_to?.slice(0, 5) || "17:00",
          send_window_enabled: data.send_window_enabled || false,
        };
        setSettings(newSettings);
        setOriginalSettings(newSettings);
        applyTheme(newSettings.theme);
      } else {
        setSettings(prev => ({ ...prev, timezone: getBrowserTimezone() }));
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const applyTheme = (theme: string) => {
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
    localStorage.setItem("theme", theme);
  };

  const handleThemeChange = async (newTheme: string) => {
    setSettings(prev => ({ ...prev, theme: newTheme }));
    applyTheme(newTheme);
    await saveSettings({ theme: newTheme }, true);
  };

  const handleNotificationChange = async (key: "reply_notifications" | "bounce_notifications", value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    await saveSettings({ [key]: value }, true);
  };

  const saveSettings = async (updates: Partial<UserSettings>, instant = false) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to save settings");
      }

      if (!instant) {
        setOriginalSettings(settings);
        toast.success("Settings saved");
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleCampaignSettingsSave = () => {
    saveSettings({
      timezone: settings.timezone,
      send_window_from: settings.send_window_from,
      send_window_to: settings.send_window_to,
      send_window_enabled: settings.send_window_enabled,
    });
  };

  const handleDisplayNameSave = () => {
    saveSettings({ display_name: settings.display_name });
    setDisplayNameChanged(false);
  };

  const handleSignOut = async () => {
    setConfirmModalOpen(false);
    await signOut();
    window.location.href = "/";
  };

  const hasCampaignChanges = 
    settings.timezone !== originalSettings.timezone ||
    settings.send_window_from !== originalSettings.send_window_from ||
    settings.send_window_to !== originalSettings.send_window_to ||
    settings.send_window_enabled !== originalSettings.send_window_enabled;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Settings</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Manage your workspace preferences.</p>
      </div>

      {/* Campaign Settings */}
      <section>
        <h2 className="text-xs uppercase tracking-widest mb-4" style={{ color: "#888888" }}>
          Campaign Settings
        </h2>
        <div 
          className="rounded-[12px] overflow-hidden"
          style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          {/* Timezone */}
          <div 
            className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-[#1a1a1a]"
            style={{ minHeight: 56 }}
          >
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Timezone</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                All campaign send times and dashboard stats will display in this timezone.
              </div>
            </div>
            <select
              value={settings.timezone}
              onChange={(e) => setSettings(prev => ({ ...prev, timezone: e.target.value }))}
              className="w-[180px] h-9 rounded-[10px] px-3 text-sm outline-none transition-all"
              style={{ 
                backgroundColor: "#0f0f0f", 
                border: "1px solid #222222", 
                color: "var(--text-primary)" 
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#F59E0B";
                e.target.style.boxShadow = "0 0 0 3px rgba(245,158,11,0.15)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#222222";
                e.target.style.boxShadow = "none";
              }}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Daily Send Window Toggle */}
          <div 
            className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-[#1a1a1a]"
            style={{ minHeight: 56 }}
          >
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Daily Send Window</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {settings.send_window_enabled 
                  ? `Emails will only send between ${settings.send_window_from} and ${settings.send_window_to} your time.`
                  : "Turn on to restrict sending to specific hours each day."}
              </div>
            </div>
            <button
              onClick={() => {
                const newValue = !settings.send_window_enabled;
                setSettings(prev => ({ ...prev, send_window_enabled: newValue }));
              }}
              className={`relative w-12 h-6 rounded-full transition-all duration-200 ${
                settings.send_window_enabled ? "bg-amber-500" : "bg-gray-700"
              }`}
              style={{
                backgroundColor: settings.send_window_enabled ? "#F59E0B" : "#374151"
              }}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-200 ${
                  settings.send_window_enabled ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>

          {/* Time Inputs - Only show when toggle is ON */}
          {settings.send_window_enabled && (
            <div 
              className="flex items-center justify-between px-6 py-4 transition-colors"
              style={{ minHeight: 56 }}
            >
              <div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Send hours (your timezone: {settings.timezone})
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={settings.send_window_from}
                  onChange={(e) => setSettings(prev => ({ ...prev, send_window_from: e.target.value }))}
                  className="w-[100px] h-9 rounded-[10px] px-3 text-sm outline-none transition-all"
                  style={{ 
                    backgroundColor: "#0f0f0f", 
                    border: "1px solid #222222", 
                    color: "var(--text-primary)" 
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#F59E0B";
                    e.target.style.boxShadow = "0 0 0 3px rgba(245,158,11,0.15)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#222222";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <span style={{ color: "var(--text-muted)" }}>to</span>
                <input
                  type="time"
                  value={settings.send_window_to}
                  onChange={(e) => setSettings(prev => ({ ...prev, send_window_to: e.target.value }))}
                  className="w-[100px] h-9 rounded-[10px] px-3 text-sm outline-none transition-all"
                  style={{ 
                    backgroundColor: "#0f0f0f", 
                    border: "1px solid #222222", 
                    color: "var(--text-primary)" 
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#F59E0B";
                    e.target.style.boxShadow = "0 0 0 3px rgba(245,158,11,0.15)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#222222";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>
          )}

          {hasCampaignChanges && (
            <>
              <div style={{ borderTop: "1px solid var(--border)" }} />
              <div className="flex justify-end px-6 py-4">
                <button
                  onClick={handleCampaignSettingsSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-[8px] text-sm font-medium transition-all"
                  style={{ 
                    backgroundColor: "#F59E0B", 
                    color: "#0f0f0f" 
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.filter = "brightness(110%)"}
                  onMouseLeave={(e) => e.currentTarget.style.filter = "brightness(100%)"}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Appearance */}
      <section>
        <h2 className="text-xs uppercase tracking-widest mb-4" style={{ color: "#888888" }}>
          Appearance
        </h2>
        <div 
          className="rounded-[12px] overflow-hidden"
          style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <div 
            className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-[#1a1a1a]"
            style={{ minHeight: 56 }}
          >
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Theme</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Switch between dark and light mode.
              </div>
            </div>
            <div 
              className="flex items-center rounded-[8px] p-1"
              style={{ backgroundColor: "#0f0f0f", border: "1px solid #222222" }}
            >
              {[
                { value: "dark", icon: Moon, label: "Dark" },
                { value: "system", icon: Monitor, label: "System" },
                { value: "light", icon: Sun, label: "Light" },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleThemeChange(option.value)}
                  className="relative flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-xs font-medium transition-all"
                  style={{
                    color: settings.theme === option.value ? "#F59E0B" : "#888888",
                  }}
                >
                  <AnimatePresence mode="wait">
                    {settings.theme === option.value && (
                      <motion.div
                        layoutId="theme-pill"
                        initial={false}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 rounded-[6px]"
                        style={{ backgroundColor: "rgba(245,158,11,0.15)" }}
                      />
                    )}
                  </AnimatePresence>
                  <option.icon size={14} />
                  <span className="relative z-10">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section>
        <h2 className="text-xs uppercase tracking-widest mb-4" style={{ color: "#888888" }}>
          Notifications
        </h2>
        <div 
          className="rounded-[12px] overflow-hidden"
          style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          {/* Reply Notifications */}
          <div 
            className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-[#1a1a1a]"
            style={{ minHeight: 56 }}
          >
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Reply Notifications</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Get notified when a lead replies to a campaign email.
              </div>
            </div>
            <ToggleSwitch
              checked={settings.reply_notifications}
              onChange={(checked) => handleNotificationChange("reply_notifications", checked)}
            />
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Bounce Notifications */}
          <div 
            className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-[#1a1a1a]"
            style={{ minHeight: 56 }}
          >
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Bounce Alerts</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Get notified when an email bounces.
              </div>
            </div>
            <ToggleSwitch
              checked={settings.bounce_notifications}
              onChange={(checked) => handleNotificationChange("bounce_notifications", checked)}
            />
          </div>
        </div>
      </section>

      {/* Account */}
      <section>
        <h2 className="text-xs uppercase tracking-widest mb-4" style={{ color: "#888888" }}>
          Account
        </h2>
        <div 
          className="rounded-[12px] overflow-hidden"
          style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          {/* Display Name */}
          <div 
            className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-[#1a1a1a]"
            style={{ minHeight: 56 }}
          >
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Display Name</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Used as the sender name in outgoing emails.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={settings.display_name || ""}
                onChange={(e) => {
                  setSettings(prev => ({ ...prev, display_name: e.target.value }));
                  setDisplayNameChanged(true);
                }}
                placeholder="Your Name"
                className="w-[200px] h-9 rounded-[10px] px-3 text-sm outline-none transition-all"
                style={{ 
                  backgroundColor: "#0f0f0f", 
                  border: "1px solid #222222", 
                  color: "var(--text-primary)" 
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#F59E0B";
                  e.target.style.boxShadow = "0 0 0 3px rgba(245,158,11,0.15)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "#222222";
                  e.target.style.boxShadow = "none";
                }}
              />
              {displayNameChanged && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={handleDisplayNameSave}
                  className="px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all"
                  style={{ 
                    border: "1px solid #F59E0B", 
                    color: "#F59E0B" 
                  }}
                >
                  Save
                </motion.button>
              )}
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Primary Account */}
          <div 
            className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-[#1a1a1a]"
            style={{ minHeight: 56 }}
          >
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Primary Account</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                The Google account used for authentication.
              </div>
            </div>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              {user?.email}
            </span>
          </div>

          <div style={{ borderTop: "1px solid var(--border)" }} />

          {/* Sign Out */}
          <div className="px-6 py-4">
            <button
              onClick={() => setConfirmModalOpen(true)}
              className="w-full py-2 rounded-[8px] text-sm font-medium transition-all flex items-center justify-center gap-2"
              style={{ 
                border: "1px solid #222222", 
                color: "#ff4444" 
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,68,68,0.08)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>
      </section>

      <SimpleConfirmModal
        open={confirmModalOpen}
        title="Sign Out"
        message="Are you sure you want to sign out of EmailFlow?"
        confirmText="Sign Out"
        cancelText="Stay"
        variant="warning"
        onConfirm={handleSignOut}
        onCancel={() => setConfirmModalOpen(false)}
      />
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative w-11 h-6 rounded-full transition-colors"
      style={{ 
        backgroundColor: checked ? "#F59E0B" : "#222222" 
      }}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md"
        style={{ 
          transform: checked ? "translateX(20px)" : "translateX(0)" 
        }}
      />
    </button>
  );
}
