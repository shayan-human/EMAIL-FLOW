import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth-helper";
import { AppSidebar } from "./AppSidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const user = await getUser();

    if (!user) {
        redirect("/auth/signin");
    }

    return (
        <div className="h-screen flex overflow-hidden" style={{ backgroundColor: "var(--bg-page)", color: "var(--text-primary)" }}>
            <AppSidebar user={user as any} />
            <main className="flex-1 relative overflow-y-auto" style={{ backgroundColor: "var(--bg-page)" }}>
                {/* Background ambient glows */}
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden -z-10">
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full" />
                    <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary/5 blur-[100px] rounded-full" />
                </div>

                <div className="p-8 max-w-7xl mx-auto relative z-10">
                    {children}
                </div>
            </main>
        </div>
    );
}
