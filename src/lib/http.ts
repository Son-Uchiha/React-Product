import axios, { type InternalAxiosRequestConfig } from "axios";

interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

interface QueueItem {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}

const http = axios.create({
  baseURL: "http://localhost:3000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Quản lý trạng thái refresh token & hàng đợi (queue)
let isRefreshing = false;
let failedQueue: QueueItem[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

const handleLogout = () => {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
};

// Request Interceptor: Luôn đính kèm Access Token nếu có
http.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem("accessToken");
    if (accessToken) {
      // Tương thích cả Axios v0 và Axios v1
      if (config.headers?.set) {
        config.headers.set("Authorization", `Bearer ${accessToken}`);
      } else {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Bắt lỗi 401 với cơ chế Hàng Đợi (Queue) & Refresh Token Rotation
http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as CustomAxiosRequestConfig | undefined;

    // Bắt lỗi 401, đảm bảo request tồn tại, chưa retry và không phải route auth
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/login") &&
      !originalRequest.url?.includes("/auth/refresh")
    ) {
      // Trường hợp 1: Đang có tiến trình refresh token chạy -> xếp hàng đợi
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest._retry = true; // Đánh dấu đã retry để chống lặp
            if (originalRequest.headers?.set) {
              originalRequest.headers.set("Authorization", `Bearer ${token}`);
            } else {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return http(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      // Trường hợp 2: Là request đầu tiên gặp 401 -> tiến hành Refresh Token
      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem("refreshToken");

      if (!refreshToken) {
        isRefreshing = false;
        handleLogout();
        return Promise.reject(error);
      }

      try {
        // Dùng axios thuần để không kích hoạt interceptor của http
        const res = await axios.post<{
          message: string;
          accessToken: string;
          refreshToken?: string;
        }>(`${http.defaults.baseURL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = res.data;

        // Lưu token mới (Refresh Token Rotation)
        localStorage.setItem("accessToken", newAccessToken);
        if (newRefreshToken) {
          localStorage.setItem("refreshToken", newRefreshToken);
        }

        // Đánh thức tất cả các request đang đợi trong queue
        processQueue(null, newAccessToken);

        // Gán token mới và gọi lại request ban đầu
        if (originalRequest.headers?.set) {
          originalRequest.headers.set("Authorization", `Bearer ${newAccessToken}`);
        } else {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return http(originalRequest);
      } catch (refreshError) {
        // Báo lỗi cho tất cả các request đang xếp hàng
        processQueue(refreshError, null);
        handleLogout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default http;
