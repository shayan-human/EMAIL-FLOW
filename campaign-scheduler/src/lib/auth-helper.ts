import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function getUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return {
    id: (session.user as any).id as string,
    email: session.user.email as string,
    name: session.user.name as string,
    image: session.user.image as string | undefined,
  };
}

export async function auth() {
  const user = await getUser();
  
  return {
    user,
    session: user ? { user } : null,
    token: null,
  };
}
