"use client";

import { create } from "zustand";

export interface Message {
  id: string;
  text: string;
  sender: "user" | "system";
  timestamp: number;
}

export interface User {
  id: string;
  username: string;
  email: string;
}

interface AppState {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;

  // XP
  currentXP: number;
  maxXP: number;
  level: number;
  addXP: (amount: number) => void;

  // Chat
  messages: Message[];
  addMessage: (text: string, sender: "user" | "system") => void;
  chatOpen: boolean;
  toggleChat: () => void;

  // Mic
  micActive: boolean;
  setMicActive: (active: boolean) => void;
  micVolume: number;
  setMicVolume: (volume: number) => void;
  micError: string | null;
  setMicError: (error: string | null) => void;

  // Sprite
  currentAnimation: string;
  setCurrentAnimation: (anim: string) => void;
  spritePosition: { x: number; y: number };
  setSpritePosition: (pos: { x: number; y: number }) => void;
  spriteRotation: number;
  setSpriteRotation: (rot: number) => void;

  // Session token (mock)
  sessionToken: string | null;
  setSessionToken: (token: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: user !== null }),

  currentXP: 420,
  maxXP: 1000,
  level: 7,
  addXP: (amount) =>
    set((state) => {
      const newXP = state.currentXP + amount;
      if (newXP >= state.maxXP) {
        return {
          currentXP: newXP - state.maxXP,
          maxXP: state.maxXP + 250,
          level: state.level + 1,
        };
      }
      return { currentXP: newXP };
    }),

  messages: [
    {
      id: "welcome",
      text: "Welcome to the Sprite Dashboard! Click the sprite to interact.",
      sender: "system",
      timestamp: Date.now(),
    },
  ],
  addMessage: (text, sender) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: crypto.randomUUID(),
          text,
          sender,
          timestamp: Date.now(),
        },
      ],
    })),
  chatOpen: true,
  toggleChat: () => set((state) => ({ chatOpen: !state.chatOpen })),

  micActive: false,
  setMicActive: (active) => set({ micActive: active }),
  micVolume: 0,
  setMicVolume: (volume) => set({ micVolume: volume }),
  micError: null,
  setMicError: (error) => set({ micError: error }),

  currentAnimation: "idle",
  setCurrentAnimation: (anim) => set({ currentAnimation: anim }),
  spritePosition: { x: 0, y: 0 },
  setSpritePosition: (pos) => set({ spritePosition: pos }),
  spriteRotation: 0,
  setSpriteRotation: (rot) => set({ spriteRotation: rot }),

  sessionToken: null,
  setSessionToken: (token) => set({ sessionToken: token }),
}));