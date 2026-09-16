# Hướng dẫn chi tiết: Refresh Token & Hàng đợi (Queue)

> Giải thích chi tiết từng dòng code trong [http.ts](file:///g:/React-2026-Rikkei/React-Product/src/lib/http.ts) cho người mới học (đã cập nhật khớp 100% với code mới nhất).

---

## 📖 Phần 1: Tại sao cần Refresh Token?

### Câu chuyện đơn giản

Hãy tưởng tượng bạn đi vào một **tòa nhà văn phòng cao cấp**:

1. Bạn đến quầy lễ tân, đưa **CMND** (username + password) → lễ tân cấp cho bạn **thẻ ra vào** (Access Token).
2. Thẻ này có **thời hạn rất ngắn** (ví dụ: 15 phút) — để nếu kẻ xấu nhặt được, họ cũng chỉ vào được 15 phút rồi bị khóa cửa.
3. Nhưng bạn không muốn cứ mỗi 15 phút lại phải lặn lội xuống tầng trệt trình CMND → Lễ tân cấp kèm một **phiếu gia hạn** (Refresh Token).
4. Khi thẻ ra vào hết hạn, bạn chỉ cần gửi **phiếu gia hạn** qua hệ thống để đổi thẻ mới, **không cần phải nhập lại mật khẩu/CMND**.

### Trong code thực tế

| Khái niệm | Ý nghĩa |
|---|---|
| **Access Token** | Token ngắn hạn (15-30 phút), gửi kèm theo mọi request API thông thường. |
| **Refresh Token** | Token dài hạn (7-30 ngày), chỉ dùng khi Access Token hết hạn để **xin cấp cặp token mới**. |
| **401 Unauthorized** | Server phản hồi: "Token hết hạn hoặc không hợp lệ, vui lòng xác thực lại!". |
| **Refresh Token Rotation** | Mỗi lần dùng Refresh Token, server sẽ cấp **cặp token mới** (Access + Refresh mới) và **hủy ngay Refresh Token cũ** để chống đánh cắp. |

---

## 📖 Phần 2: Giải thích chi tiết từng đoạn code mới

### 2.1 — Khởi tạo HTTP Client & Kiểu dữ liệu

```typescript
import axios, { type InternalAxiosRequestConfig } from "axios";

interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}
```

- `InternalAxiosRequestConfig`: Kiểu dữ liệu chuẩn của Axios đại diện cho cấu hình của một request (url, headers, method,...).
- `CustomAxiosRequestConfig`: Chúng ta mở rộng kiểu này bằng cách thêm thuộc tính `_retry?: boolean`.
- `_retry`: Cờ đánh dấu: *"Request này đã từng được thử refresh token hay chưa?"*. Nếu `true`, nghĩa là đã retry rồi, nếu vẫn lỗi 401 thì dừng lại ngay để **tránh bị lặp vô hạn**.

```typescript
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
```

- `QueueItem`: Mỗi phần tử trong hàng đợi lưu giữ 2 hàm điều khiển của Promise:
  - `resolve(token)`: Khi lấy được token mới thành công, đánh thức request chạy tiếp.
  - `reject(error)`: Khi refresh token thất bại, báo lỗi cho request dừng lại.
- `http`: Instance Axios dùng chung cho toàn bộ dự án với `baseURL` cấu hình sẵn.

---

### 2.2 — Quản lý trạng thái Refresh & Hàng đợi

```typescript
let isRefreshing = false;
let failedQueue: QueueItem[] = [];
```

| Biến | Ý nghĩa |
|---|---|
| `isRefreshing` | Cờ trạng thái: `true` là đang có 1 tiến trình đi gọi API refresh token, `false` là không có. |
| `failedQueue` | Mảng chứa danh sách các request bị 401 đang "ngủ đông" để xếp hàng chờ token mới. |

```typescript
const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error); // Refresh thất bại → giải tán hàng đợi kèm lỗi
    } else if (token) {
      prom.resolve(token); // Refresh thành công → truyền token mới cho từng request
    }
  });
  failedQueue = []; // Làm rỗng hàng đợi
};
```

---

### 2.3 — Hàm xử lý Đăng xuất tập trung (`handleLogout`)

> 💡 **Điểm mới:** Thay vì viết lặp đi lặp lại việc xóa token và chuyển trang ở nhiều nơi, code mới gom thành 1 hàm duy nhất:

```typescript
const handleLogout = () => {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
};
```

**Tại sao cần đoạn check `window.location.pathname !== "/login"`?**
- Nếu người dùng vốn đang ở trang `/login` rồi (hoặc login thất bại), không cần reload/redirect lại trang `/login` nữa, tránh hiện tượng nhấp nháy màn hình không cần thiết.

---

### 2.4 — Request Interceptor (Gắn Token & Tương thích Axios v0 / v1)

```typescript
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
```

**Giải thích:**
- Tự động lấy `accessToken` từ `localStorage` và đính kèm vào header trước khi request bay đi.
- **Tương thích phiên bản:** Ở Axios v1+, `headers` là class `AxiosHeaders` có method `.set()`. Ở bản cũ hơn, `headers` là object thuần. Đoạn `if (config.headers?.set)` giúp code chạy bền bỉ trên mọi phiên bản Axios.

---

### 2.5 — Response Interceptor (Trái tim của hệ thống)

Phần này can thiệp vào kết quả trả về khi phát hiện lỗi **401 Unauthorized**.

#### Bước 1: Điều kiện kích hoạt Refresh Token

```typescript
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
```

**Tại sao phải lọc kỹ như vậy?**
1. `status === 401`: Chỉ xử lý khi token hết hạn.
2. `!originalRequest._retry`: Request này chưa từng thử refresh lần nào.
3. `!originalRequest.url?.includes("/auth/login")`: Nếu nhập sai mật khẩu lúc login, server trả 401 → Tuyệt đối **không** được đi refresh token!
4. `!originalRequest.url?.includes("/auth/refresh")`: Nếu chính request đi refresh cũng bị 401 (Refresh Token hết hạn) → Dừng ngay, nếu không sẽ gọi refresh vô hạn làm treo app!

---

#### Bước 2: Trường hợp 1 — Đã có request khác đang refresh (`isRefreshing === true`)

```typescript
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest._retry = true; // ⭐ ĐIỂM MỚI: Đánh dấu đã retry để chống lặp
            if (originalRequest.headers?.set) {
              originalRequest.headers.set("Authorization", `Bearer ${token}`);
            } else {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return http(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }
```

**Cách hoạt động:**
- Request này tạm thời bị "đóng băng" bằng một `Promise` chưa được giải quyết.
- Đẩy `{ resolve, reject }` vào `failedQueue`.
- Khi `processQueue` gọi `resolve(token mới)`:
  - Gán `_retry = true` (để nếu request này vẫn bị 401 lần nữa thì sẽ dừng hẳn, không tạo vòng lặp).
  - Cập nhật token mới vào header và gọi lại request: `return http(originalRequest)`.

---

#### Bước 3: Trường hợp 2 — Request ĐẦU TIÊN phát hiện 401

```typescript
      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem("refreshToken");

      if (!refreshToken) {
        isRefreshing = false;
        handleLogout();
        return Promise.reject(error);
      }
```

- Bật ngay `isRefreshing = true` để khóa các request đến sau, bắt chúng phải xếp hàng vào queue (Trường hợp 1).
- Nếu không tìm thấy `refreshToken` trong máy → gọi `handleLogout()` chuyển về trang đăng nhập.

---

#### Bước 4: Gọi API lấy Token mới (Refresh Token Rotation)

```typescript
      try {
        // Dùng axios thuần để không kích hoạt interceptor của http
        const res = await axios.post<{
          message: string;
          accessToken: string;
          refreshToken?: string; // ⭐ refreshToken có thể có hoặc không tùy backend
        }>(`${http.defaults.baseURL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = res.data;

        // Lưu token mới vào localStorage
        localStorage.setItem("accessToken", newAccessToken);
        if (newRefreshToken) {
          localStorage.setItem("refreshToken", newRefreshToken);
        }
```

> [!IMPORTANT]
> **Tại sao dùng `axios.post` thuần mà không dùng `http.post`?**
> Vì `http` gắn kèm interceptor. Nếu dùng `http.post` mà gặp lỗi 401, nó sẽ lại kích hoạt tiếp interceptor → sinh ra vòng lặp vô tận. Dùng `axios` thuần để đảm bảo request này chạy độc lập và "sạch sẽ".

---

#### Bước 5: Đánh thức hàng đợi & Gửi lại request ban đầu

```typescript
        // Đánh thức tất cả các request đang đợi trong queue với token mới
        processQueue(null, newAccessToken);

        // Gán token mới và gọi lại chính request ban đầu này
        if (originalRequest.headers?.set) {
          originalRequest.headers.set("Authorization", `Bearer ${newAccessToken}`);
        } else {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return http(originalRequest);
```

- `processQueue(null, newAccessToken)`: Đánh thức toàn bộ các request ở Trường hợp 1 đang nằm chờ trong queue.
- Gắn token mới vào chính request hiện tại và thực thi lại nó.

---

#### Bước 6: Xử lý khi Refresh Token thất bại

```typescript
      } catch (refreshError) {
        // Báo lỗi cho tất cả các request đang xếp hàng
        processQueue(refreshError, null);
        handleLogout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false; // Luôn luôn mở khóa cờ dù thành công hay thất bại
      }
    }

    return Promise.reject(error);
  }
);
```

- Nếu API refresh báo lỗi (ví dụ: Refresh Token hết hạn hoặc bị thu hồi):
  - Báo lỗi cho toàn bộ các request đang chờ trong queue bằng `processQueue(refreshError, null)`.
  - Gọi `handleLogout()` xóa sạch token và đá người dùng về `/login`.
- Khối `finally`: Luôn đảm bảo `isRefreshing = false` để hệ thống không bị treo ở trạng thái khóa.

---

## 📖 Phần 3: Sơ đồ luồng hoạt động tổng thể

```mermaid
flowchart TD
    A["Request API bị trả về lỗi 401"] --> B{"Là URL /auth/login\nhoặc /auth/refresh?"}
    B -->|Đúng| Z["Reject lỗi ngay\n(Không xử lý)"]
    B -->|Sai| C{"Đã _retry rồi?"}
    C -->|Đúng| Z
    C -->|Sai| D{"isRefreshing == true?\n(Đang có tiến trình refresh?)"}

    D -->|Đúng (TH1)| E["Đưa Promise vào failedQueue"]
    E --> F["💤 Nằm chờ..."]
    F --> G["processQueue đánh thức với token mới"]
    G --> H["Đánh dấu _retry = true\nGắn token mới vào header"]
    H --> I["Gửi lại request thành công ✅"]

    D -->|Sai (TH2)| J["Đánh dấu _retry = true\nBật isRefreshing = true"]
    J --> K{"Có refreshToken\ntrong localStorage?"}
    K -->|Không| L["Gọi handleLogout()\n→ Chuyển về /login"]
    K -->|Có| M["Dùng axios thuần gọi POST /auth/refresh"]

    M -->|Thành công| N["Lưu AccessToken (+ RefreshToken mới)"]
    N --> O["Gọi processQueue(null, tokenMới)\n(Đánh thức toàn bộ queue)"]
    O --> P["Gắn token mới vào request đầu tiên\n→ Gửi lại request ✅"]
    P --> Q["finally: isRefreshing = false"]

    M -->|Thất bại| R["Gọi processQueue(refreshError, null)\n(Hủy toàn bộ queue)"]
    R --> S["Gọi handleLogout()\n→ Chuyển về /login"]
    S --> Q
```

---

## 📖 Phần 4: Timeline minh họa nhiều request đồng thời

Giả sử bạn vào trang Dashboard, cùng lúc có 3 API được gọi:
1. `GET /products` (Sản phẩm)
2. `GET /cart` (Giỏ hàng)
3. `GET /notifications` (Thông báo)

Cả 3 đều gặp lúc Access Token vừa hết hạn:

| Thời điểm | Request | Trạng thái `isRefreshing` | Hành động thực hiện |
|---|---|---|---|
| **0ms** | `GET /products` bị 401 | `false` → chuyển thành `true` | Request đầu tiên! Bắt đầu gọi `POST /auth/refresh`. |
| **2ms** | `GET /cart` bị 401 | `true` | Thấy đang bận refresh → Xếp hàng vào `failedQueue`. |
| **4ms** | `GET /notifications` bị 401 | `true` | Thấy đang bận refresh → Tiếp tục xếp hàng vào `failedQueue`. |
| **300ms** | API Refresh trả về kết quả | `true` | Nhận `newAccessToken`. Lưu vào `localStorage`. |
| **301ms** | Kích hoạt `processQueue` | `true` | Đánh thức cả `/cart` và `/notifications`, cấp `newAccessToken` và đánh dấu `_retry = true`. |
| **302ms** | Cả 3 requests retry | `true` → `false` | Cả 3 request tự động gửi lại với token mới và nhận dữ liệu 200 OK. |

> 🎉 **Kết quả:** User vẫn lướt web trơn tru, không hề nhận ra token vừa hết hạn, không bị văng ra màn hình đăng nhập, và server chỉ tốn đúng **1 lần** gọi refresh token duy nhất!
