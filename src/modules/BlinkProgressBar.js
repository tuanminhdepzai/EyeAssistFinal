/**
 * BlinkProgressBar — Dwell-Blink Confirmation UI (Phase 3)
 *
 * Khi phát hiện nháy mắt chủ đích, thay vì kích hoạt lệnh NGAY, hệ thống:
 *   1. Hiện vòng tròn tiến trình tại vị trí con trỏ (SVG, fixed position).
 *   2. Vòng lấp đầy trong confirmMs (mặc định 600ms) — người dùng biết rõ
 *      nháy mắt đã được ghi nhận và lệnh sắp được thực thi.
 *   3. HỦY THÔNG MINH trong lúc chờ:
 *        - gaze rời khỏi mục tiêu quá cancelRadius px  → hủy (gaze_moved)
 *        - một natural blink khác xảy ra               → hủy (natural_blink)
 *        - nháy chủ đích thứ 2 xuất hiện               → nâng cấp thành
 *          double-blink, xác nhận nhanh hơn (double → chủ đích rõ ràng)
 *   4. Hoàn tất → vòng chuyển xanh + beep xác nhận + callback onConfirm.
 *
 * Cơ chế cancel bảo vệ chống false-positive cực tốt: nháy tự nhiên vô tình
 * bị phân loại nhầm thành chủ đích vẫn có thể bị hủy bằng cách nhìn đi chỗ
 * khác trong ~0.5s.
 *
 * DOM được tạo động (không cần sửa HTML), gắn vào document.body với
 * position: fixed → hoạt động trên cả tab Casio lẫn tab Vật Lý.
 */
export class BlinkProgressBar {
  constructor(options = {}) {
    this.confirmMs = options.confirmMs ?? 600;
    this.winkConfirmMs = options.winkConfirmMs ?? 400;
    this.doubleConfirmMs = options.doubleConfirmMs ?? 350;
    this.cancelRadius = options.cancelRadius ?? 48;   // px — gaze rời xa → hủy
    this.enabled = options.enabled ?? true;

    this._el = null;
    this._ringBg = null;
    this._ringFill = null;
    this._label = null;
    this._raf = 0;
    this._state = 'idle';          // 'idle' | 'filling' | 'confirmed' | 'cancelled'
    this._start = 0;
    this._confirmMs = this.confirmMs;
    this._data = null;             // { blink, x, y, target }
    this._lastTickPct = 0;

    // DOM refs cho chip phân loại (hiển thị natural/intentional liên tục)
    this._chip = null;
    this._chipTimeout = 0;

    this.callbacks = {
      onConfirm: () => {},         // (data) — data.blink để gửi fusion
      onCancel: () => {},          // (data, reason)
      onProgress: () => {}         // (pct, data)
    };
  }

  /** Tạo DOM nếu chưa có */
  _ensureDom() {
    if (this._el) return;

    this._el = document.createElement('div');
    this._el.id = 'blink-progress-layer';
    this._el.innerHTML = `
      <div id="blink-progress-ring">
        <svg width="72" height="72" viewBox="0 0 72 72">
          <circle class="blink-ring-bg" cx="36" cy="36" r="30" fill="none" stroke-width="5"/>
          <circle class="blink-ring-fill" cx="36" cy="36" r="30" fill="none" stroke-width="5"
                  stroke-linecap="round" stroke-dasharray="188.5" stroke-dashoffset="188.5"
                  transform="rotate(-90 36 36)"/>
        </svg>
        <div class="blink-ring-label"></div>
      </div>
      <div id="blink-classification-chip" class="hidden"></div>
    `;
    document.body.appendChild(this._el);

    this._ringBg = this._el.querySelector('.blink-ring-bg');
    this._ringFill = this._el.querySelector('.blink-ring-fill');
    this._label = this._el.querySelector('.blink-ring-label');
    this._chip = this._el.querySelector('#blink-classification-chip');
  }

  /**
   * Bắt đầu quá trình xác nhận một nháy chủ đích
   * @param {number} x - viewport X (vị trí con trỏ)
   * @param {number} y - viewport Y
   * @param {Object} blink - { subtype, duration, confidence, features }
   * @param {Object} opts - { target, confirmMs }
   */
  start(x, y, blink, opts = {}) {
    if (!this.enabled) {
      // Tắt xác nhận → fire ngay (fallback cho người dùng không muốn chờ)
      this.callbacks.onConfirm({ blink, x, y, target: opts.target, instant: true });
      return;
    }

    this._ensureDom();
    this._cancelPending();

    this._data = { blink, x, y, target: opts.target ?? null };
    this._confirmMs = opts.confirmMs
      ?? (blink.subtype === 'wink' ? this.winkConfirmMs
        : blink.subtype === 'double' ? this.doubleConfirmMs
        : this.confirmMs);

    // Vị trí vòng tròn tại con trỏ
    const ring = this._el.querySelector('#blink-progress-ring');
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.classList.remove('confirmed', 'cancelled');
    ring.classList.add('filling');
    ring.style.display = 'block';

    // Reset vòng về 0
    this._setProgress(0);
    this._label.textContent = '';

    this._state = 'filling';
    this._start = performance.now();
    this._lastTickPct = 0;

    this._raf = requestAnimationFrame((now) => this._tick(now));
  }

  /** Cập nhật vị trí gaze — nếu rời xa mục tiêu → hủy */
  updateGaze(x, y) {
    if (this._state !== 'filling' || !this._data) return;
    const dx = x - this._data.x;
    const dy = y - this._data.y;
    if (Math.hypot(dx, dy) > this.cancelRadius) {
      this.cancel('gaze_moved');
    }
  }

  /** Hủy quá trình xác nhận */
  cancel(reason = 'manual') {
    if (this._state !== 'filling') return;
    this._cancelPending();
    this._state = 'cancelled';
    if (this._data) this.callbacks.onCancel(this._data, reason);

    if (this._el) {
      const ring = this._el.querySelector('#blink-progress-ring');
      ring.classList.remove('filling');
      ring.classList.add('cancelled');
      this._label.textContent = '✕';
      setTimeout(() => {
        if (ring) ring.style.display = 'none';
      }, 400);
    }
    this._data = null;
  }

  /** Nâng cấp nháy hiện tại thành double (khi nháy chủ đích thứ 2 xuất hiện) */
  upgradeToDouble(blink) {
    if (this._state !== 'filling' || !this._data) return false;
    // Restart với thời gian xác nhận ngắn hơn
    this._data.blink = { ...this._data.blink, subtype: 'double', ...blink };
    this._confirmMs = this.doubleConfirmMs;
    this._start = performance.now();
    this._lastTickPct = 0;
    return true;
  }

  /**
   * Hiển thị chip phân loại gần con trỏ (feedback realtime về việc hệ thống
   * hiểu nháy mắt là tự nhiên hay chủ đích). Tự ẩn sau chipMs.
   */
  showClassification(x, y, classification) {
    this._ensureDom();
    // confidence = xác suất của loại được chọn (natural → 1-intentScore)
    const text = classification.type === 'natural'
      ? `Tự nhiên ${Math.round(classification.confidence * 100)}%`
      : classification.type === 'uncertain'
        ? `Mơ hồ ${Math.round(classification.confidence * 100)}%`
        : `Chủ đích ${Math.round(classification.confidence * 100)}%`;

    this._chip.textContent = text;
    this._chip.className = `type-${classification.type}`;
    this._chip.style.left = `${x + 26}px`;
    this._chip.style.top = `${y + 26}px`;
    this._chip.classList.remove('hidden');

    clearTimeout(this._chipTimeout);
    this._chipTimeout = setTimeout(() => {
      if (this._chip) this._chip.classList.add('hidden');
    }, 900);
  }

  /** Đang trong quá trình xác nhận? */
  get isActive() {
    return this._state === 'filling';
  }

  /** Dữ liệu nháy đang chờ xác nhận */
  get pendingData() {
    return this._data;
  }

  /** Ẩn mọi UI */
  hide() {
    this._cancelPending();
    this._state = 'idle';
    this._data = null;
    if (this._el) {
      const ring = this._el.querySelector('#blink-progress-ring');
      if (ring) ring.style.display = 'none';
    }
  }

  destroy() {
    this._cancelPending();
    if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
    this._el = null;
  }

  on(event, fn) {
    if (this.callbacks[event]) this.callbacks[event] = fn;
  }

  // --- Private ---

  _tick(now) {
    if (this._state !== 'filling') return;

    const elapsed = now - this._start;
    const pct = Math.min(1, elapsed / this._confirmMs);

    this._setProgress(pct);
    this.callbacks.onProgress(pct, this._data);

    // Tick âm thanh ở 50% (người dùng biết sắp kích hoạt)
    if (pct >= 0.5 && this._lastTickPct < 0.5) {
      if (this.onHalfTick) this.onHalfTick();
    }
    this._lastTickPct = pct;

    if (pct >= 1) {
      this._state = 'confirmed';
      const data = this._data;
      this._data = null;

      if (this._el) {
        const ring = this._el.querySelector('#blink-progress-ring');
        ring.classList.remove('filling');
        ring.classList.add('confirmed');
        this._label.textContent = '✓';
        setTimeout(() => {
          if (ring) ring.style.display = 'none';
        }, 500);
      }

      this.callbacks.onConfirm(data);
      return;
    }

    this._raf = requestAnimationFrame((t) => this._tick(t));
  }

  _setProgress(pct) {
    if (!this._ringFill) return;
    const circumference = 2 * Math.PI * 30;   // r=30
    this._ringFill.style.strokeDashoffset = String(circumference * (1 - pct));
  }

  _cancelPending() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  }
}
