import { useSession } from 'next-auth/react';

export function useUser() {
    const { data: session, status } = useSession();
    
    return {
        user: session?.user ? {
            id: (session.user as any).id,
            email: session.user.email,
            name: session.user.name,
            image: session.user.image,
            // Keep provider token support in case it's used in the app
            provider_token: (session as any).provider_token ?? null,
            provider_refresh_token: (session as any).provider_refresh_token ?? null,
        } : null,
        isLoaded: status !== 'loading',
    };
}

export const useAuth = useUser;
