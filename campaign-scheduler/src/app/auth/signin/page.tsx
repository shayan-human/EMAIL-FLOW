import { Suspense } from "react";
import SignInContent from "./SignInContent";

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f0f0f]" />}>
      <SignInContent />
    </Suspense>
  );
}
