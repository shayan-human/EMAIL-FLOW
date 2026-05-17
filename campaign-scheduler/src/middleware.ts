import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
    const token = await getToken({ 
        req: request,
        secret: process.env.NEXTAUTH_SECRET 
    });
    
    const { pathname } = request.nextUrl;

    const isPublicRoute = 
        pathname === '/' || 
        pathname === '/auth/signin' || 
        pathname === '/auth/signup' ||
        pathname === '/auth/forgot-password' ||
        pathname.startsWith('/api/auth') ||
        pathname.startsWith('/api/gmail-connect/callback'); // Ensure OAuth callback goes through!

    const isAuthPath = pathname.startsWith('/auth/');

    // 1. If trying to access protected route without session token -> Sign In
    if (!token && !isPublicRoute && !isAuthPath) {
        const signInUrl = new URL('/auth/signin', request.url);
        signInUrl.searchParams.set('reason', 'session_expired');
        return NextResponse.redirect(signInUrl);
    }

    // 2. If already logged in and hitting Sign In/Sign Up/Landing -> Dashboard
    if (token && (pathname === '/' || isAuthPath)) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
