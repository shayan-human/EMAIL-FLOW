import { Suspense } from "react";
import ForgotPasswordContent from "./ForgotPasswordContent";
import { Loader2 } from "lucide-react";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f0f]">
        <Loader2 className="w-8 h-8 animate-spin text-[#F59E0B]" />
      </div>
    }>
      <ForgotPasswordContent />
    </Suspense>
  );
}
