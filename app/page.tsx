"use client";

import { useAuth } from "@/providers/AuthProvider";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import XPBar from "@/components/XPBar";
import MicWidget from "@/components/MicWidget";
import Chatbox from "@/components/Chatbox";
import { LogOut, Sparkles } from "lucide-react";

// Dynamic import — Three.js crashes on the server
const SpriteStage = dynamic(
  () => import("@/components/SpriteStage"),
  { ssr: false }
);

export default function DashboardPage() {
  const { isAuthenticated, loading, user, logout } = useAuth();
  const router = useRouter();

  // Auth guard — redirect to /login if not authenticated
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg-dark">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null; // will redirect

  return (
    <div className="min-h-dvh bg-bg-dark flex flex-col">
      <XPBar />

      {/* Top bar */}
      <header className="pt-14 px-6 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-accent" />
          <h1 className="text-lg font-semibold text-text-primary">
            Sprite Dashboard
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <MicWidget />
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold">
              {user?.username?.charAt(0).toUpperCase() ?? "?"}
            </div>
            <span className="hidden sm:inline">{user?.username}</span>
          </div>
          <button
            onClick={logout}
            className="text-text-secondary hover:text-danger transition-colors"
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
        {/* Sprite stage */}
        <div className="mb-4">
          <SpriteStage />
        </div>

        {/* Instructions */}
        <div className="text-center text-text-secondary text-xs space-y-1">
          <p>Click sprite &rarr; reaction | Drag &rarr; move</p>
          <p>Right-click drag &rarr; rotate (3D)</p>
        </div>
      </main>

      <Chatbox />
    </div>
  );
}