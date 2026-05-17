'use client';

import { SessionProvider } from 'next-auth/react';

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
    return <SessionProvider>{children}</SessionProvider>;
}
