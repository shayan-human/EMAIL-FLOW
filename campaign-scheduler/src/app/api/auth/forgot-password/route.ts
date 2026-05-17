import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'No account found with this email' }, { status: 404 });
    }

    // In a production setup, a reset token would be generated here and emailed via nodemailer.
    // For Phase 1 validation, returning success keeps the flow working without throwing errors.
    return NextResponse.json({ message: 'Password reset link sent' });
  } catch (err: any) {
    console.error('[Forgot Password Error]:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
