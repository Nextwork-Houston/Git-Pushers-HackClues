"use client";

import { useAppStore } from "@/store/useAppStore";

export default function XPBar() {
  const { currentXP, maxXP, level, addXP } = useAppStore();
  const pct = Math.min(100, (currentXP / maxXP) * 100);

  return (
    <div className="fixed top-0 left-0 right-0 z-50 px-4 py-2 bg-bg-dark/80 backdrop-blur-sm border-b border-bg-surface">
      <div className="max-w-4xl mx-auto flex items-center gap-3">
        {/* Level badge */}
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-white">
            {level}
          </div>
          <span className="text-xs font-medium text-text-secondary">LVL</span>
        </div>

        {/* Bar track */}
        <div className="flex-1 h-3 bg-bg-surface rounded-full overflow-hidden relative group cursor-pointer"
             onClick={() => addXP(50)}>
          {/* Fill */}
          <div
            className="h-full bg-gradient-to-r from-accent to-purple-400 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />

          {/* Glow overlay */}
          <div
            className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-accent/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* XP text */}
        <span className="text-xs font-mono text-text-secondary whitespace-nowrap min-w-[80px] text-right">
          {currentXP} <span className="text-text-primary/40">/</span> {maxXP}
        </span>

        {/* Click hint */}
        <span className="text-[10px] text-text-secondary/40 hidden sm:block">
          click bar +50xp
        </span>
      </div>
    </div>
  );
}