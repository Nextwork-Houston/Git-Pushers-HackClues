"use client";

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  token?: string;
  user?: { id: string; username: string; email: string };
  error?: string;
}

/**
 * Stubbed auth API — returns fake success/failure so the UI
 * can be fully wired before a real backend exists.
 */
export const authApi = {
  register: async (payload: RegisterPayload): Promise<AuthResult> => {
    await new Promise((r) => setTimeout(r, 800)); // simulate latency

    if (!payload.email.includes("@")) {
      return { success: false, error: "Invalid email format." };
    }
    if (payload.password.length < 6) {
      return { success: false, error: "Password must be at least 6 characters." };
    }
    if (payload.password !== payload.confirmPassword) {
      return { success: false, error: "Passwords do not match." };
    }

    return {
      success: true,
      token: "mock-jwt-" + crypto.randomUUID(),
      user: {
        id: crypto.randomUUID(),
        username: payload.username,
        email: payload.email,
      },
    };
  },

  login: async (payload: LoginPayload): Promise<AuthResult> => {
    await new Promise((r) => setTimeout(r, 600));

    // Accept any valid-looking credentials for the mock
    if (!payload.email || !payload.password) {
      return { success: false, error: "Email and password are required." };
    }

    return {
      success: true,
      token: "mock-jwt-" + crypto.randomUUID(),
      user: {
        id: crypto.randomUUID(),
        username: payload.email.split("@")[0],
        email: payload.email,
      },
    };
  },

  logout: async (): Promise<void> => {
    await new Promise((r) => setTimeout(r, 100));
  },
};