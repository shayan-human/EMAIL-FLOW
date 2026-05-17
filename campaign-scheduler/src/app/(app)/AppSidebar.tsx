"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";

interface AppSidebarProps {
    user: { email?: string; id: string };
}

export function AppSidebar({ user }: AppSidebarProps) {
    const [collapsed, setCollapsed] = useState(false);

    return (
        <Sidebar
            user={user}
            collapsed={collapsed}
            onToggle={() => setCollapsed(!collapsed)}
        />
    );
}
