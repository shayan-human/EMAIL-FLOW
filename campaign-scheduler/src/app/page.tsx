import { auth } from "@/lib/auth-helper";
import { redirect } from "next/navigation";
import LandingPage from "@/components/LandingPage";

export default async function LoginPage() {
  const { user } = await auth();

  // Instant server-side redirect if already logged in
  if (user) {
    redirect("/dashboard");
  }

  return <LandingPage />;
}
