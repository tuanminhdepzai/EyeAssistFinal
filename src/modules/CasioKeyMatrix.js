/**
 * CasioKeyMatrix — Gaze hit-test bridge to real Casio DOM buttons
 *
 * Instead of generating buttons, this queries the actual Casio DOM
 * buttons (data-key attributes) and routes gaze+blink to handleKey().
 */
export class CasioKeyMatrix {
  constructor() {
    this.activeKey = null;
    this.previewKey = null;
    this.container = null;
    /** Snap hysteresis: prevents flicker between adjacent buttons */
    this._snapKey = null;           // current snapped key ID
    this._snapCx = 0;              // center X of current snap target
    this._snapCy = 0;              // center Y of current snap target
    this._snapHysteresis = 10;     // px — must move this far from center before re-snap
    this._lastKey = null;
    this._lastPressTime = 0;
  }

  /** No-op: the real Casio HTML is already in the page */
  render(container) {
    this.container = container;
  }

  /**
   * Find key at given viewport coordinates (for gaze hit testing)
   * @param {number} x - viewport X
   * @param {number} y - viewport Y
   * @returns {string|null} data-key value, or null if no key hit
   */
  hitTest(x, y) {
    const buttons = document.querySelectorAll('#casio-app [data-key]');
    const pad = 8; // expand hit area slightly for gaze
    for (const btn of buttons) {
      const rect = btn.getBoundingClientRect();
      if (x >= rect.left - pad && x <= rect.right + pad &&
          y >= rect.top - pad && y <= rect.bottom + pad) {
        return btn.dataset.key;
      }
    }
    return null;
  }

  /**
   * Snap viewport coords to nearest key center within radius (magnetic effect)
   * @param {number} x - viewport X
   * @param {number} y - viewport Y
   * @param {number} [radius=60] - snap radius in pixels
   * @returns {{ key:string, cx:number, cy:number }|null}
   */
  snapToNearest(x, y, radius = 60) {
    const buttons = document.querySelectorAll('#casio-app [data-key]');
    let best = null;
    let bestDist = Infinity;
    for (const btn of buttons) {
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const d = Math.hypot(x - cx, y - cy);
      if (d < bestDist && d < radius) {
        bestDist = d;
        best = { key: btn.dataset.key, cx, cy };
      }
    }

    // Hysteresis: don't re-snap until gaze leaves current snap center by threshold
    if (best && this._snapKey) {
      if (best.key !== this._snapKey) {
        const distFromCurrent = Math.hypot(x - this._snapCx, y - this._snapCy);
        if (distFromCurrent < this._snapHysteresis) {
          // Stay on current button
          return { key: this._snapKey, cx: this._snapCx, cy: this._snapCy };
        }
      }
    }

    // Update snap state
    if (best) {
      this._snapKey = best.key;
      this._snapCx = best.cx;
      this._snapCy = best.cy;
    } else {
      this._snapKey = null;
    }

    return best;
  }

  /**
   * Simulate key press from blink click
   * @param {string} keyId - data-key value (e.g., "7", "PLUS", "SHIFT")
   */
  pressKey(keyId) {
    if (!keyId) return;
    const now = performance.now();
    if (this._lastKey === keyId && (now - this._lastPressTime < 280)) {
      return; // Chống lặp phím trùng trong thời gian ngắn
    }
    this._lastKey = keyId;
    this._lastPressTime = now;

    // Call the real Casio engine
    if (window.handleKey) {
      window.handleKey(keyId);
      window.saveState && window.saveState();
    }
    // Flash animation on the button
    const btn = document.querySelector(`#casio-app [data-key="${CSS.escape(keyId)}"]`);
    if (btn) {
      btn.style.transform = 'scale(0.92)';
      btn.style.transition = 'transform 0.05s';
      setTimeout(() => { btn.style.transform = ''; }, 100);
    }
  }

  /**
   * Set gaze hover highlight on a key
   * @param {string} keyId - data-key value
   */
  setGazeHover(keyId) {
    // Clear previous highlights
    document.querySelectorAll('#casio-app [data-key].gaze-hover')
      .forEach(el => el.classList.remove('gaze-hover'));

    if (!keyId) return;

    const btn = document.querySelector(`#casio-app [data-key="${CSS.escape(keyId)}"]`);
    if (btn) {
      btn.classList.add('gaze-hover');
    }
  }

  /**
   * Set gaze preview (dwell indicator) on a key
   * @param {string} keyId
   */
  setGazePreview(keyId) {
    document.querySelectorAll('#casio-app [data-key].gaze-preview')
      .forEach(el => el.classList.remove('gaze-preview'));

    if (keyId) {
      const btn = document.querySelector(`#casio-app [data-key="${CSS.escape(keyId)}"]`);
      if (btn) btn.classList.add('gaze-preview');
    }
  }

  /** No-op: function mode toggling is handled internally by Casio engine */
  toggleFunctionMode() {}
}
