"use client";
import { useState } from "react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import AdminDashboard from "./_components/AdminDashboard.tsx";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function AdminPage() {
  const { lng } = useParams<{ lng: string }>();
  const { t } = useTranslation("common");
  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border/60 bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to={`/${lng}`}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            {t("admin.back_menu")}
          </Link>
          <span className="text-border">|</span>
          <h1
            className="text-xl font-medium text-foreground"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {t("admin.panel")}
          </h1>
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
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <p
            className="text-2xl font-light text-foreground mb-2"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {t("admin.sign_in")}
          </p>
          <SignInButton />
        </div>
      </Unauthenticated>

      <Authenticated>
        <AdminDashboard />
      </Authenticated>
    </div>
  );
}
