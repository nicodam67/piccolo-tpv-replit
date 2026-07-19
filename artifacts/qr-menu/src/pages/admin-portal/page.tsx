import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { AdminLoginForm, SignOutButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import AdminDashboard from "../admin/_components/AdminDashboard.tsx";
import InstallAdminButton from "./_components/InstallAdminButton.tsx";
import { ShieldCheck } from "lucide-react";

export default function AdminPortalPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border/60 bg-card px-6 py-4 flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h1
          className="text-xl font-medium text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Panel de Administración
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <Authenticated>
            <SignOutButton />
          </Authenticated>
          <InstallAdminButton />
        </div>
      </header>

      <AuthLoading>
        <div className="max-w-5xl mx-auto px-4 py-12 space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </AuthLoading>

      <Unauthenticated>
        <AdminLoginForm />
      </Unauthenticated>

      <Authenticated>
        <AdminDashboard />
      </Authenticated>
    </div>
  );
}
