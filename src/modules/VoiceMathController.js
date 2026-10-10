/**
 * VoiceMathController.js
 * ============================================================
 * Nhập phép tính và số trực tiếp bằng giọng nói tiếng Việt
 * cho máy tính Casio fx-580VN X trong dự án EyeAssist.
 *
 * Hỗ trợ 2 chế độ:
 * 1. Tích hợp trực tiếp với VoiceHandler đã có (khuyên dùng, không xung đột mic)
 * 2. Độc lập (tự khởi tạo SpeechRecognition riêng nếu cần)
 */

export default class VoiceMathController {
  // ==========================================================
  //  1. BẢNG ÁNH XẠ KÝ TỰ TOÁN → data-key CỦA CASIO
  // ==========================================================
  static CHAR_TO_KEY = {
    '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
    '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
    '+': 'PLUS',
    '-': 'MINUS',
    '×': 'MULTIPLY',
    '÷': 'DIVIDE',
    '=': 'EQUALS',
    '.': 'DOT',
    '(': 'LPAREN',
    ')': 'RPAREN',
    'DEL': 'DEL',
    'AC': 'AC',
    'SQRT': 'SQRT',
    'SQUARE': 'SQUARE',
    'POWER': 'POWER',
    'NEGATION': 'NEGATION',
  };

  /**
   * Chuyển từ tiếng Việt thành chữ số đơn.
   */
  static _digitWord(word) {
    if (!word) return '';
    const map = {
      'không': '0', 'một': '1', 'mốt': '1', 'hai': '2', 'ba': '3',
      'bốn': '4', 'tư': '4', 'năm': '5', 'lăm': '5',
      'sáu': '6', 'bảy': '7', 'bẩy': '7', 'tám': '8', 'chín': '9',
    };
    return map[word.toLowerCase()] ?? (/^[0-9]$/.test(word) ? word : '');
  }

  // ==========================================================
  //  1.1 BẢNG TỪ VỰNG TOÁN HỌC HỢP LỆ (WHITELIST CHỐNG TỪ NGOẠI LAI)
  // ==========================================================
  static MATH_VOCABULARY = new Set([
    // Chữ số & số đếm
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'không', 'một', 'mốt', 'hai', 'ba', 'bốn', 'tư', 'năm', 'lăm',
    'sáu', 'bảy', 'bẩy', 'tám', 'chín',
    'mười', 'chục', 'mươi', 'hăm', 'trăm', 'nghìn', 'ngàn',
    'linh', 'lẻ', 'pi',

    // Toán tử & phép tính cơ bản
    'cộng', 'cộn', 'trừ', 'thừ', 'nhân', 'nhơn', 'nhẩn', 'chia', 'chía',
    'bằng', 'kết', 'quả', 'ra', 'bao', 'nhiêu',

    // Dấu chấm, phẩy, ngoặc
    'chấm', 'phẩy', 'ngoặc', 'mở', 'đóng',

    // Lệnh xóa & chức năng
    'xóa', 'hết', 'tất', 'cả', 'ac', 'del', 'clear', 'làm', 'mới',
    'lùi', 'lại', 'backspace',

    // Hàm toán học
    'căn', 'bậc', 'bình', 'phương', 'mũ', 'lũy', 'thừa', 'đổi', 'dấu', 'âm',

    // Từ hành động & đệm toán học được phép đi kèm
    'số', 'phím', 'nút', 'với', 'cho', 'đi', 'mấy', 'của', 'tính', 'và',
    'bấm', 'ấn', 'nhập', 'gõ', 'viết', 'phép', 'đặt'
  ]);

  /**
   * Kiểm tra: Toàn bộ các từ trong transcript phải thuộc từ vựng toán học.
   * Nếu phát hiện từ không liên quan (chuyện phiếm), từ chối ngay.
   */
  static isMathCommand(transcript) {
    if (!transcript || typeof transcript !== 'string') return false;

    // Dọn dẹp dấu câu thông thường
    const cleaned = transcript.toLowerCase().trim().replace(/[!?;:…""''`~@#$%^&_\\|/,.]/g, ' ');
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length === 0) return false;

    // 1. Loại bỏ các câu đàm thoại hoặc lệnh điều hướng hệ thống
    const raw = transcript.toLowerCase();
    if (
      raw.includes('không phải') ||
      raw.includes('phải không') ||
      raw.includes('chẳng phải') ||
      raw.includes('chả phải') ||
      raw.includes('bàn tay') ||
      raw.includes('xoay') ||
      raw.includes('vectơ') ||
      raw.includes('vecto') ||
      raw.includes('mũi tên') ||
      raw.includes('hiệu chỉnh') ||
      raw.includes('chuyển tab') ||
      raw.includes('chuyển tầng') ||
      raw.includes('uống nước') ||
      raw.includes('ăn cơm') ||
      raw.includes('chào bạn')
    ) {
      return false;
    }

    // 2. Kiểm tra từng từ: phải nằm trong từ điển toán hoặc là chuỗi số/ký hiệu toán
    let hasMathMeaningfulToken = false;
    for (const w of words) {
      if (/^[0-9+\-*xX/:.()=]+$/.test(w)) {
        hasMathMeaningfulToken = true;
        continue;
      }
      if (!VoiceMathController.MATH_VOCABULARY.has(w)) {
        return false;
      }
      if (
        /^(không|một|mốt|hai|ba|bốn|tư|năm|lăm|sáu|bảy|bẩy|tám|chín|mười|chục|mươi|hăm|trăm|nghìn|ngàn|cộng|cộn|trừ|thừ|nhân|nhơn|nhẩn|chia|chía|bằng|kết|quả|xóa|ac|del|clear|căn|bình|mũ|âm|pi)$/.test(w)
      ) {
        hasMathMeaningfulToken = true;
      }
    }

    return hasMathMeaningfulToken;
  }

  // ==========================================================
  //  2. CHUẨN HÓA VĂN BẢN TIẾNG VIỆT → CHUỖI TOÁN HỌC
  // ==========================================================
  /**
   * Chuẩn hóa giọng nói tiếng Việt thành biểu thức toán học.
   * Hỗ trợ số đọc rời ("một hai cộng ba"), số ghép tự nhiên
   * ("mười hai", "hai mươi ba", "một trăm"), và số Ả Rập ("12 + 3").
   *
   * @param {string} transcript - Văn bản từ Web Speech API
   * @returns {string} Chuỗi token toán học (rỗng nếu không phải lệnh toán hợp lệ)
   */
  static normalizeVietnameseToMath(transcript) {
    if (!transcript || typeof transcript !== 'string') return '';

    // BẮT BUỘC: Kiểm tra danh sách từ hợp lệ trước. Nếu chứa từ không liên quan -> Bỏ qua ngay
    if (!VoiceMathController.isMathCommand(transcript)) {
      return '';
    }

    let raw = transcript.toLowerCase().trim();

    // ── Bước 0: Chuẩn hóa số thập phân và dọn sạch dấu câu ──
    // 1. Chuyển dấu phẩy/chấm giữa các chữ số thành dấu chấm thập phân tạm thời
    raw = raw.replace(/(\d+)\s*[.,]\s*(\d+)/g, ' $1 DECIMALPOINT $2 ');

    // 2. Chuyển chữ "phẩy", "chấm" thành dấu chấm thập phân tạm thời
    raw = raw.replace(/(?<=\s)(phẩy|chấm)(?=\s)/gi, ' DECIMALPOINT ');

    // 3. Bây giờ xóa an toàn mọi dấu câu ngữ pháp (bao gồm dấu chấm cuối câu từ ASR, dấu phẩy ngắt câu, v.v.)
    let t = ' ' + raw.replace(/[.,!?;:…""''`~@#$%^&_\\|/]/g, ' ').replace(/\s+/g, ' ') + ' ';

    // 4. Khôi phục lại dấu chấm thập phân chuẩn
    t = t.replace(/DECIMALPOINT/g, ' . ');

    // Bỏ tiền tố "số", "phím", "nút"
    t = t.replace(/(?<=\s)số\s+(?=[0-9]|không|một|mốt|hai|ba|bốn|tư|năm|lăm|sáu|bảy|bẩy|tám|chín|mười|pi)/gi, '');
    t = t.replace(/(?<=\s)(phím|nút|nhập|ấn|bấm)\s+/gi, ' ');

    // ── Bước 1: Các lệnh điều khiển xóa & phím chức năng ──
    t = t.replace(/(?<=\s)(xóa\s*hết|xóa\s*tất\s*cả|clear|làm\s*mới|ac)(?=\s)/gi, ' AC ');
    t = t.replace(/(?<=\s)(xóa|lùi\s*lại|backspace|del)(?=\s)/gi, ' DEL ');
    t = t.replace(/(?<=\s)(căn\s*bậc\s*hai|căn)(?=\s)/gi, ' SQRT ');
    t = t.replace(/(?<=\s)(bình\s*phương)(?=\s)/gi, ' SQUARE ');
    t = t.replace(/(?<=\s)(mũ|lũy\s*thừa)(?=\s)/gi, ' POWER ');
    t = t.replace(/(?<=\s)(đổi\s*dấu|âm)(?=\s)/gi, ' NEGATION ');

    // ── Bước 2: Toán tử cơ bản ──
    t = t.replace(/(?<=\s)(cộng\s*với|cộng|cộn|\+)(?=\s)/gi, ' + ');
    t = t.replace(/(?<=\s)(trừ\s*đi|trừ|thừ|\-)(?=\s)/gi, ' - ');
    t = t.replace(/(?<=\s)(nhân\s*với|nhân|nhơn|nhẩn|\*|x)(?=\s)/gi, ' × ');
    t = t.replace(/(?<=\s)(chia\s*cho|chia|chía)(?=\s)/gi, ' ÷ ');
    t = t.replace(/(?<=\s)(bằng\s*mấy|bằng|kết\s*quả|ra|=)(?=\s)/gi, ' = ');
    t = t.replace(/(?<=\s)(mở\s*ngoặc)(?=\s)/gi, ' ( ');
    t = t.replace(/(?<=\s)(đóng\s*ngoặc)(?=\s)/gi, ' ) ');

    // ── Bước 3: Số ghép tự nhiên tiếng Việt ──
    // Hàng nghìn: "một nghìn" -> "1000"
    t = t.replace(/(?<=\s)(một|hai|ba|bốn|tư|năm|lăm|sáu|bảy|bẩy|tám|chín|[1-9])\s*(nghìn|ngàn)(?=\s)/gi, (_, d) => {
      const v = VoiceMathController._digitWord(d) || d;
      return ` ${v}000 `;
    });

    // Hàng trăm
    t = t.replace(/(?<=\s)(một|hai|ba|bốn|tư|năm|lăm|sáu|bảy|bẩy|tám|chín|[1-9])\s*trăm(?=\s)/gi, (_, d) => {
      const v = VoiceMathController._digitWord(d) || d;
      return ` ${v}__HUNDRED__ `;
    });

    // Hàng chục đầy đủ: "hai mươi ba" -> "23", "bốn mươi lăm" -> "45"
    t = t.replace(
      /(?<=\s)(hai|ba|bốn|tư|năm|lăm|sáu|bảy|bẩy|tám|chín|[2-9])\s*(mươi|chục)\s*(mốt|một|hai|ba|bốn|tư|năm|lăm|sáu|bảy|bẩy|tám|chín|[1-9])(?=\s)/gi,
      (_, tens, __, ones) => ` ${(VoiceMathController._digitWord(tens) || tens)}${(VoiceMathController._digitWord(ones) || ones)} `
    );
    t = t.replace(
      /(?<=\s)(hai|ba|bốn|tư|năm|lăm|sáu|bảy|bẩy|tám|chín|[2-9])\s*(mươi|chục)(?=\s)/gi,
      (_, tens) => ` ${(VoiceMathController._digitWord(tens) || tens)}0 `
    );
    t = t.replace(
      /(?<=\s)mười\s*(mốt|một|hai|ba|bốn|tư|năm|lăm|sáu|bảy|bẩy|tám|chín|[1-9])(?=\s)/gi,
      (_, ones) => ` 1${(VoiceMathController._digitWord(ones) || ones)} `
    );
    t = t.replace(/(?<=\s)mười(?=\s)/gi, ' 10 ');

    // Tiếng miền Nam: "hăm mốt" -> 21, "hăm lăm" -> 25
    t = t.replace(/(?<=\s)hăm\s*(mốt|một|hai|ba|bốn|tư|năm|lăm|sáu|bảy|bẩy|tám|chín|[1-9])(?=\s)/gi, (_, ones) => ` 2${(VoiceMathController._digitWord(ones) || ones)} `);
    t = t.replace(/(?<=\s)hăm(?=\s)/gi, ' 20 ');

    // Nối ghép trăm: "1__HUNDRED__ 23" -> "123", "1__HUNDRED__ linh 5" -> "105"
    t = t.replace(/(\d)__HUNDRED__\s*(linh|lẻ)\s*([0-9]|một|hai|ba|bốn|tư|năm|lăm|sáu|bảy|bẩy|tám|chín)/gi, (_, h, __, o) => {
      return ` ${h}0${VoiceMathController._digitWord(o) || o} `;
    });
    t = t.replace(/(\d)__HUNDRED__\s*(\d{2})/g, ' $1$2 ');
    t = t.replace(/(\d)__HUNDRED__\s*(\d)/g, ' $10$2 ');
    t = t.replace(/(\d)__HUNDRED__/g, ' $100 ');

    // ── Bước 4: Chữ số đơn lẻ ──
    const digitWords = [
      ['không', '0'],
      ['mốt',   '1'],
      ['một',   '1'],
      ['hai',   '2'],
      ['ba',    '3'],
      ['bốn',   '4'],
      ['tư',    '4'],
      ['năm',   '5'],
      ['lăm',   '5'],
      ['sáu',   '6'],
      ['bảy',   '7'],
      ['bẩy',   '7'],
      ['tám',   '8'],
      ['chín',  '9'],
    ];
    for (const [w, d] of digitWords) {
      t = t.replace(new RegExp(`(?<=\\s)${w}(?=\\s)`, 'gi'), ` ${d} `);
    }

    // ── Bước 5: Trích xuất chuỗi ký tự toán học hợp lệ ──
    const tokens = [];
    const parts = t.trim().split(/\s+/).filter(Boolean);

    for (const p of parts) {
      if (['DEL', 'AC', 'SQRT', 'SQUARE', 'POWER', 'NEGATION'].includes(p)) {
        tokens.push(p);
        continue;
      }
      for (const ch of p) {
        if (/[0-9+\-×÷=.()]/.test(ch)) {
          tokens.push(ch);
        }
      }
    }

    return tokens.join('');
  }

  // ==========================================================
  //  3. CONSTRUCTOR
  // ==========================================================
  /**
   * @param {object} [voiceOrOptions] - VoiceHandler instance hoặc object options
   * @param {object} [options]
   */
  constructor(voiceOrOptions = null, options = {}) {
    let voiceInstance = null;
    let opts = options;

    if (voiceOrOptions && typeof voiceOrOptions === 'object') {
      if ('on' in voiceOrOptions) {
        voiceInstance = voiceOrOptions;
      } else {
        opts = voiceOrOptions;
      }
    }

    this._lang           = opts.lang           ?? 'vi-VN';
    this._keystrokeDelay = opts.keystrokeDelay ?? 120;
    this._autoRestart    = opts.autoRestart    ?? true;
    this._showFeedback   = opts.showFeedback   ?? true;

    this._voice          = null;
    this._recognition    = null;
    this._active         = false;
    this._processing     = false;
    this._uiTimer        = null;

    // Xuất ra window để tiện kiểm tra
    if (typeof window !== 'undefined') {
      window.voiceMath = this;
    }

    // Nếu truyền VoiceHandler vào → tự động attach để dùng chung mic không gây xung đột
    if (voiceInstance) {
      this.attach(voiceInstance);
    } else {
      this._buildRecognition();
    }

    console.info('[VoiceMathController] 🚀 Đã sẵn sàng nhận diện số và phép tính Casio.');
  }

  // ==========================================================
  //  4. TÍCH HỢP VỚI VoiceHandler SẴN CÓ (Tránh xung đột mic)
  // ==========================================================
  attach(voiceInstance) {
    if (!voiceInstance) return;
    this._voice = voiceInstance;

    const handleSpeech = (raw) => {
      // Chỉ kích hoạt khi tab Casio đang hiển thị
      const activeTab = document.querySelector('.nav-tab.active')?.dataset?.tab ||
                        document.querySelector('.tab-content.active')?.id?.replace('tab-', '') ||
                        'casio';
      if (activeTab !== 'casio') return false;

      return this.processTranscript(raw);
    };

    let lastHandledRaw = '';
    let interimCommitTimer = null;

    voiceInstance.on('onResult', (command, raw) => {
      const activeTab = document.querySelector('.nav-tab.active')?.dataset?.tab ||
                        document.querySelector('.tab-content.active')?.id?.replace('tab-', '') ||
                        'casio';
      if (activeTab === 'casio') {
        clearTimeout(interimCommitTimer);
        if (lastHandledRaw !== raw) {
          lastHandledRaw = raw;
          this.processTranscript(raw);
        }
      }
    });

    voiceInstance.on('onInterim', (text) => {
      const activeTab = document.querySelector('.nav-tab.active')?.dataset?.tab || 'casio';
      if (activeTab === 'casio') {
        const preview = VoiceMathController.normalizeVietnameseToMath(text);
        if (preview) {
          this._showPreview(text, preview);
          // Fast-commit sau 500ms: Tự động gõ số ngay khi người dùng ngừng nói,
          // không bắt người dùng phải chờ Google Cloud nhận diện khoảng lặng 2-3s (đặc biệt hữu ích trên máy có mic ồn hoặc mạng trễ)
          clearTimeout(interimCommitTimer);
          interimCommitTimer = setTimeout(() => {
            if (lastHandledRaw !== text) {
              lastHandledRaw = text;
              this.processTranscript(text);
            }
          }, 500);
        }
      }
    });

    console.info('[VoiceMathController] 🔗 Đã kết nối thành công vào luồng VoiceHandler (kèm Fast-Commit 500ms).');
  }

  // ==========================================================
  //  5. CHẾ ĐỘ ĐỘC LẬP (Web Speech API riêng nếu không có VoiceHandler)
  // ==========================================================
  _buildRecognition() {
    const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    if (!SR) {
      console.warn('[VoiceMath] Web Speech API không được hỗ trợ.');
      return;
    }

    const rec = new SR();
    rec.lang            = this._lang;
    rec.continuous      = true;
    rec.interimResults  = true;
    rec.maxAlternatives = 3;

    rec.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const t = result[0]?.transcript || '';
        if (result.isFinal) {
          finalTranscript += t;
        } else {
          interimTranscript += t;
        }
      }

      if (interimTranscript) {
        const preview = VoiceMathController.normalizeVietnameseToMath(interimTranscript);
        if (preview) this._showPreview(interimTranscript, preview);
      }

      if (finalTranscript) {
        this.processTranscript(finalTranscript);
      }
    };

    rec.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('[VoiceMath] Lỗi mic:', e.error);
      }
    };

    rec.onend = () => {
      if (this._active && this._autoRestart) {
        setTimeout(() => {
          if (this._active) {
            try { this._recognition.start(); } catch (_) {}
          }
        }, 100);
      }
    };

    this._recognition = rec;
  }

  // ==========================================================
  //  6. XỬ LÝ LỆNH TOÁN & BẤM PHÍM CASIO
  // ==========================================================
  /**
   * Phân tích văn bản giọng nói và bấm phím trên Casio.
   * @param {string} raw - Text giọng nói
   * @returns {boolean} True nếu nhận diện và thực thi thành công
   */
  processTranscript(raw) {
    if (!raw) return false;

    const mathExpr = VoiceMathController.normalizeVietnameseToMath(raw);
    if (!mathExpr) return false;

    const keystrokes = this._mathToKeystrokes(mathExpr);
    if (keystrokes.length === 0) return false;

    console.info(`[VoiceMath] 🎙️ "${raw}" → ${mathExpr} → [${keystrokes.join(', ')}]`);
    this._showUI(`🔢 "${raw}" → ${mathExpr}`);

    // Hàng đợi phím bấm để không bỏ sót lệnh khi người dùng đọc liên tục
    if (!this._queue) this._queue = [];
    this._queue.push(keystrokes);
    this._drainQueue();
    return true;
  }

  /**
   * Chuyển chuỗi toán học thành mảng data-key IDs.
   * @param {string} mathExpr
   * @returns {string[]}
   */
  _mathToKeystrokes(mathExpr) {
    const keys = [];
    const re = /(DEL|AC|SQRT|SQUARE|POWER|NEGATION|[0-9+\-×÷=.()])/g;
    let match;
    while ((match = re.exec(mathExpr)) !== null) {
      const token = match[1];
      const key = VoiceMathController.CHAR_TO_KEY[token];
      if (key) keys.push(key);
    }
    return keys;
  }

  /**
   * Xử lý hàng đợi phím một cách an toàn và tuần tự
   */
  async _drainQueue() {
    if (this._processing || !this._queue || this._queue.length === 0) return;
    this._processing = true;

    try {
      while (this._queue.length > 0) {
        const keystrokes = this._queue.shift();
        for (let i = 0; i < keystrokes.length; i++) {
          const key = keystrokes[i];

          try {
            if (typeof window !== 'undefined' && window.handleKey) {
              window.handleKey(key);
              if (window.saveState) {
                window.saveState();
              }
            }
          } catch (err) {
            console.error(`[VoiceMath] Lỗi khi thực thi phím ${key}:`, err);
          }

          this._flashButton(key);

          if (i < keystrokes.length - 1 || this._queue.length > 0) {
            await this._delay(this._keystrokeDelay);
          }
        }
      }
    } finally {
      this._processing = false;
    }
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Flash hiệu ứng trên nút Casio */
  _flashButton(dataKey) {
    const btn = document.querySelector(`#casio-app [data-key="${CSS.escape(dataKey)}"]`);
    if (!btn) return;
    btn.classList.add('voice-active');
    setTimeout(() => btn.classList.remove('voice-active'), 180);
  }

  /** Hiển thị preview tức thì khi đang nói */
  _showPreview(raw, preview) {
    if (!this._showFeedback) return;
    const el = document.getElementById('voice-feedback');
    if (!el) return;
    el.textContent = `🎤 "${raw}..." → ${preview}`;
    el.classList.add('visible', 'listening');
  }

  /** Hiển thị kết quả đã xác nhận */
  _showUI(text) {
    if (!this._showFeedback) return;
    const el = document.getElementById('voice-feedback');
    if (!el) return;
    el.textContent = text;
    el.classList.add('visible', 'listening');
    clearTimeout(this._uiTimer);
    this._uiTimer = setTimeout(() => {
      el.classList.remove('listening');
      setTimeout(() => el.classList.remove('visible'), 250);
    }, 1800);
  }

  // ==========================================================
  //  7. PUBLIC CONTROLS
  // ==========================================================
  start() {
    if (this._recognition && !this._active) {
      this._active = true;
      try {
        this._recognition.start();
        console.info('[VoiceMath] 🎙️ Bắt đầu nhận diện phép tính.');
      } catch (e) {
        console.warn('[VoiceMath] Lỗi start:', e);
      }
    }
  }

  stop() {
    this._active = false;
    if (this._recognition) {
      try { this._recognition.stop(); } catch (_) {}
    }
  }

  get isActive() {
    return this._active || (this._voice ? this._voice.isListening : false);
  }
}
