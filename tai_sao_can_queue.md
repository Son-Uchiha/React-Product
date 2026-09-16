# Tại sao phải dùng Queue khi Refresh Token?

> Giải thích cực kỳ chi tiết cho người mới, với ví dụ thực tế.

---

## 🏪 Ví dụ ngoài đời: Quán cà phê

Bạn đến quán cà phê, được phát 1 **thẻ thành viên** (Access Token) để được giảm giá. Thẻ có hạn **15 phút**.

Bạn cũng có 1 **phiếu đổi thẻ** (Refresh Token) — khi thẻ hết hạn, đưa phiếu này để lấy thẻ mới.

### ⚠️ Quy tắc quan trọng: Mỗi phiếu đổi thẻ CHỈ DÙNG ĐƯỢC 1 LẦN

Sau khi dùng phiếu đổi thẻ → quán huỷ phiếu cũ → cấp phiếu mới. Đây chính là **Refresh Token Rotation** — tăng bảo mật, vì nếu ai đó lấy cắp phiếu cũ thì cũng không dùng được.

---

## 😱 Vấn đề: Không có Queue thì sao?

Giả sử trang Dashboard của bạn load **3 API cùng lúc**:

```
GET /products        → Lấy danh sách sản phẩm
GET /cart            → Lấy giỏ hàng
GET /notifications   → Lấy thông báo
```

Access Token vừa hết hạn. Cả 3 request đều bị server trả về **401**.

### ❌ Kịch bản KHÔNG CÓ Queue:

```
Thời gian     Sự kiện
─────────────────────────────────────────────────────────────
  0ms    GET /products bị 401
              → Lấy Refresh Token "RT-001" ra gọi refresh
              
  1ms    GET /cart bị 401
              → Cũng lấy Refresh Token "RT-001" ra gọi refresh
              
  2ms    GET /notifications bị 401
              → Cũng lấy Refresh Token "RT-001" ra gọi refresh

─── 3 request refresh chạy ĐỒ̀NG THỜI đến server ───

 100ms   Request refresh của /products đến server TRƯỚC
              → Server kiểm tra "RT-001" → HỢP LỆ ✅
              → Server HUỶ "RT-001", cấp token mới:
                 Access Token = "AT-new"
                 Refresh Token = "RT-002"
              → Trả về thành công

 101ms   Request refresh của /cart đến server
              → Server kiểm tra "RT-001" → ĐÃ BỊ HUỶ ❌
              → Server trả lỗi: "Refresh token không hợp lệ"
              → THẤT BẠI! → Đá user về trang login 😰

 102ms   Request refresh của /notifications đến server
              → Server kiểm tra "RT-001" → ĐÃ BỊ HUỶ ❌
              → THẤT BẠI! → Đá user về trang login 😰
```

> [!CAUTION]
> **Kết quả**: User đang xem Dashboard bình thường → bất ngờ bị đá về trang Login! Dù Refresh Token vẫn còn hạn. Tệ hơn nữa — có thể xảy ra **race condition** khiến token mới cũng bị ghi đè sai.

### Nói dễ hiểu:
> 3 người cùng cầm **1 phiếu đổi thẻ** chạy đến quầy. Người đầu đổi xong → phiếu bị huỷ → 2 người sau đưa phiếu cũ → quán từ chối → tất cả bị đuổi ra ngoài!

---

## ✅ Kịch bản CÓ Queue:

```
Thời gian     Sự kiện
─────────────────────────────────────────────────────────────
  0ms    GET /products bị 401
              → Kiểm tra: isRefreshing = false
              → "Tôi là người ĐẦU TIÊN phát hiện!"
              → Đặt isRefreshing = true  🔒
              → Bắt đầu gọi refresh với "RT-001"
              
  1ms    GET /cart bị 401
              → Kiểm tra: isRefreshing = true
              → "Có người đang refresh rồi, tôi XẾP HÀNG CHỜ"
              → Đẩy Promise vào failedQueue
              → 💤 Chờ...
              
  2ms    GET /notifications bị 401
              → Kiểm tra: isRefreshing = true
              → "Cũng xếp hàng luôn"
              → Đẩy Promise vào failedQueue
              → 💤 Chờ...

─── CHỈ 1 request refresh duy nhất đến server ───

 500ms   Refresh thành công!
              → Server HUỶ "RT-001", cấp:
                 Access Token = "AT-new"
                 Refresh Token = "RT-002"
              → Lưu vào localStorage
              → processQueue("AT-new") → ĐÁNH THỨC hàng đợi
              
 501ms   GET /cart THỨC DẬY
              → Nhận "AT-new" → Gắn vào header → Gửi lại → ✅
              
 502ms   GET /notifications THỨC DẬY
              → Nhận "AT-new" → Gắn vào header → Gửi lại → ✅
              
 503ms   GET /products cũng retry
              → Gắn "AT-new" → Gửi lại → ✅
              
 504ms   isRefreshing = false  🔓
```

> [!TIP]
> **Kết quả**: User không hề biết chuyện gì xảy ra. Dashboard load bình thường. Chỉ hơi chậm hơn 1 chút (thêm ~500ms cho refresh).

### Nói dễ hiểu:
> 3 người cùng cần đổi thẻ. Người đầu tiên đi đổi, 2 người sau **ngồi chờ**. Đổi xong → chia sẻ thẻ mới cho cả 3 → ai cũng vui!

---

## 🔬 Queue hoạt động như thế nào trong code?

Phần khó hiểu nhất cho người mới là đoạn **Promise + Queue**. Mình giải thích từng bước:

### Bước 1: Request B bị 401, thấy `isRefreshing = true`

```typescript
if (isRefreshing) {
  // Vào đây!
}
```

### Bước 2: Tạo 1 Promise và "treo" nó lại

```typescript
return new Promise<string>((resolve, reject) => {
  failedQueue.push({ resolve, reject });
});
```

**Đoạn này làm gì?**

Bình thường khi bạn tạo Promise, bạn gọi `resolve()` ngay bên trong:

```typescript
// Promise bình thường → resolve ngay
const promise = new Promise((resolve) => {
  resolve("xong!");   // Gọi ngay
});
```

Nhưng ở đây, chúng ta **KHÔNG gọi resolve ngay**. Thay vào đó, chúng ta **lưu hàm resolve vào mảng**:

```typescript
// Promise bị "treo" → chưa resolve
const promise = new Promise((resolve, reject) => {
  failedQueue.push({ resolve, reject });   // Lưu lại, không gọi
});
// promise đang ở trạng thái "pending" (chờ)
// Code dừng ở đây, KHÔNG chạy tiếp .then()
```

Hãy tưởng tượng như thế này:

```
Promise giống như 1 HỘP QUÀ:
  - Khi chưa resolve → hộp ĐÓNG → .then() không chạy
  - Khi resolve(token) → hộp MỞ → .then(token => ...) chạy
  - Khi reject(error) → hộp VỠ → .catch(error => ...) chạy

Chúng ta lưu "chìa khoá mở hộp" (resolve) vào failedQueue
→ Ai có chìa khoá thì lúc nào muốn mở cũng được
```

### Bước 3: Một lúc sau... Refresh thành công!

```typescript
// Hàm processQueue được gọi:
const processQueue = (error, token) => {
  failedQueue.forEach((prom) => {
    if (token) {
      prom.resolve(token);   // ← MỞ HỘP! Gọi resolve với token mới
    }
  });
  failedQueue = [];
};
```

### Bước 4: Promise được resolve → `.then()` chạy

```typescript
return new Promise<string>((resolve, reject) => {
  failedQueue.push({ resolve, reject });
})
  .then((token) => {
    // ← BÂY GIỜ MỚI CHẠY, sau khi processQueue gọi resolve(token)
    // token = "AT-new" (token mới nhận từ processQueue)
    originalRequest.headers.Authorization = `Bearer ${token}`;
    return http(originalRequest);   // Gửi lại request với token mới
  });
```

### Tóm lại bằng sơ đồ:

```
Request B bị 401
      │
      ▼
isRefreshing = true? ──── CÓ
      │
      ▼
Tạo Promise (treo, chưa resolve)
      │
      ▼
Đẩy { resolve, reject } vào failedQueue
      │
      ▼
💤 CHỜ... (Promise đang pending)
      │
      │         ← Trong lúc này, Request A đang gọi refresh...
      │
      │         ← Refresh xong! processQueue(null, "AT-new")
      │
      ▼
resolve("AT-new") được gọi! → Promise MỞ
      │
      ▼
.then((token) => ...)  ← token = "AT-new"
      │
      ▼
Gắn "AT-new" vào header
      │
      ▼
http(originalRequest) → Gửi lại request B ✅
```

---

## ❓ Câu hỏi thường gặp

### Q: Nếu không dùng Refresh Token Rotation thì có cần Queue không?

**Vẫn nên dùng.** Vì:
- Gửi 5 request refresh cùng lúc = lãng phí bandwidth
- Server phải xử lý 5 request thay vì 1
- Có thể gây ra race condition khi lưu token vào localStorage

### Q: `isRefreshing` là gì? Tại sao cần?

`isRefreshing` giống như **biển báo "Đang sửa đường"**:
- `false` = đường thông, ai cũng đi được (request đầu tiên sẽ đi refresh)
- `true` = đang sửa đường, mọi người xếp hàng chờ (các request sau vào queue)

### Q: Tại sao dùng `let` chứ không phải `const`?

```typescript
let isRefreshing = false;      // Cần thay đổi giá trị → dùng let
let failedQueue: QueueItem[] = [];  // Cần gán lại = [] → dùng let
```

`const` không cho phép gán lại giá trị. Mà `isRefreshing` cần chuyển qua lại giữa `true`/`false`, `failedQueue` cần gán lại thành `[]` khi xoá sạch → phải dùng `let`.

### Q: `finally` có tác dụng gì?

```typescript
try {
  // Refresh thành công → chạy xong try
} catch {
  // Refresh thất bại → chạy catch
} finally {
  isRefreshing = false;  // DÙ thành công hay thất bại → LUÔN chạy
}
```

Nếu không có `finally` mà refresh thất bại, `isRefreshing` có thể bị kẹt ở `true` mãi mãi → tất cả request sau này đều vào queue → **không ai** đi refresh → **app treo!**

---

## 🎯 Tổng kết: 1 hình ảnh duy nhất

```
Không có Queue:                    Có Queue:
                                   
  401 → Refresh ─┐                   401 → Refresh ──── Server
  401 → Refresh ─┤─── Server         401 → Chờ... ─┐
  401 → Refresh ─┘                   401 → Chờ... ─┤
                                                    │
  3 lần gọi refresh                   Token mới! ◄──┘
  2 lần thất bại ❌                   
  User bị đá về login 😰              Tất cả retry ✅
                                      User không biết gì 😊
```
