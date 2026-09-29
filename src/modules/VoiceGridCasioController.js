/**
 * VoiceGridCasioController.js
 * ============================================================
 * Điều hướng Casio fx-580VN X bằng giọng nói theo lưới tọa độ.
 * Sử dụng interimResults = true để bắt lệnh NGAY KHI đang nói,
 * không cần chờ người dùng ngắt câu -> tốc độ phản hồi cực nhanh.
 *
 * ⚠️  FILE ĐỘC LẬP: Không sửa đổi bất kỳ file hiện có nào.
 *
 * --- TÍCH HỢP VÀO main.js (3 dòng) ---------------------------
 *   import VoiceGridCasioController from './modules/VoiceGridCasioController.js';
 *   const voiceGrid = new VoiceGridCasioController((key) => window.handleKey && window.handleKey(key));
 *   voiceGrid.start();   // Gọi sau khi DOM sẵn sàng; voiceGrid.stop() để tắt
 * ---------------------------------------------------------------
 */

export default class VoiceGridCasioController {

  // ==========================================================
  //  1. MA TRẬN BÀN PHÍM CASIO fx-580VN X (9 hàng, gốc 0,0 = SHIFT)
  // ==========================================================
  static GRID = [
    // Row 0: SHIFT (0,0), ALPHA (0,1), MENU (0,2), ON (0,3)
    ['SHIFT', 'ALPHA', 'MENU', 'ON'],

    // Row 1: OPTN (1,0), CALC (1,1), INTEGRAL (1,2), X_VAR (1,3)
    ['OPTN', 'CALC', 'INTEGRAL', 'X_VAR'],

    // Row 2: func-grid hàng 1 (6 cột)
    ['FRAC', 'SQRT', 'SQUARE', 'POWER', 'LOG_BASE', 'LN'],

    // Row 3: func-grid hàng 2 (6 cột)
    ['NEGATION', 'DEGREE', 'INVERSE', 'SIN', 'COS', 'TAN'],

    // Row 4: func-grid hàng 3 – STO … M+
    ['STO', 'ENG', 'LPAREN', 'RPAREN', 'SD', 'MPLUS'],

    // Row 5: num-grid – 7 8 9 DEL AC
    ['7', '8', '9', 'DEL', 'AC'],

    // Row 6: num-grid – 4 5 6 x ÷
    ['4', '5', '6', 'MULTIPLY', 'DIVIDE'],

    // Row 7: num-grid – 1 2 3 + −
    ['1', '2', '3', 'PLUS', 'MINUS'],

    // Row 8: num-grid – 0 . x10x Ans =
    ['0', 'DOT', 'EXP', 'ANS', 'EQUALS'],
  ];

  // ==========================================================
  //  2. CONSTRUCTOR
  // ==========================================================
  /**
   * @param {function(string): void} onKeySelect
   *   Callback khi người dùng nói "OK". Nhận giá trị data-key.
   *   Ví dụ: (key) => window.handleKey(key)
   * @param {object} [options]
   * @param {string}  [options.lang='vi-VN']
   * @param {number}  [options.debounceMs=600]   Chống gọi lặp (ms)
   * @param {number}  [options.okFlashMs=300]    Thời gian flash voice-active (ms)
   * @param {boolean} [options.autoRestart=true] Tự restart khi ngắt kết nối
   */
  constructor(onKeySelect, options = {}) {
    if (typeof onKeySelect !== 'function') {
      throw new TypeError('[VoiceGridCasioController] onKeySelect phải là function');
    }
    this._onKeySelect  = onKeySelect;
    this._lang         = options.lang        ?? 'vi-VN';
    this._debounceMs   = options.debounceMs  ?? 250;
    this._okFlashMs    = options.okFlashMs   ?? 250;
    this._autoRestart  = options.autoRestart ?? true;

    // Trạng thái con trỏ lưới
    this.currentRow = 0;
    this.currentCol = 0;

    // Chống gọi lặp
    this._lastProcessed  = '';
    this._lastActionTime = 0;

    this._recognition  = null;
    this._active       = false;
    this._prevFocusBtn = null;

    this._buildRecognition();
    console.info('[VoiceGridCasio] Sẵn sàng. Gọi .start() để bật.');
  }

  // ==========================================================
  //  3. KHỞI TẠO SPEECH RECOGNITION
  // ==========================================================
  _buildRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.warn('[VoiceGridCasio] Trình duyệt không hỗ trợ Web Speech API.');
      return;
    }

    const rec = new SR();
    rec.lang           = this._lang;
    rec.continuous     = true;
    rec.interimResults = true;   // BAT BUOC: bắt lệnh ngay khi đang nói
    rec.maxAlternatives = 1;

    rec.onresult = (e) => this._onResult(e);
    rec.onerror  = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('[VoiceGridCasio] Lỗi:', e.error);
      }
    };
    rec.onend = () => {
      if (this._active && this._autoRestart) {
        setTimeout(() => {
          if (this._active) {
            try { this._recognition.start(); } catch (_) {}
          }
        }, 30);
      }
    };

    this._recognition = rec;
  }

  // ==========================================================
  //  4. XỬ LÝ KẾT QUẢ GIỌNG NÓI (INTERIM + FINAL)
  // ==========================================================
  _onResult(event) {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    const text = transcript.trim().toLowerCase();
    if (!text) return;

    // --- DEBOUNCE / CHỐNG GỌI LẶP ---
    const now = Date.now();
    if (text === this._lastProcessed && (now - this._lastActionTime) < this._debounceMs) {
      return;
    }

    // Ưu tiên: reset > OK > di chuyển
    if (this._tryReset(text)) { this._commit(text, now); return; }
    if (this._tryOK(text))    { this._commit(text, now); return; }
    if (this._tryMove(text))  { this._commit(text, now); return; }
  }

  _commit(text, now) {
    this._lastProcessed  = text;
    this._lastActionTime = now;
  }

  // ==========================================================
  //  5. NLP — BỘ PHÂN TÍCH LỆNH
  // ==========================================================

  /** "về shift", "về gốc", "gốc" */
  _tryReset(text) {
    if (/về\s*shift|về\s*gốc|\bgốc\b/.test(text)) {
      this.currentRow = 0;
      this.currentCol = 0;
      this.updateVisualCursor();
      console.info('[VoiceGridCasio] Reset → SHIFT (0,0)');
      return true;
    }
    return false;
  }

  /** "ok", "ô kê", "ô-kê", "oke", "okay", "chọn" */
  _tryOK(text) {
    if (/\b(ok|ô\s*kê|ô-kê|oke|okay|chọn)\b/.test(text)) {
      const key = this._currentKey();
      if (!key) return false;
      console.info('[VoiceGridCasio] OK -> phím:', key);
      this._flashKey(key);
      this._onKeySelect(key);
      return true;
    }
    return false;
  }

  /** "lên/xuống/trái/phải" */
  _tryMove(text) {
    const RE = /\b(lên|len|xuống|xuong|suống|suong|uống|xuồng|xuổng|trái|trai|phải|phai)\b/g;
    let match;
    let moved = false;

    while ((match = RE.exec(text)) !== null) {
      const dir   = match[1];
      const steps = parseInt(match[2] || '1', 10);
      if (isNaN(steps) || steps < 1) continue;

      const GRID   = VoiceGridCasioController.GRID;
      const maxRow = GRID.length - 1;

      let d = dir;
      if (d === 'len') d = 'lên';
      if (['xuong', 'suống', 'suong', 'uống', 'xuồng', 'xuổng'].includes(d)) d = 'xuống';
      if (d === 'trai') d = 'trái';
      if (d === 'phai') d = 'phải';

      switch (d) {
        case 'lên':
          this.currentRow = Math.max(0, this.currentRow - 1);
          break;
        case 'xuống':
          this.currentRow = Math.min(maxRow, this.currentRow + 1);
          break;
        case 'trái':
          this.currentCol = Math.max(0, this.currentCol - 1);
          break;
        case 'phải': {
          const rowMax = (GRID[this.currentRow]?.length ?? 1) - 1;
          this.currentCol = Math.min(rowMax, this.currentCol + 1);
          break;
        }
      }

      // Clamp col vào giới hạn hàng mới
      const newRowLen = GRID[this.currentRow]?.length ?? 1;
      this.currentCol = Math.min(this.currentCol, newRowLen - 1);

      moved = true;
      console.info(
        [VoiceGridCasio]   -> (,) key=
      );
    }

    if (moved) {
      this.updateVisualCursor();
      return true;
    }
    return false;
  }

  // ==========================================================
  //  6. HELPERS
  // ==========================================================

  _currentKey() {
    return VoiceGridCasioController.GRID[this.currentRow]?.[this.currentCol] ?? null;
  }

  _findBtn(key) {
    if (!key) return null;
    return document.querySelector(#casio-app [data-key=""]);
  }

  // ==========================================================
  //  7. PHẢN HỒI GIAO DIỆN
  // ==========================================================

  updateVisualCursor() {
    // Xoá focus cũ
    if (this._prevFocusBtn) {
      this._prevFocusBtn.classList.remove('voice-focus');
      this._prevFocusBtn = null;
    }
    // Gắn focus mới
    const key = this._currentKey();
    const btn = this._findBtn(key);
    if (!btn) return;

    btn.classList.add('voice-focus');
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    this._prevFocusBtn = btn;
  }

  _flashKey(key) {
    const btn = this._findBtn(key);
    if (!btn) return;
    btn.classList.add('voice-active');
    setTimeout(() => btn.classList.remove('voice-active'), this._okFlashMs);
  }

  // ==========================================================
  //  8. START / STOP / TOGGLE
  // ==========================================================

  start() {
    if (!this._recognition) {
      console.warn('[VoiceGridCasio] Không có SpeechRecognition. Không thể bật.');
      return this;
    }
    if (this._active) return this;

    this._active         = true;
    this._lastProcessed  = '';
    this._lastActionTime = 0;

    try {
      this._recognition.start();
      this.updateVisualCursor();
      console.info('[VoiceGridCasio] DA BAT. Nói: xuong/len/trai/phai [N], ok, goc...');
    } catch (e) {
      console.error('[VoiceGridCasio] Không thể khởi động:', e);
    }
    return this;
  }

  stop() {
    this._active = false;
    if (this._recognition) {
      try { this._recognition.stop(); } catch (_) {}
    }
    if (this._prevFocusBtn) {
      this._prevFocusBtn.classList.remove('voice-focus');
      this._prevFocusBtn = null;
    }
    console.info('[VoiceGridCasio] Đã tắt.');
    return this;
  }

  toggle() {
    return this._active ? this.stop() : this.start();
  }

  get isActive() { return this._active; }

  get position() {
    return { row: this.currentRow, col: this.currentCol, key: this._currentKey() };
  }
}
