/**
 * GestureMatcher — Gaze gesture recognition via Dynamic Time Warping
 *
 * Encodes gaze direction as 8-directional sequence, then matches
 * against gesture templates using DTW distance.
 *
 * Gestures:
 *   - C (Clear):   CCW semi-circle
 *   - V (Paste):   down-right-up
 *   - Z (Undo):    left-down-right
 *   - O (Menu):    full circle CW
 */
export class GestureMatcher {
  constructor() {
    this.buffer = [];        // [{ dx, dy, dir, t }]
    this.maxLength = 60;
    this.minLength = 15;
    this.matchThreshold = 0.65;

    // Templates: sequence of directions (0-7)
    this.templates = {
      'C':  [2, 2, 1, 1, 0, 7, 7, 6, 6],     // CCW arc
      'V':  [4, 3, 2, 1, 0, 7, 0],            // down-right-up
      'Z':  [0, 7, 6, 5, 4, 3, 2],            // left-down-right
      'O':  [3, 2, 1, 0, 7, 6, 5, 4, 3, 4],  // full circle
      'S':  [3, 3, 2, 2, 1, 1, 0, 0, 7, 7],  // horizontal line
    };

    this._lastDir = -1;
    this._lastMatch = null;
    this._lastMatchTime = 0;
  }

  /**
   * Add a gaze movement sample
   * @param {number} x - filtered gaze x (0-1)
   * @param {number} y - filtered gaze y (0-1)
   * @param {number} timestamp
   */
  addSample(x, y, timestamp) {
    if (this.buffer.length === 0) {
      this.buffer.push({ x, y, dir: -1, t: timestamp });
      return;
    }

    const prev = this.buffer[this.buffer.length - 1];
    const dx = x - prev.x;
    const dy = y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Only record significant movements
    if (dist < 0.015) return;

    const dir = this._direction(dx, dy);

    // Skip consecutive same-direction samples
    if (dir === this._lastDir) return;
    this._lastDir = dir;

    this.buffer.push({ dx, dy, dir, t: timestamp });
    if (this.buffer.length > this.maxLength) {
      this.buffer.shift();
    }
  }

  /**
   * Check if current buffer matches any gesture
   * @returns {null|{ gesture: string, score: number }}
   */
  match() {
    const seq = this.buffer
      .filter(s => s.dir >= 0)
      .map(s => s.dir);

    if (seq.length < this.minLength) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (const [name, template] of Object.entries(this.templates)) {
      const dist = this._dtw(seq, template);
      const maxDist = Math.max(seq.length, template.length) * 2;
      const score = 1 - (dist / maxDist);

      if (score > this.matchThreshold && score > bestScore) {
        bestScore = score;
        bestMatch = { gesture: name, score };
      }
    }

    if (bestMatch) {
      this._lastMatch = bestMatch;
      this._lastMatchTime = Date.now();
      this.buffer = []; // Clear after match
    }

    return bestMatch;
  }

  /** Get last matched gesture (for debounce) */
  getLastMatch(cooldownMs = 2000) {
    if (this._lastMatch && Date.now() - this._lastMatchTime < cooldownMs) {
      return this._lastMatch;
    }
    return null;
  }

  /** Map gesture name to EyeAssist action */
  static gestureToAction(name) {
    const map = {
      'C': 'clear',
      'V': 'paste',
      'Z': 'undo',
      'O': 'menu',
      'S': 'equals'
    };
    return map[name] || null;
  }

  reset() {
    this.buffer = [];
    this._lastDir = -1;
  }

  // --- Private ---

  /** Encode (dx, dy) → 0-7 direction */
  _direction(dx, dy) {
    const angle = Math.atan2(dy, -dx) * (180 / Math.PI);
    const norm = ((angle % 360) + 360) % 360;
    return Math.round(norm / 45) % 8;
  }

  /** DTW distance between two sequences */
  _dtw(a, b) {
    const n = a.length;
    const m = b.length;
    const dtw = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));

    for (let i = 1; i <= n; i++) dtw[i][0] = Infinity;
    for (let j = 1; j <= m; j++) dtw[0][j] = Infinity;
    dtw[0][0] = 0;

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const cost = Math.abs(a[i - 1] - b[j - 1]);
        dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
      }
    }

    return dtw[n][m];
  }
}
