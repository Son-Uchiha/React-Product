# Axios Interceptor + Refresh Token Queue

> Docs sát project, copy & paste dùng lại cho dự án mới.

---

## Cấu trúc

```
src/
├── lib/http.ts           ← Axios instance + Interceptors + Queue
├── api/auth.ts           ← Gọi API auth (login, logout, getMe)
└── contexts/AuthContext.tsx  ← Quản lý đăng nhập/đăng xuất
```

---

## 1. `src/lib/http.ts`

```typescript
import axios, { type InternalAxiosRequestConfig } from "axios";

// Thêm field _retry để đánh dấu request đã thử refresh chưa
interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// Mỗi item trong queue = 1 cặp resolve/reject của Promise đang chờ
interface QueueItem {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}

// ── Tạo Axios instance ──
const http = axios.create({
  baseURL: "http://localhost:3000/api",  // 🔧 Đổi URL theo dự án
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Quản lý trạng thái refresh ──
let isRefreshing = false;        // true = đang gọi refresh, request sau phải chờ
let failedQueue: QueueItem[] = []; // Hàng đợi các request đang chờ token mới

// Đánh thức tất cả request trong queue
const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);    // Refresh thất bại → reject hết
    } else if (token) {
      prom.resolve(token);   // Refresh thành công → gửi token mới
    }
  });
  failedQueue = [];
};

// ── Request Interceptor: tự gắn token vào mọi request ──
http.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem("accessToken");
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response Interceptor: bắt 401 → refresh token + queue ──
http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as CustomAxiosRequestConfig | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/login") &&
      !originalRequest.url?.includes("/auth/refresh")
    ) {
      // TH1: Đang có request khác refresh → xếp hàng chờ
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return http(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      // TH2: Request đầu tiên bị 401 → đi refresh
      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem("refreshToken");

      if (!refreshToken) {
        isRefreshing = false;
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        window.location.href = "/login";
        return Promise.reject(error);
      }

      try {
        // Dùng axios gốc (không qua http) để tránh kích hoạt interceptor
        const res = await axios.post<{
          message: string;
          accessToken: string;
          refreshToken: string;
        }>(`${http.defaults.baseURL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = res.data;

        localStorage.setItem("accessToken", newAccessToken);
        if (newRefreshToken) {
          localStorage.setItem("refreshToken", newRefreshToken);
        }

        processQueue(null, newAccessToken);       // Đánh thức queue
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return http(originalRequest);             // Retry request gốc
      } catch (refreshError) {
        processQueue(refreshError, null);         // Reject tất cả queue
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;                     // Luôn reset cờ
      }
    }

    return Promise.reject(error);
  }
);

export default http;
```

---

## 2. `src/api/auth.ts`

```typescript
import http from "../lib/http";
import type { User } from "../types";

export const authApi = {
  login: async (username: string, password: string) => {
    const { data } = await http.post("/auth/login", { username, password });
    return data;
  },
  logout: async (refreshToken: string) => {
    const { data } = await http.post("/auth/logout", { refreshToken });
    return data;
  },
  getMe: async () => {
    const { data } = await http.get<{ data: User }>("/auth/me");
    return data.data;
  },
};
```

---

## 3. `src/contexts/AuthContext.tsx`

```tsx
import { createContext, useContext, useEffect, useState } from "react";
import { authApi } from "../api/auth";
import type { User } from "../types";

type AuthContextType = {
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  user: User | null;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    Boolean(localStorage.getItem("accessToken"))
  );
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      authApi.getMe().then(setUser);
    }
  }, [isAuthenticated]);

  const login = async (username: string, password: string) => {
    const data = await authApi.login(username, password);
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    setIsAuthenticated(true);
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (refreshToken) {
      await authApi.logout(refreshToken).catch(() => {});
    }
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    setIsAuthenticated(false);
  };

  return (
    <AuthContext value={{ user, isAuthenticated, login, logout }}>
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
```

---

## Cách hoạt động tóm gọn

```
Request bị 401
  │
  ├─ Đang refresh? (isRefreshing = true)
  │     → Vào hàng đợi, chờ token mới, rồi retry
  │
  └─ Chưa refresh? (isRefreshing = false)
        → Gọi /auth/refresh
        → Thành công: lưu token mới → đánh thức queue → retry
        → Thất bại: reject queue → xoá token → về /login
```

## 🔧 Khi dùng lại cho dự án mới

Chỉ cần đổi **3 thứ**:

1. `baseURL` trong `http.ts` → URL API của dự án mới
2. Endpoint refresh (`/auth/refresh`) → theo API backend
3. Tên field response (`accessToken`, `refreshToken`) → theo API backend
