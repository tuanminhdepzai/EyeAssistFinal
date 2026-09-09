# HƯỚNG DẪN LẬP TRÌNH BÀI BẢN VÀ LỘ TRÌNH 36 NGÀY PHÁT TRIỂN DỰ ÁN EYEASSIST
**Dự án:** Hệ Thống Trợ Lý Hỗ Trợ Tương Tác Bằng Ánh Mắt, Máy Tính Casio Virtual & Mô Hình Bàn Tay Vật Lý 3D  
**Tác giả:** Nguyễn Tuấn Minh  
**Công nghệ:** MediaPipe FaceLandmarker, Three.js, Firebase Auth, Web Speech API, Vite, ES Modules  
**Đường dẫn file Word trích xuất:** `d:\TIN\EYEASSIST\eye\docs\EyeAssist_36Days_Development_Roadmap_and_Guide.docx`

---

## PHẦN 1: TỔNG QUAN KIẾN TRÚC & CÁCH LẬP TRÌNH DỰ ÁN EYEASSIST

EyeAssist là một ứng dụng web đa chức năng đột phá kết hợp trí tuệ nhân tạo (AI Computer Vision), đồ họa không gian 3D tương tác và xác thực đám mây. Để lập trình dự án này một cách chuyên nghiệp, hệ thống được chia thành 5 module cốt lõi liên kết chặt chẽ:

1. **Core Computer Vision & Eye-Tracking Engine (Xử lý Ánh mắt):**
   - Sử dụng Google MediaPipe Face Landmarker để nhận diện 478 điểm mốc trên khuôn mặt theo thời gian thực (60 FPS).
   - Thuật toán tính toán Iris Center (điểm 468-477), tính góc Pitch/Yaw của đầu để bù sai số nghiêng đầu.
   - Áp dụng bộ lọc Exponential Moving Average (EMA) kết hợp Kalman Filter để giảm nhiễu rung lắc tự nhiên của mắt.

2. **Magnetic Snap & Dwell Blink Detection (Kích hoạt Thao tác):**
   - Thuật toán Hút nam châm (Magnetic Snap) tự động kéo con trỏ mắt vào tâm nút gần nhất với vùng đệm Hysteresis ($R=40px$).
   - Thuật toán Eye Aspect Ratio (EAR) đo khoảng cách mí mắt để phân loại: Nháy mắt tự nhiên (Natural Blink), Nháy mắt chủ đích (Intentional Blink) và Vòng tiến trình nhìn dừng (Dwell Timer ~0.45s).

3. **Virtual Casio fx-580VN X Calculator Engine (Máy tính ảo):**
   - Giao diện mô phỏng 100% bàn phím Casio fx-580VN X chuẩn.
   - Hệ thống parser biểu thức toán học hỗ trợ Mode A (Giải phương trình bậc 2, bậc 3) và Mode 9 (Giải hệ 2, 3 ẩn), phím biến $x$, tự động định dạng phân số và căn thức.

4. **3D Physics Hand Solver Engine (Mô hình Bàn tay 3D):**
   - Sử dụng Three.js để dựng phối cảnh 3D WebGL.
   - Tải mô hình bàn tay 3D (GLTF Rigged), tự động uốn các khớp xương theo quy tắc Bàn tay trái (Lực Ampe $F = I \times B$), vẽ mũi tên vectơ 3D ($B, I, F$) và tích hợp chế độ xoay camera bằng ánh mắt mượt mà (Spherical LERP $\alpha=0.09$).

5. **Voice Command & Firebase Authentication (Giọng nói & Bảo mật):**
   - Tích hợp Web Speech API nhận diện khẩu lệnh tiếng Việt (*"Mở bàn tay 3D"*, *"Mở Casio ảo"*, *"Xoay bàn tay"*, *"Reset camera"*).
   - Hệ thống bảo mật Firebase Auth bắt buộc Đăng nhập/Đăng ký trước khi dùng web và hoãn yêu cầu quyền Camera/Mic đến sau khi xác thực thành công.

---

## PHẦN 2: TÀI LIỆU HỌC TẬP, NGUỒN TÀI NGUYÊN & THƯ VIỆN CẦN THIẾT

| Tên Tài Liệu / Công Nghệ | Địa Chỉ / Trang Chủ | Mục Đích Sử Dụng Trong Dự Án |
| :--- | :--- | :--- |
| **Google MediaPipe Docs** | [ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) | Tài liệu tích hợp Face Mesh 478 tọa độ mốc khuôn mặt và mống mắt (Iris). |
| **Three.js Documentation** | [threejs.org/docs](https://threejs.org/docs/) | Hướng dẫn cài đặt Scene, PerspectiveCamera, WebGLRenderer, GLTFLoader và OrbitControls. |
| **Firebase Auth SDK v10+** | [firebase.google.com/docs/auth/web/start](https://firebase.google.com/docs/auth/web/start) | Tài liệu đăng nhập Email/Password và Google Sign-In Popup. |
| **MDN Web Speech API Guide** | [developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) | Tài liệu nhận diện giọng nói tiếng Việt bằng SpeechRecognition. |
| **Casio Education Manual** | Trang chủ Casio Education | Thông số quy chuẩn giao diện và thuật toán hiển thị của dòng máy tính Casio fx-580VN X. |
| **Vite Build Tool** | [vitejs.dev/guide](https://vitejs.dev/guide/) | Công cụ đóng gói ứng dụng web hiện đại ES Module và môi trường dev server 60 FPS. |

---

## PHẦN 3: LỘ TRÌNH LẬP TRÌNH CHI TIẾT 36 NGÀY (DAY-BY-DAY ROADMAP)

### GIAI ĐOẠN 1: KHỞI TẠO DỰ ÁN & THIẾT KẾ GIAO DIỆN CHUẨN (NGÀY 1 - NGÀY 6)
- **Ngày 1:** Khởi tạo môi trường lập trình (Node.js v18+, VS Code, Git). Tạo project với Vite `npm create vite@latest eye -- --template vanilla`. Cài đặt Three.js, MediaPipe FaceLandmarker, Firebase SDK. *(Tool: Node.js Docs, Vite Guide)*
- **Ngày 2:** Xây dựng Design System & CSS Variables trong `src/styles/base.css`. Định nghĩa hệ thống màu Dark Mode, Glassmorphism, CSS variables cho font Roboto/Inter. *(Tool: Modern CSS Tricks, Google Fonts)*
- **Ngày 3:** Thiết kế khung HTML tổng thể (`index.html`). Tạo Topbar, Sidebar menu trái, Tab máy tính Casio, Tab bàn tay 3D và khung Camera Preview. *(Tool: HTML5 Standards)*
- **Ngày 4:** Xây dựng Modal Đăng nhập / Đăng ký phủ toàn màn hình (Modal Overlay). Thiết kế hiệu ứng mờ kính (Glassmorphism) và nút đóng SVG sắc nét. *(Tool: UI/UX Glassmorphic Patterns)*
- **Ngày 5:** Thiết kế cấu trúc mã nguồn ES Modules (`src/main.js`, `src/auth/`, `src/modules/`, `src/engine/`). *(Tool: JS ES Modules Spec)*
- **Ngày 6:** Thiết lập Vercel & GitHub CI/CD Pipeline. Kết nối Vercel tự động deploy khi push commit. Cấu hình `vercel.json` hỗ trợ `.wasm` và `.glb`. *(Tool: Vercel Deployment Docs)*

### GIAI ĐOẠN 2: THIẾT LẬP AI EYE-TRACKING & COMPUTER VISION (NGÀY 7 - NGÀY 12)
- **Ngày 7:** Tích hợp MediaPipe Face Landmarker. Khởi động webcam và nhận diện 478 điểm mốc khuôn mặt tốc độ 60 FPS. *(Tool: MediaPipe Vision Guide)*
- **Ngày 8:** Tính toán tọa độ con trỏ Mống mắt (Iris Center điểm 468-477). Áp dụng phép chiếu tọa độ 2D từ khuôn mặt lên màn hình máy tính. *(Tool: Computer Vision Math)*
- **Ngày 9:** Thuật toán bù nghiêng đầu (Pitch/Yaw Compensation) trong `EARCalculator.js`. Tính góc nghiêng để bù sai số khi cúi/ngửa mặt. *(Tool: Head Pose Estimation Docs)*
- **Ngày 10:** Bộ lọc mượt con trỏ (Kalman & EMA Filter) loại bỏ hiện tượng rung giật tự nhiên của mắt. *(Tool: Signal Processing Filtering)*
- **Ngày 11:** Thuật toán Hút nam châm (Magnetic Snap) kéo con trỏ mắt vào tâm nút trong bán kính $R=40px$ với vùng đệm Hysteresis. *(Tool: Eye Tracking Interaction Patterns)*
- **Ngày 12:** Thuật toán EAR Nháy mắt & Dwell Timer (~0.45s) phân loại nháy tự nhiên vs chủ đích. Tích hợp vòng đếm Dwell Progress Ring. *(Tool: EAR Blink Detection Papers)*

### GIAI ĐOẠN 3: LẬP TRÌNH MÁY TÍNH VẢO CASIO FX-580VN X (NGÀY 13 - NGÀY 18)
- **Ngày 13:** Thiết kế ma trận phím Casio fx-580VN X trong HTML/CSS. Màn hình LCD 2 dòng (công thức & kết quả). *(Tool: Casio User Guide)*
- **Ngày 14:** Styling phím bấm đen/xám, thay ký tự méo bằng `<i>x</i>` chuẩn Roboto/Arial và icon SVG đối xứng. *(Tool: CSS Grid & Flexbox)*
- **Ngày 15:** Xây dựng Bộ xử lý biểu thức (Expression Parser) phân tích phép tính cộng, trừ, nhân, chia, lũy thừa, phân số, căn thức. *(Tool: Data Structures & Algorithms)*
- **Ngày 16:** Lập trình Mode A (Giải phương trình bậc 2 $ax^2+bx+c=0$ và bậc 3). Biện luận nghiệm thực và nghiệm phức. *(Tool: Computational Math)*
- **Ngày 17:** Lập trình Mode 9 (Giải Hệ 2 và 3 ẩn bậc nhất) bằng định thức Gauss/Cramer. *(Tool: Linear Algebra Algorithms)*
- **Ngày 18:** Tích hợp Mắt điều khiển toàn bộ 50+ phím Casio. Lập trình phím AC Reset xóa sạch màn hình. *(Tool: Interactive Web Dev)*

### GIAI ĐOẠN 4: LẬP TRÌNH MÔ HÌNH BÀN TAY 3D & VẬT LÝ (NGÀY 19 - NGÀY 24)
- **Ngày 19:** Khởi tạo Three.js Scene, PerspectiveCamera, WebGLRenderer hỗ trợ Antialias và PCFSoftShadowMap. *(Tool: Three.js Scene Basics)*
- **Ngày 20:** Tải & Rigging mô hình Bàn tay 3D GLTF (`hand.gltf`). Ánh xạ xương (`IndexRoot`, `MiddleRoot`, `ThumbRoot`) và uốn khớp. *(Tool: Three.js GLTFLoader)*
- **Ngày 21:** Thuật toán Quy tắc Bàn tay trái (Lực Ampe $F = I \times B$). Sử dụng phép tích có hướng (Cross Product) tính vectơ. *(Tool: Physics Mechanics & Vectors)*
- **Ngày 22:** Tạo Mũi tên Vectơ 3D ($B, I, F$) và tự động xoay lòng bàn tay hứng đường sức từ $B$. *(Tool: Three.js Vector3 & Quaternion)*
- **Ngày 23:** Xây dựng Bài tập Trắc nghiệm 3D Tương tác 3 bước (Chọn quy tắc -> Chọn dữ kiện -> Làm bài tập). *(Tool: Educational Software Design)*
- **Ngày 24:** Lập trình Xoay 3D bằng Ánh mắt (Spherical LERP $\alpha=0.09$) camera 3D xoay lướt mượt mà bám sát tốc độ mắt 60 FPS. *(Tool: 3D Spherical Coordinates)*

### GIAI ĐOẠN 5: TÍCH HỢP GIỌNG NÓI & BẢO MẬT FIREBASE (NGÀY 25 - NGÀY 30)
- **Ngày 25:** Khởi tạo Firebase Console, bật Email/Password và Google Sign-In, thêm tên miền Vercel vào Authorized Domains. *(Tool: Firebase Console Setup)*
- **Ngày 26:** Viết module Xác thực `src/auth/auth.js` (`loginWithEmail`, `loginWithGoogle`, `logoutUser`) và bộ việt hóa thông báo lỗi. *(Tool: Firebase Web Auth API)*
- **Ngày 27:** Bảo mật luồng cấp quyền: hoãn yêu cầu Camera/Mic đến sau khi đăng nhập thành công. *(Tool: Browser Security Policies)*
- **Ngày 28:** Viết module Giọng nói `VoiceHandler.js` tích hợp Web Speech API (`vi-VN`), lọc nhiễu môi trường. *(Tool: MDN Speech Recognition API)*
- **Ngày 29:** Lập trình khẩu lệnh tiếng Việt ("Mở bàn tay 3D", "Mở Casio ảo", "Xoay bàn tay", "Reset camera"). *(Tool: Natural Language Parsing)*
- **Ngày 30:** Xây dựng FusionEngine hợp nhất 3 nguồn dữ liệu: Gaze + Blink + Voice thành 1 luồng điều khiển đồng bộ. *(Tool: Multimodal Fusion Systems)*

### GIAI ĐOẠN 6: TỐI ƯU GIAO DIỆN, THỬ NGHIỆM & HOÀN THIỆN (NGÀY 31 - NGÀY 36)
- **Ngày 31:** Tối ưu hóa cỡ chữ các ô hướng dẫn Casio thêm +3px (`16.5px` tiêu đề, `14.5px` nội dung), mở rộng chiều rộng cột. *(Tool: UI/UX Accessibility)*
- **Ngày 32:** Tối ưu Giao diện ô chọn dữ kiện Bàn tay 3D (phóng to chữ `1.02rem`, nâng chiều cao nút lên `58px`). *(Tool: Eye Gaze Target Sizing)*
- **Ngày 33:** Thông minh hóa bỏ qua nháy mắt trên 3D Canvas (`isInside3DViewportCanvas`), giúp chớp mắt tự nhiên không bị khựng. *(Tool: User Experience Smoothing)*
- **Ngày 34:** Tối ưu hóa hiệu năng & bộ nhớ, dọn dẹp Three.js textures, duy trì 60 FPS ổn định. *(Tool: Web Performance Optimization)*
- **Ngày 35:** Kiểm thử toàn diện đa thiết bị & trình duyệt (Chrome, Edge, Safari) ở các điều kiện ánh sáng khác nhau. *(Tool: Software QA & Testing)*
- **Ngày 36:** Đóng gói sản phẩm (`npm run build`), kiểm tra deploy Vercel, commit Git sạch và xuất file tài liệu Word. *(Tool: Project Release)*

---

## PHẦN 4: QUY TRÌNH KIỂM THỬ VÀ VẬN HÀNH ỨNG DỤNG

1. **Khởi động môi trường Dev:**  
   Chạy lệnh `npm run dev` tại thư mục dự án để mở môi trường localhost cổng 5173.
2. **Đăng ký / Đăng nhập tài khoản:**  
   Thực hiện tạo tài khoản mới bằng Email hoặc chọn "Tiếp tục với Google".
3. **Cấp quyền Camera & Micro:**  
   Sau khi đăng nhập thành công, chấp nhận thông báo yêu cầu cấp quyền Camera (Eye-Tracking) và Micro (Giọng nói).
4. **Kiểm thử Máy tính Casio ảo:**  
   Nhìn vào các phím số/phép tính, thử nghiệm Mode A (Phương trình) và Mode 9 (Hệ phương trình).
5. **Kiểm thử Mô hình 3D Bàn tay:**  
   Sang Tab 3D, chọn TH1/TH2/TH3, thử nghiệm uốn xương bàn tay theo lực Ampe và xoay camera 3D mượt mà bằng ánh mắt.
