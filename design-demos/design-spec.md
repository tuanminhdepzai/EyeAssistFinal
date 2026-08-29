# EyeAssist STEM — Design Spec cho nâng cấp UI/UX (input chung cho 3 hướng)

Ngày: 2026-08-28 · Người dùng cuối: học sinh khuyết tật vận động, điều khiển bằng mắt + giọng nói.

## 1. Sản phẩm là gì
EyeAssist STEM là web app hỗ trợ học tập: theo dõi ánh mắt qua webcam (MediaPipe Face Mesh), biến gaze thành con trỏ, nháy mắt thành click (có vòng xác nhận dwell-blink), kèm điều khiển giọng nói tiếng Việt. Hai công cụ học chính: máy tính Casio fx-580VN X ảo và module "Bàn tay 3D" học quy tắc bàn tay trái (Three.js). Flow hiệu chỉnh: lưới 9 điểm hoặc bám đuổi ngôi sao.

## 2. Đối tượng & bối cảnh dùng
- Học sinh khuyết tật vận động, dùng mắt làm phương thức nhập liệu CHÍNH, phiên dài 30–60 phút.
- Giáo viên/người thân hỗ trợ cài đặt. Laptop/desktop có webcam, 1366×768 → 1920×1080, khoảng cách ngồi 40–60 cm.
- Độ chính xác gaze thực tế ~1–2° → UI phải "tha thứ": target lớn, khoảng cách rộng, không dồn cụm phần tử nhỏ.
- Màn hình tối/giảm chói giúp dễ chịu trong phiên dài, nhưng phải là dark có chủ đích (không phải dark-navy + neon cyan mặc định kiểu AI).

## 3. Thông điệp cốt lõi
"Người bạn đồng hành học STEM bằng ánh mắt — đáng tin như thiết bị y tế, gần gũi như dụng cụ lớp học."

## 4. Cảm xúc & khí chất
Tin cậy · điềm tĩnh · chính xác · thân thiện · không đe dọa. Tránh cảm giác "tech demo" (neon tràn lan) và tránh cảm giác "bệnh viện" (lạnh, trắng toát vô trùng).

## 5. Output format & kích thước (BẮT BUỘC — mọi hướng thống nhất)
- Mockup full-screen app desktop, viewport thiết kế **1440×900** (phải còn đẹp ở 1366×768).
- Mỗi hướng thể hiện ĐỦ 2 bề mặt, screenshot riêng:
  1. Tab **Casio** active: nav + sân khấu chứa máy tính.
  2. Tab **Hiệu chỉnh** active: nav + setup card đầy đủ.
- File HTML đơn, thuần HTML/CSS (tối đa ~10 dòng JS vanilla để đọc `?tab=casio|cal` và bật class).
- Đặt tại `design-demos/direction-N-<slug>.html`, screenshot `design-demos/direction-N-<tab>.png`.

## 6. Ràng buộc cứng (mọi hướng phải tuân thủ)
1. **Không đổi ID/class mà JS đang bind** — đây là redesign CSS-first trên app thật (liệt kê trong §9).
2. **Giữ nguyên độ trung thực phần cứng Casio fx-580VN X** (thân xám đen, LCD xanh lá, layout phím). Chỉ thiết kế: nền/sân khấu quanh máy, viền bóng đổ, trạng thái gaze-hover trên phím.
3. **Gaze-first (từ research WCAG 2.2):**
   - Mọi phần tử tương tác ≥ 44×44px; khoảng cách giữa các target ≥ 8px.
   - Trạng thái gaze-hover phải thấy rõ: vòng outline + giãn nhẹ (scale ~1.03), không chỉ đổi màu.
   - Không biến hover thành click (Midas touch): kích hoạt luôn qua xác nhận dwell/blink; mockup phải cho thấy vòng xác nhận (dwell ring) quanh con trỏ.
   - Indicator trạng thái: màu + nhãn/hình dạng (không chỉ màu — ví dụ dot phải kèm chữ "Cam/Gaze/Mic").
   - Chữ body ≥ 14px; contrast chữ ≥ 4.5:1; thành phần UI ≥ 3:1 (WCAG 1.4.11).
   - Có khai báo `@media (prefers-reduced-motion: reduce)`; transition chính 120–200ms.
4. **Font có subset tiếng Việt đầy đủ** (Google Fonts).
5. **Anti-slop:** không gradient tím; không dùng emoji làm icon chrome (thay bằng inline SVG stroke đơn giản: mắt, máy tính, bàn tay, hồng tâm, mic); không card viền-trái-màu làm cảnh; số liệu metric phải là số thật của app (92%, 88%, Mode A), không bịa thêm stats.

## 7. Nội dung thật (3 hướng dùng ĐÚNG nội dung này, không bịa thêm)
- **Loading screen:** tiêu đề "EyeAssist STEM", phụ đề "Đang khởi động hệ thống...", trạng thái "Đang tải MediaPipe...", thanh tiến trình.
- **Navigation:** brand "EyeAssist STEM" (icon mắt SVG); 3 tab: "Casio Ảo", "Bàn Tay 3D", "Hiệu chỉnh"; cụm trạng thái: Camera · Gaze · Voice (dot + nhãn) + nút mic.
- **Góc camera preview** (bottom-left, 160×120): video + overlay + "24 FPS" + dòng thống kê nháy.
- **Calibration setup card:**
  - Badge: "TỐI ƯU ÁNH MẮT" (kèm icon hồng tâm SVG, không dùng emoji 🎯)
  - Tiêu đề: "Hiệu Chỉnh Điểm Nhìn & Nháy Mắt"
  - Mô tả: "Hệ thống sẽ học cấu trúc mắt và góc nhìn của bạn để con trỏ di chuyển chính xác và mượt mà nhất."
  - Checklist 3 mục: (1) Khoảng cách ngồi — Cách màn hình khoảng 40–60 cm; (2) Ánh sáng môi trường — Đủ sáng, tránh ngược sáng từ sau lưng; (3) Tư thế khuôn mặt — Giữ đầu thẳng tự nhiên, hướng về camera.
  - Chọn phương thức (radio card): "Lưới 9 Điểm (Chuẩn Khoa Học)" — mô tả "Nhìn dừng vào 9 điểm cố định theo nhịp vòng tròn co lại (Khuyên dùng)"; và "Bám Đuổi Ngôi Sao (Smooth Pursuit)" — mô tả "Nhìn theo ngôi sao chuyển động mềm mại + thử nghiệm nháy mắt trái/phải".
  - Preview ánh mắt realtime (canvas 200×150, nền tối, chấm gaze xanh).
  - Nút: "Bắt đầu hiệu chỉnh" (primary) + "Bỏ qua (Dùng mặc định)" (secondary).
- **Metric kết quả (nếu hướng nào khoe):** Độ chính xác 92% · Độ ổn định 88% · Chế độ đề xuất Mode A (Chớp 2 mắt).
- **Casio stage:** máy tính Casio ở giữa, nền/sân khấu do hướng thiết kế quyết định; con trỏ gaze là vòng tròn có dwell ring.

## 8. Visual motif (hạt giống form — bắt buộc trả lời trong mỗi hướng)
**"Vòng xác nhận" (confirmation ring)** — vòng dwell-blink quanh con trỏ là element ĐỘC QUYỀN của sản phẩm này. Mỗi hướng phải biến nó thành motif xuyên suốt: loading spinner, progress bar calibration, hover state, metric ring — cùng một ngôn ngữ hình học (độ dày vòng, cách vòng được "điền đầy"). Ghi rõ trong file HTML: motif lấy từ đâu trong sản phẩm.

## 9. ID/class JS đang bind (KHÔNG đổi tên — chỉ restyle)
Loading: `loading-screen, loading-fill, loading-status` · Nav: `top-nav, .nav-tab[data-tab], cam-status, gaze-status, voice-status, btn-mic-toggle` · Cam: `cam-preview, webcam, overlay, fps-counter, blink-stats` · Calibration: `cal-setup-card, cal-workspace-card, calibration-result, calibration-canvas, cal-gaze-preview, cal-progress-fill, cal-phase-text, cal-sample-count, cal-metric-acc, cal-metric-stab, cal-metric-mode, btn-start-calibration, btn-skip-calibration, btn-cancel-calibration, btn-test-calibration, btn-apply-calibration, btn-restart-calibration, .method-card, hit-rate-grid` · Casio: `casio-app, calculator, .calculator-wrapper, lcd, screen-input, screen-output, gaze-overlay, gaze-cursor, [data-key]` · Hand: `hand-sidebar, hand-viewport, hand-loading, .th-card, .step-node, .quiz-opt, .stem-select, .btn-next, .btn-prev, .tb` · Khác: `voice-feedback, analytics-panel, gaze-cursor`.

## 10. Hình ảnh
Sản phẩm công cụ → KHÔNG cần ảnh stock. Mọi iconography là inline SVG. Không vẽ SVG minh hoạ nhân vật/cảnh.

## 11. Tiêu chí chấm khi so sánh 3 hướng
(a) Gaze-target rõ ràng và feedback xác nhận dễ hiểu; (b) khí chất đúng §4; (c) typography tiếng Việt đẹp; (d) layout skeleton khác nhau thật sự; (e) không slop (§6.5).