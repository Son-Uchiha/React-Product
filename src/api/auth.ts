import http from "../lib/http";
import type { User } from "../types";

export const authApi = {
  login: async (username: string, password: string) => {
    const { data } = await http.post("/auth/login", {
      username,
      password,
    });
    return data;
  },
  logout: async (refreshToken: string) => {
    const { data } = await http.post("/auth/logout", {
      refreshToken,
    });
    return data;
  },
  getMe: async () => {
    const { data } = await http.get<{ data: User }>("/auth/me");
    return data.data;
  },
};
