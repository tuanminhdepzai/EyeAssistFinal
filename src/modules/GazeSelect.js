/**
 * GazeSelect — dropdown thay thế <select> native, vận hành hoàn toàn bằng mắt.
 *
 * Vấn đề của <select> gốc:
 *   1. .click() mở dropdown của HỆ ĐIỀU HÀNH — con trỏ mắt không thao tác được.
 *   2. Style do OS render, không ăn theme của ứng dụng.
 *
 * Giải pháp: ẩn <select> gốc (giữ lại làm source of truth cho .value), render
 * một nút trigger + panel chứa toàn <button type="button">. Vì các option là
 * button thật, đường gaze-click sẵn có (hitTestUIElement → target.click())
 * hoạt động mà không cần sửa logic blink/fusion.
 *
 * Khi chọn option: set select.value + dispatch Event('change') để inline
 * onchange="handUpdateStemLabels()" và mọi listener khác vẫn chạy.
 */
export class GazeSelect {
  constructor(selectEl) {
    this.select = selectEl;
    this.isOpen = false;
    this._build();
  }

  _build() {
    const sel = this.select;

    // Giữ select làm source of truth nhưng không cho render UI native
    sel.classList.add('gaze-select-hidden');
    sel.tabIndex = -1;

    // Wrapper đặt trong flow của form để layout không đổi
    this.root = document.createElement('div');
    this.root.className = 'gaze-select';
    sel.parentNode.insertBefore(this.root, sel.nextSibling);

    // Trigger button
    this.btn = document.createElement('button');
    this.btn.type = 'button';
    this.btn.className = 'gaze-select-btn';
    this.btn.setAttribute('aria-haspopup', 'listbox');
    this.btn.setAttribute('aria-expanded', 'false');
    this.btn.addEventListener('click', () => this.toggle());
    this.root.appendChild(this.btn);

    // Panel option — append vào body để không bị overflow-y của sidebar cắt
    this.panel = document.createElement('div');
    this.panel.className = 'gaze-select-panel';
    this.panel.setAttribute('role', 'listbox');
    document.body.appendChild(this.panel);

    Array.from(sel.options).forEach((opt) => {
      const ob = document.createElement('button');
      ob.type = 'button';
      ob.className = 'gaze-select-option';
      ob.setAttribute('role', 'option');
      ob.textContent = opt.textContent;
      ob.dataset.value = opt.value;
      ob.addEventListener('click', () => this.choose(opt.value));
      this.panel.appendChild(ob);
    });

    this._syncLabel();

    // Đóng khi click ra ngoài (hữu ích nếu có chuột/touch)
    this._onDocDown = (e) => {
      if (this.isOpen && !this.panel.contains(e.target) && !this.btn.contains(e.target)) {
        this.close();
      }
    };
    document.addEventListener('pointerdown', this._onDocDown, true);
  }

  _syncLabel() {
    const opt = this.select.selectedOptions[0];
    this.btn.textContent = '';
    const label = document.createElement('span');
    label.className = 'gaze-select-label';
    label.textContent = opt ? opt.textContent : '';
    const arrow = document.createElement('span');
    arrow.className = 'gaze-select-arrow';
    arrow.textContent = '▼'; // CSS tự xoay khi mở
    this.btn.appendChild(label);
    this.btn.appendChild(arrow);
    this.btn.title = opt ? opt.textContent : '';
  }

  _positionPanel() {
    const r = this.btn.getBoundingClientRect();
    this.panel.style.minWidth = `${Math.round(r.width)}px`;
    this.panel.style.left = `${Math.round(r.left)}px`;
    // Mặc định mở xuống; nếu sát đáy màn hình thì mở lên
    const spaceBelow = window.innerHeight - r.bottom;
    const estHeight = Math.min(this.panel.children.length * 48 + 12, 340);
    if (spaceBelow < estHeight && r.top > spaceBelow) {
      this.panel.style.top = 'auto';
      this.panel.style.bottom = `${Math.round(window.innerHeight - r.top + 6)}px`;
    } else {
      this.panel.style.bottom = 'auto';
      this.panel.style.top = `${Math.round(r.bottom + 6)}px`;
    }
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  open() {
    if (this.isOpen) return;
    // Đóng mọi dropdown khác trước — chỉ một panel mở tại một thời điểm
    GazeSelect._openInstance?.close();
    this.isOpen = true;
    this.panel.classList.add('open');
    this.btn.classList.add('open');
    this.btn.setAttribute('aria-expanded', 'true');
    this._positionPanel();
    this._markSelected();
    this._syncLabel();
    GazeSelect._openInstance = this;
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.panel.classList.remove('open');
    this.btn.classList.remove('open');
    this.btn.setAttribute('aria-expanded', 'false');
    this._syncLabel();
    if (GazeSelect._openInstance === this) GazeSelect._openInstance = null;
  }

  _markSelected() {
    const v = this.select.value;
    this.panel.querySelectorAll('.gaze-select-option').forEach((ob) => {
      ob.classList.toggle('selected', ob.dataset.value === v);
    });
  }

  choose(value) {
    this.select.value = value;
    this.close();
    // Báo cho mọi listener (inline onchange, module...) biết giá trị đổi
    this.select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** Đóng dropdown đang mở (nếu có) — gọi khi chuyển tab để panel không rò rỉ */
  static closeOpen() {
    GazeSelect._openInstance?.close();
  }

  dispose() {
    document.removeEventListener('pointerdown', this._onDocDown, true);
    this.close();
    this.root.remove();
    this.panel.remove();
    this.select.classList.remove('gaze-select-hidden');
  }
}

GazeSelect._openInstance = null;

/** Nâng cấp mọi <select class="stem-select"> trong container thành GazeSelect */
export function enhanceSelects(container) {
  const out = [];
  container.querySelectorAll('select.stem-select').forEach((sel) => {
    if (sel.dataset.gazeEnhanced) return;
    sel.dataset.gazeEnhanced = '1';
    out.push(new GazeSelect(sel));
  });
  return out;
}