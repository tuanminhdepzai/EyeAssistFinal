import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
import os
import re

def clean_xml_str(s):
    if not isinstance(s, str):
        return s
    # Remove control characters that break XML
    return re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', s)

def set_cell_background(cell, fill_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_color}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
    tcPr.append(tcMar)

def add_heading_styled(doc, text, level):
    p = doc.add_heading(level=level)
    run = p.add_run(clean_xml_str(text))
    run.font.name = 'Arial'
    if level == 1:
        run.font.size = Pt(16)
        run.font.bold = True
        run.font.color.rgb = RGBColor(26, 86, 160) # Deep Blue
        p.paragraph_format.space_before = Pt(16)
        p.paragraph_format.space_after = Pt(6)
    elif level == 2:
        run.font.size = Pt(13)
        run.font.bold = True
        run.font.color.rgb = RGBColor(212, 143, 24) # Amber Gold
        p.paragraph_format.space_before = Pt(12)
        p.paragraph_format.space_after = Pt(4)
    elif level == 3:
        run.font.size = Pt(11)
        run.font.bold = True
        run.font.color.rgb = RGBColor(40, 40, 40)
        p.paragraph_format.space_before = Pt(8)
        p.paragraph_format.space_after = Pt(2)
    return p

def main():
    doc = docx.Document()

    # Set Margins
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)

    # Title
    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_run = title_p.add_run(clean_xml_str("HƯỚNG DẪN LẬP TRÌNH BÀI BẢN VÀ LỘ TRÌNH 36 NGÀY\nPHÁT TRIỂN DỰ ÁN EYEASSIST (AI EYE-TRACKING & 3D PHYSICS)"))
    title_run.font.name = 'Arial'
    title_run.font.size = Pt(20)
    title_run.font.bold = True
    title_run.font.color.rgb = RGBColor(26, 86, 160)
    title_p.paragraph_format.space_after = Pt(4)

    sub_p = doc.add_paragraph()
    sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub_run = sub_p.add_run(clean_xml_str("Hệ Thống Trợ Lý Hỗ Trợ Tương Tác Bằng Ánh Mắt, Máy Tính Casio Virtual & Mô Hình Bàn Tay Vật Lý 3D\nTác giả: Nguyễn Tuấn Minh | Công nghệ: MediaPipe, Three.js, Firebase, Web Speech API, Vite"))
    sub_run.font.name = 'Arial'
    sub_run.font.size = Pt(10.5)
    sub_run.font.italic = True
    sub_run.font.color.rgb = RGBColor(100, 100, 100)
    sub_p.paragraph_format.space_after = Pt(18)

    # Section 1: Tong quan Kien truc
    add_heading_styled(doc, "PHẦN 1: TỔNG QUAN KIẾN TRÚC & CÁCH LẬP TRÌNH DỰ ÁN EYEASSIST", 1)

    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.15
    p.paragraph_format.space_after = Pt(6)
    r = p.add_run(clean_xml_str("EyeAssist là một ứng dụng web đa chức năng đột phá kết hợp trí tuệ nhân tạo (AI Computer Vision), đồ họa không gian 3D tương tác và xác thực đám mây. Để lập trình dự án này một cách chuyên nghiệp, hệ thống được chia thành 5 module cốt lõi liên kết chặt chẽ:"))
    r.font.name = 'Arial'
    r.font.size = Pt(11)

    modules = [
        ("1. Core Computer Vision & Eye-Tracking Engine (Xử lý Ánh mắt):", "Sử dụng Google MediaPipe Face Landmarker để nhận diện 478 điểm mốc trên khuôn mặt theo thời gian thực (60 FPS). Thuật toán tính toán Iris Center (điểm 468-477), tính góc Pitch/Yaw của đầu để bù sai số, và áp dụng bộ lọc Exponential Moving Average (EMA) kết hợp Kalman Filter để giảm nhiễu rung lắc mắt."),
        ("2. Magnetic Snap & Dwell Blink Detection (Kích hoạt Thao tác):", "Thuật toán Hút nam châm (Magnetic Snap) tự động kéo con trỏ mắt vào tâm nút gần nhất với vùng đệm Hysteresis. Thuật toán Eye Aspect Ratio (EAR) đo khoảng cách mí mắt để phân loại: Nháy mắt tự nhiên (Natural Blink), Nháy mắt chủ đích (Intentional Blink) và Vòng tiến trình nhìn dừng (Dwell Timer ~0.45s)."),
        ("3. Virtual Casio fx-580VN X Calculator Engine (Máy tính ảo):", "Giao diện mô phỏng 100% bàn phím Casio fx-580VN X chuẩn. Hệ thống parser biểu thức toán học hỗ trợ Mode A (Giải phương trình bậc 2, bậc 3) và Mode 9 (Giải hệ 2, 3 ẩn), phím biến x, tự động định dạng phân số và căn thức."),
        ("4. 3D Physics Hand Solver Engine (Mô hình Bàn tay 3D):", "Sử dụng Three.js để dựng phối cảnh 3D WebGL. Tải mô hình bàn tay 3D (GLTF Rigged), tự động uốn các khớp xương theo quy tắc Bàn tay trái (Lực Ampe F = I x B), vẽ mũi tên vectơ 3D (B, I, F) và tích hợp chế độ xoay camera bằng ánh mắt mượt mà (Spherical LERP)."),
        ("5. Voice Command & Firebase Authentication (Giọng nói & Bảo mật):", "Tích hợp Web Speech API nhận diện khẩu lệnh tiếng Việt ('Mở bàn tay 3D', 'Mở Casio ảo', 'Xoay bàn tay', 'Reset camera'). Hệ thống bảo mật Firebase Auth bắt buộc Đăng nhập/Đăng ký trước khi dùng web và hoãn yêu cầu quyền Camera/Mic đến sau khi xác thực thành công.")
    ]

    for title, desc in modules:
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.2)
        p.paragraph_format.space_after = Pt(4)
        r1 = p.add_run(clean_xml_str(title) + " ")
        r1.bold = True
        r1.font.name = 'Arial'
        r1.font.size = Pt(10.5)
        r1.font.color.rgb = RGBColor(26, 86, 160)
        r2 = p.add_run(clean_xml_str(desc))
        r2.font.name = 'Arial'
        r2.font.size = Pt(10.5)

    # Section 2: Tai lieu & Thu vien
    add_heading_styled(doc, "PHẦN 2: TÀI LIỆU HỌC TẬP, NGUỒN TÀI NGUYÊN & THƯ VIỆN CẦN THIẾT", 1)

    p = doc.add_paragraph()
    p.add_run(clean_xml_str("Để lập trình dự án này, bạn cần truy cập và tham khảo các tài liệu chính thức sau đây:")).font.name = 'Arial'

    resources = [
        ("Google MediaPipe Docs", "https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker", "Tài liệu tích hợp Face Mesh 478 tọa độ mốc khuôn mặt và mống mắt (Iris)."),
        ("Three.js Official Documentation", "https://threejs.org/docs/", "Hướng dẫn cài đặt Scene, PerspectiveCamera, WebGLRenderer, GLTFLoader và OrbitControls."),
        ("Firebase Auth SDK v10+", "https://firebase.google.com/docs/auth/web/start", "Tài liệu đăng nhập Email/Password và Google Sign-In Popup."),
        ("MDN Web Speech API Guide", "https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API", "Tài liệu nhận diện giọng nói tiếng Việt bằng SpeechRecognition."),
        ("Casio Education Manual", "Trang chủ Casio Education", "Thông số quy chuẩn giao diện và thuật toán hiển thị của dòng máy tính Casio fx-580VN X."),
        ("Vite Build & Bundling Tool", "https://vitejs.dev/guide/", "Công cụ đóng gói ứng dụng web hiện đại ES Module và môi trường dev server 60 FPS.")
    ]

    table = doc.add_table(rows=1, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr_cells = table.rows[0].cells
    hdr_titles = ["Tên Tài Liệu / Công Nghệ", "Địa Chỉ / Trang Chủ", "Mục Đích Sử Dụng Trong Dự Án"]
    for i, title in enumerate(hdr_titles):
        hdr_cells[i].text = clean_xml_str(title)
        set_cell_background(hdr_cells[i], "1A56A0")
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        for run in p.runs:
            run.font.name = 'Arial'
            run.font.bold = True
            run.font.size = Pt(9.5)
            run.font.color.rgb = RGBColor(255, 255, 255)

    for name, link, purpose in resources:
        row_cells = table.add_row().cells
        row_cells[0].text = clean_xml_str(name)
        row_cells[1].text = clean_xml_str(link)
        row_cells[2].text = clean_xml_str(purpose)
        for i, cell in enumerate(row_cells):
            set_cell_margins(cell, top=80, bottom=80, left=100, right=100)
            p = cell.paragraphs[0]
            for run in p.runs:
                run.font.name = 'Arial'
                run.font.size = Pt(9)

    doc.add_paragraph().paragraph_format.space_after = Pt(10)

    # Section 3: Lo trinh 36 Ngay
    add_heading_styled(doc, "PHẦN 3: LỘ TRÌNH LẬP TRÌNH CHI TIẾT 36 NGÀY (DAY-BY-DAY ROADMAP)", 1)

    phases = [
        ("GIAI ĐOẠN 1: KHỞI TẠO DỰ ÁN & THIẾT KẾ GIAO DIỆN CHUẨN (NGÀY 1 - NGÀY 6)", [
            (1, "Khởi tạo môi trường lập trình", "Cài đặt Node.js v18+, VS Code, Git. Tạo project với Vite `npm create vite@latest eye -- --template vanilla`. Cài đặt 3 thư viện chính: Three.js, MediaPipe FaceLandmarker, và Firebase SDK.", "Node.js Docs, Vite Guide"),
            (2, "Xây dựng Design System & CSS Variables", "Tạo file `src/styles/base.css`. Định nghĩa hệ thống màu Dark Mode chuyên nghiệp, Glassmorphism backdrop blur, CSS variables cho font Roboto/Inter và hiệu ứng chuyển cảnh mượt mà.", "Modern CSS Tricks, Google Fonts"),
            (3, "Thiết kế khung HTML tổng thể (App Layout)", "Viết file `index.html`. Tạo thanh Navigation Topbar, Sidebar menu trái, màn hình chính chứa Tab máy tính Casio, Tab bàn tay 3D và khung Camera Preview.", "HTML5 Semantic Standards"),
            (4, "Xây dựng Modal Đăng nhập / Đăng ký", "Thiết kế Modal giao diện Đăng nhập, Đăng ký và Quên mật khẩu phủ toàn màn hình (Modal Overlay). Thiết kế hiệu ứng mờ kính (Glassmorphism) và nút đóng SVG sắc nét.", "UI/UX Glassmorphic Patterns"),
            (5, "Thiết kế cấu trúc mã nguồn ES Modules", "Chia nhỏ file JS: `src/main.js` (trung tâm điều khiển), `src/auth/` (xác thực), `src/modules/` (Casio & Bàn tay 3D), `src/engine/` (Eye tracking).", "JavaScript ES Modules Spec"),
            (6, "Thiết lập Vercel & GitHub CI/CD Pipeline", "Tạo repository trên GitHub `EyeAssistFinal`, kết nối Vercel tự động deploy mỗi khi `git push origin main`. Cấu hình `vercel.json` hỗ trợ file `.wasm` và `.glb`.", "Vercel Deployment Docs")
        ]),
        ("GIAI ĐOẠN 2: THIẾT LẬP AI EYE-TRACKING & COMPUTER VISION (NGÀY 7 - NGÀY 12)", [
            (7, "Tích hợp MediaPipe Face Landmarker", "Viết class `CameraManager` khởi động webcam. Kết nối thư viện `@mediapipe/tasks-vision` để phát hiện 478 điểm mốc khuôn mặt với tốc độ 60 FPS.", "MediaPipe Vision Guide"),
            (8, "Tính toán tọa độ con trỏ Mống mắt (Iris)", "Trích xuất tọa độ Iris center (điểm 468-477). Áp dụng phép chiếu tọa độ 2D từ khuôn mặt lên màn hình máy tính (Viewport Coordinate Mapping).", "Computer Vision Mathematics"),
            (9, "Thuật toán bù nghiêng đầu (Pitch/Yaw Compensation)", "Viết class `EARCalculator.js`. Tính góc xoay đầu Pitch/Yaw từ mốc trán-cằm để bù sai số khi người dùng cúi hoặc ngửa mặt trước camera.", "Head Pose Estimation Docs"),
            (10, "Bộ lọc mượt con trỏ (Kalman & EMA Filter)", "Áp dụng kết hợp bộ lọc Exponential Moving Average (EMA) và Kalman Filter để loại bỏ hiện tượng rung giật tự nhiên của mắt, giúp con trỏ di chuyển mượt mà.", "Signal Processing Filtering"),
            (11, "Thuật toán Hút nam châm (Magnetic Snap)", "Xây dựng cơ chế Magnetic Snap: khi con trỏ mắt đến gần nút bấm trong bán kính R=40px, con trỏ tự động hút chặt vào tâm nút với vùng đệm Hysteresis.", "Eye Tracking Interaction Patterns"),
            (12, "Thuật toán EAR Nháy mắt & Dwell Timer", "Tính tỷ lệ mở mắt Eye Aspect Ratio (EAR). Phân loại nháy mắt tự nhiên vs chủ đích (Dwell ~0.45s). Tích hợp vòng tròn đếm ngược (Dwell Progress Ring).", "EAR Blink Detection Papers")
        ]),
        ("GIAI ĐOẠN 3: LẬP TRÌNH MÁY TÍNH VẢO CASIO FX-580VN X (NGÀY 13 - NGÀY 18)", [
            (13, "Thiết kế ma trận phím Casio fx-580VN X", "Tạo ma trận phím Casio trong HTML/CSS. Thiết kế màn hình hiển thị LCD 2 dòng (dòng công thức và dòng kết quả).", "Casio fx-580VN X User Guide"),
            (14, "Styling phím bấm & Ký tự toán học chuẩn", "Tạo gradient phím bấm đen/xám chuyên nghiệp. Thay thế ký tự Unicode méo bằng `<i>x</i>` chuẩn Roboto/Arial và icon đóng SVG đối xứng.", "CSS Grid & Flexbox Masterclass"),
            (15, "Xây dựng Bộ xử lý biểu thức (Expression Parser)", "Viết thuật toán phân tích chuỗi toán học, hỗ trợ các phép tính cộng, trừ, nhân, chia, lũy thừa, phân số, căn thức và ngoặc đơn.", "Data Structures & Algorithms"),
            (16, "Lập trình Chế độ Mode A (Giải Phương trình)", "Viết bộ giải phương trình bậc 2 (ax^2+bx+c=0) và phương trình bậc 3. Tự động biện luận nghiệm thực và nghiệm phức.", "Computational Mathematics"),
            (17, "Lập trình Chế độ Mode 9 (Giải Hệ phương trình)", "Viết bộ giải hệ 2 ẩn và hệ 3 ẩn bậc nhất bằng phương pháp định thức Gauss/Cramer. Hỗ trợ trường hợp vô nghiệm và vô số nghiệm.", "Linear Algebra Algorithms"),
            (18, "Tích hợp Mắt điều khiển bàn phím Casio", "Kết nối hệ thống Magnetic Snap vào toàn bộ 50+ phím Casio. Lập trình phím AC Reset xóa sạch màn hình và sửa lỗi phím bấm.", "Interactive Web Development")
        ]),
        ("GIAI ĐOẠN 4: LẬP TRÌNH MÔ HÌNH BÀN TAY 3D & VẬT LÝ (NGÀY 19 - NGÀY 24)", [
            (19, "Khởi tạo môi trường 3D Three.js", "Tạo class `HandModule3D.js`. Khởi tạo THREE.Scene, THREE.PerspectiveCamera, THREE.WebGLRenderer hỗ trợ Antialias và bóng đổ PCFSoftShadowMap.", "Three.js Scene Basics"),
            (20, "Tải & Rigging mô hình Bàn tay 3D GLTF", "Tải file 3D `hand.gltf`. Ánh xạ hệ thống xương (Bone Mapping: IndexRoot, MiddleRoot, ThumbRoot). Lập trình hàm uốn ngón tay.", "Three.js GLTFLoader Docs"),
            (21, "Thuật toán Quy tắc Bàn tay trái (Lực Ampe)", "Viết bộ giải Vật lý Quy tắc Bàn tay trái: Lực từ F = I x B. Sử dụng phép tích có hướng (Cross Product) để tính toán hướng các vectơ.", "Physics Mechanics & Vectors"),
            (22, "Tạo Mũi tên Vectơ 3D & Định hướng Bàn tay", "Vẽ 3 mũi tên vectơ 3D (B: Xanh dương, I: Đỏ, F: Vàng) có nhãn ký hiệu 3D. Tự động slerp xoay lòng bàn tay hứng đường sức từ B.", "Three.js Vector3 & Quaternion"),
            (23, "Xây dựng Bài tập Trắc nghiệm 3D Tương tác", "Thiết kế Wizard 3 bước: Bước 1 chọn quy tắc, Bước 2 chọn 2 dữ kiện đề bài cho, Bước 3 tạo câu hỏi trắc nghiệm tự động xác định hướng còn lại.", "Educational Software Design"),
            (24, "Lập trình Xoay 3D bằng Ánh mắt (Gaze Orbiting)", "Tính toán tọa độ mắt trên viewport 3D. Sử dụng Spherical LERP (alpha=0.09) giúp camera 3D xoay lướt mượt mà bám sát tốc độ ánh mắt 60 FPS.", "3D Spherical Coordinate Math")
        ]),
        ("GIAI ĐOẠN 5: TÍCH HỢP GIỌNG NÓI & BẢO MẬT FIREBASE (NGÀY 25 - NGÀY 30)", [
            (25, "Khởi tạo dự án Firebase Console", "Tạo dự án Firebase, bật dịch vụ Authentication, bật phương thức Email/Password và Google Sign-In. Đăng ký tên miền Vercel vào Authorized Domains.", "Firebase Console Setup"),
            (26, "Viết module Xác thực `src/auth/auth.js`", "Lập trình các hàm `loginWithEmail`, `registerWithEmail`, `loginWithGoogle` popup và `logoutUser`. Viết bộ việt hóa thông báo lỗi Firebase.", "Firebase Web Auth API"),
            (27, "Bảo mật luồng cấp quyền Camera & Micro", "Cấu hình ứng dụng: khi vào web bắt buộc Đăng nhập/Đăng ký trước. Hoãn yêu cầu quyền Camera/Mic đến sau khi người dùng xác thực thành công.", "Browser Security Policies"),
            (28, "Viết module Giọng nói `VoiceHandler.js`", "Tích hợp Web Speech API (`SpeechRecognition`). Cấu hình ngôn ngữ `vi-VN`, bộ lọc nhiễu âm thanh môi trường và xử lý nhận diện liên tục.", "MDN Speech Recognition API"),
            (29, "Lập trình các Khẩu lệnh Tiếng Việt chuẩn", "Tạo bộ phân tích khẩu lệnh nghiêm ngặt: 'Mở bàn tay 3D', 'Mở Casio ảo', 'Xoay bàn tay', 'Reset camera'. Kích hoạt chuyển tab tức thì.", "Natural Language Parsing"),
            (30, "Xây dựng FusionEngine (Hợp nhất Tín hiệu)", "Viết class `FusionEngine.js` hợp nhất 3 nguồn dữ liệu: Ánh mắt (Gaze), Nháy mắt (Blink) và Giọng nói (Voice) thành một luồng điều khiển đồng bộ.", "Multimodal Fusion Systems")
        ]),
        ("GIAI ĐOẠN 6: TỐI ƯU GIAO DIỆN, THỬ NGHIỆM & HOÀN THIỆN (NGÀY 31 - NGÀY 36)", [
            (31, "Tối ưu hóa Cỡ chữ & Ô Hướng dẫn UI", "Tăng cỡ chữ các ô hướng dẫn Casio thêm +3px (16.5px cho tiêu đề, 14.5px cho nội dung), mở rộng chiều rộng cột giúp dễ đọc.", "UI/UX Accessibility Standards"),
            (32, "Tối ưu Giao diện Ô chọn Dữ kiện Bàn tay 3D", "Phóng to chữ các ô chọn TH1, TH2, TH3 (1.02rem), nâng chiều cao nút bấm lên 58px và tối ưu khoảng trắng giúp mắt hút dính dễ dàng.", "Eye Gaze Target Sizing"),
            (33, "Thông minh hóa Bỏ qua Nháy mắt trên 3D Canvas", "Viết hàm `isInside3DViewportCanvas`: tự động bỏ qua vòng nháy mắt khi người dùng xoay không gian 3D, giúp chớp mắt tự nhiên không bị khựng.", "User Experience Smoothing"),
            (34, "Tối ưu hóa Hiệu năng & Bộ nhớ (Performance)", "Rà soát kiểm tra rò rỉ bộ nhớ Three.js textures, hủy animation frame khi chuyển tab, duy trì tốc độ xử lý 60 FPS ổn định.", "Web Performance Optimization"),
            (35, "Kiểm thử Toàn diện Đa thiết bị & Trình duyệt", "Kiểm thử ứng dụng trên Chrome, Edge, Safari, thử nghiệm với nhiều góc độ ánh sáng webcam và khoảng cách ngồi (45-60cm).", "Software QA & Testing"),
            (36, "Đóng gói Sản phẩm & Trích xuất Tài liệu", "Chạy `npm run build` tạo bản build production, kiểm tra deploy Vercel chính thức, commit mã nguồn sạch lên GitHub và đóng gói tài liệu dự án.", "Project Delivery & Release")
        ])
    ]

    for phase_title, days in phases:
        add_heading_styled(doc, phase_title, 2)
        
        t = doc.add_table(rows=1, cols=4)
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        h_cells = t.rows[0].cells
        h_titles = ["Ngày", "Nội Dung Công Việc", "Cách Thực Hiện Kỹ Thuật Chi Tiết", "Tài Liệu / Tool"]
        widths = [Inches(0.6), Inches(2.1), Inches(3.3), Inches(1.2)]
        
        for i, title in enumerate(h_titles):
            h_cells[i].text = clean_xml_str(title)
            set_cell_background(h_cells[i], "D48F18") # Amber Gold Header
            p = h_cells[i].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            for run in p.runs:
                run.font.name = 'Arial'
                run.font.bold = True
                run.font.size = Pt(9.5)
                run.font.color.rgb = RGBColor(255, 255, 255)

        for day_num, title, detail, tool in days:
            r_cells = t.add_row().cells
            r_cells[0].text = clean_xml_str(f"Ngày {day_num}")
            r_cells[1].text = clean_xml_str(title)
            r_cells[2].text = clean_xml_str(detail)
            r_cells[3].text = clean_xml_str(tool)
            for i, cell in enumerate(r_cells):
                cell.width = widths[i]
                set_cell_margins(cell, top=70, bottom=70, left=90, right=90)
                p = cell.paragraphs[0]
                for run in p.runs:
                    run.font.name = 'Arial'
                    run.font.size = Pt(9)

        doc.add_paragraph().paragraph_format.space_after = Pt(12)

    # Section 4: Huong dan van hanh
    add_heading_styled(doc, "PHẦN 4: QUY TRÌNH KIỂM THỬ VÀ VẬN HÀNH ỨNG DỤNG SAU KHI LẬP TRÌNH", 1)

    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.15
    r = p.add_run(clean_xml_str("Sau khi hoàn thành 36 ngày lập trình, ứng dụng EyeAssist được vận hành và nghiệm thu theo các tiêu chuẩn kỹ thuật sau:"))
    r.font.name = 'Arial'
    r.font.size = Pt(11)

    steps = [
        ("1. Khởi động môi trường Dev:", "Chạy lệnh `npm run dev` tại thư mục dự án để mở môi trường kiểm thử localhost trên cổng 5173."),
        ("2. Đăng ký / Đăng nhập tài khoản:", "Truy cập giao diện, thực hiện tạo tài khoản mới bằng Email hoặc bấm 'Tiếp tục với Google'. Xác nhận đăng nhập thành công."),
        ("3. Cấp quyền Camera & Micro:", "Sau khi đăng nhập, trình duyệt sẽ gửi thông báo cấp quyền. Bấm 'Allow' để khởi động camera eye-tracking và micro giọng nói."),
        ("4. Kiểm thử Máy tính Casio ảo:", "Nhìn vào các phím số/phép tính trên Casio, kiểm tra con trỏ nháy mắt/nhìn dừng ~0.45s để nhập dữ liệu. Thử nghiệm Mode A và Mode 9."),
        ("5. Kiểm thử Mô hình 3D Bàn tay:", "Chuyển sang Tab 3D, chọn trường hợp TH1/TH2/TH3. Kiểm tra bàn tay 3D uốn theo lực Ampe, xoay camera 3D mượt mà bằng ánh mắt và làm bài tập trắc nghiệm.")
    ]

    for title, desc in steps:
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.2)
        p.paragraph_format.space_after = Pt(4)
        r1 = p.add_run(clean_xml_str(title) + " ")
        r1.bold = True
        r1.font.name = 'Arial'
        r1.font.size = Pt(10.5)
        r1.font.color.rgb = RGBColor(26, 86, 160)
        r2 = p.add_run(clean_xml_str(desc))
        r2.font.name = 'Arial'
        r2.font.size = Pt(10.5)

    # Output path
    out_dir = r"d:\TIN\EYEASSIST\eye\docs"
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "EyeAssist_36Days_Development_Roadmap_and_Guide.docx")
    doc.save(out_file)
    print(f"SUCCESS: Document saved to {out_file}")

if __name__ == "__main__":
    main()
