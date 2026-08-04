"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/providers/AuthProvider";
import Link from "next/link";
import { Sparkles, Eye, EyeOff, AlertCircle } from "lucide-react";

export default function RegisterPage() {
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validation
    const trimmed = {
      username: username.trim(),
      email: email.trim(),
    };

    if (!trimmed.username || !trimmed.email || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }
    if (trimmed.username.length < 2) {
      setError("Username must be at least 2 characters.");
      return;
    }
    if (!trimmed.email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const err = await register(
      trimmed.username,
      trimmed.email,
      password,
      confirmPassword
    );
    setSubmitting(false);
    if (err) setError(err);
  };

  return (
    <div className="min-h-dvh bg-bg-dark flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 justify-center mb-8">
          <Sparkles size={22} className="text-accent" />
          <span className="text-xl font-semibold text-text-primary">
            Sprite Dashboard
          </span>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-bg-card border border-bg-surface rounded-xl p-6 space-y-5"
        >
          <h1 className="text-lg font-semibold text-text-primary text-center">
            Create account
          </h1>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-danger/10 text-danger text-xs">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Username */}
          <div>
            <label
              htmlFor="username"
              className="block text-xs font-medium text-text-secondary mb-1.5"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="sprite_fan"
              className="w-full bg-bg-surface text-text-primary text-sm rounded-lg px-3 py-2.5 placeholder-text-secondary/40 outline-none focus:ring-1 focus:ring-accent/50 transition-shadow"
              autoComplete="username"
            />
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-text-secondary mb-1.5"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-bg-surface text-text-primary text-sm rounded-lg px-3 py-2.5 placeholder-text-secondary/40 outline-none focus:ring-1 focus:ring-accent/50 transition-shadow"
              autoComplete="email"
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-text-secondary mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full bg-bg-surface text-text-primary text-sm rounded-lg px-3 py-2.5 pr-10 placeholder-text-secondary/40 outline-none focus:ring-1 focus:ring-accent/50 transition-shadow"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors"
                tabIndex={-1}
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Confirm password */}
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-xs font-medium text-text-secondary mb-1.5"
            >
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type={showPw ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              className="w-full bg-bg-surface text-text-primary text-sm rounded-lg px-3 py-2.5 placeholder-text-secondary/40 outline-none focus:ring-1 focus:ring-accent/50 transition-shadow"
              autoComplete="new-password"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {submitting ? "Creating account..." : "Create account"}
          </button>

          {/* Login link */}
          <p className="text-xs text-text-secondary text-center">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-accent hover:text-accent-hover underline"
            >
              Log in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}