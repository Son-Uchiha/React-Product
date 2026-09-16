import http from "../lib/http";

export const authApi = {
  login: async (username: string, password: string) => {
    const { data } = await http.post("/auth/login", {
      username,
      password,
    });
    return data;
  },
};
