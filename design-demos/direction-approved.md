# Direction Approved — EyeAssist STEM UI Redesign

Ngày: 2026-08-28 · Gate: ba hướng thật đã trưng bày, user tự chọn (không tự chọn thay).

## Các phiên bản đã trưng bày
1. 🧠 **Hướng Designer** — Microsoft Inclusive Design (Kat Holmes): target ≥54px, feedback kép, calm warm dark, Be Vietnam Pro.
   - File: `design-demos/direction-designer.html` · Screenshot: `design-demos/direction-designer.png`
2. 🏆 **Hướng Benchmark** — Tobii Dynavox (AAC eye-tracking, xác minh qua Wikipedia): Fitzgerald Key color coding, rail dọc thiết bị, dwell-ring motif, palette than nâu + ngà ấm.
   - File: `design-demos/direction-benchmark.html` · Screenshot: `design-demos/direction-benchmark.png`
3. 🎲 **Hướng Roulette** — Instrument Panel (fallback minh bạch do `references/design-styles.md` không tồn tại trên máy; ghi chú trong file HTML): nền than ấm, bezel hairline, phosphor-green + signal-amber, readout mono.
   - File: `design-demos/direction-roulette.html` · Screenshot: `design-demos/direction-roulette.png`

## Lựa chọn của user (nguyên văn từ AskUserQuestion)
- Câu hỏi "Bạn chọn hướng thiết kế nào để implement vào app thật?" → **"Mix & match"**
- "Bộ khung layout nào cho app thật?" → **"Rail dọc bên trái (Hướng 2)"**
- "Bảng màu và khí chất chủ đạo?" → **"Than ấm + ngà (Hướng 2)"**
- "Giữ những tính năng đặc trưng nào?" → **"Color coding bàn phím Casio, Feedback kép mọi trạng thái"**

## Hướng được duyệt (implement vào app thật)
- **Layout**: rail dọc bên trái thay nav ngang (brand trên cùng → tab dọc → cụm trạng thái + mic dưới đáy rail).
- **Palette**: than ấm `#191613` / panel `#26211a` / ngà `#f1ead9` / amber gaze `#e8b84b` — không navy-neon, không tím.
- **Motif xuyên suốt**: "vòng xác nhận" (dwell ring) — con trỏ gaze, loading, progress, tab active, status dot.
- **Casio keypad**: color coding nhóm chức năng kiểu Fitzgerald Key (số = amber/cát, phép toán = xanh lá mờ, DEL/AC = đất nung; hàm giữ tối trung tính), giữ nguyên layout/thân máy/LCD.
- **Feedback kép**: mọi trạng thái = màu + nhãn chữ (+ hình dạng khi cần).
- **Fonts**: Be Vietnam Pro (UI) + JetBrains Mono (readout/LCD), subset tiếng Việt.

## Ràng buộc implement
- KHÔNG đổi ID/class/data-key mà JS đang bind (liệt kê trong `design-spec.md` §9).
- Giữ `.calculator` width 370px (scaleCalculator() phụ thuộc).
- Target gaze ≥ 44px với nav/status; chữ body ≥ 14px; có `prefers-reduced-motion`.

</content>