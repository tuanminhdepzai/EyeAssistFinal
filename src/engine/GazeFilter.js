/**
 * GazeFilter — One Euro Filter + Adaptive Dead Zone
 *
 * Two-stage pipeline:
 *   1. One Euro Filter (smooth jitter)
 *   2. Adaptive Dead Zone (snap-to when gaze is stable)
 *
 * Dead zone: nếu gaze di chuyển < radius trong 100ms → giữ nguyên vị trí
 * Khi người dùng di chuyển chủ đích → velocity cao → vượt dead zone → responsive
 */
export class GazeFilter {
  constructor() {
    this._minCutoff = 1.0;        // Smoother (was 2.0)
    this._beta = 0.6;             // More velocity-dependent smoothing (was 0.3)
    this._derivativeCutoff = 1.0; // Smoother derivative (was 2.0)
    // per-dimension state
    this._xf = { y: 0, dy: 0, prevTime: 0, hasPrev: false };
    this._yf = { y: 0, dy: 0, prevTime: 0, hasPrev: false };

    // Dead zone state
    this._deadZoneRadius = 0.02;  // 2% of screen — auto-adjusted
    this._dzX = 0.5;              // Dead zone center X
    this._dzY = 0.5;              // Dead zone center Y
    this._dzStableSince = 0;      // Timestamp when entered dead zone
    this._dzActive = false;
    this._dzSample = [];           // Position samples for velocity estimation
    this._maxDzSamples = 10;
  }

  /**
   * Filter gaze position with dead zone
   * @param {number} rawX - raw x position (0-1)
   * @param {number} rawY - raw y position (0-1)
   * @param {number} timestamp - performance.now()
   * @returns {{ x: number, y: number }}
   */
  filter(rawX, rawY, timestamp) {
    // Step 1: One Euro Filter
    let fx = this._filterDim(rawX, timestamp, this._xf);
    let fy = this._filterDim(rawY, timestamp, this._yf);

    // Step 2: Adaptive Dead Zone
    return this._applyDeadZone(fx, fy, timestamp);
  }

  _applyDeadZone(x, y, timestamp) {
    // Estimate velocity from recent samples
    this._dzSample.push({ x, y, t: timestamp });
    if (this._dzSample.length > this._maxDzSamples) this._dzSample.shift();

    const velocity = this._estimateVelocity();

    if (!this._dzActive) {
      // Check if we should enter dead zone
      if (velocity < this._deadZoneRadius * 0.5) {
        this._dzActive = true;
        this._dzX = x;
        this._dzY = y;
        this._dzStableSince = timestamp;
        return { x, y };
      }
      return { x, y };
    }

    // In dead zone: is movement still small?
    const dx = x - this._dzX;
    const dy = y - this._dzY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this._deadZoneRadius) {
      // Stay in dead zone — keep position steady
      const held = timestamp - this._dzStableSince;
      if (held > 100) {
        // After 100ms stable, snap to exact center (eliminates micro-jitter)
        return { x: this._dzX, y: this._dzY };
      }
      return { x, y };
    }

    // Exited dead zone — user is moving intentionally
    this._dzActive = false;
    // Smooth exit: blend from dead zone center to actual position
    const blend = Math.min(1, dist / (this._deadZoneRadius * 3));
    return {
      x: this._dzX + dx * blend,
      y: this._dzY + dy * blend
    };
  }

  _estimateVelocity() {
    const len = this._dzSample.length;
    if (len < 3) return 1;
    // Use last 3 samples (~100ms at 30fps) for responsive velocity
    const last = this._dzSample[len - 1];
    const first = this._dzSample[Math.max(0, len - 3)];
    const dt = Math.max(last.t - first.t, 1);
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    return Math.sqrt(dx * dx + dy * dy) / dt * 100;  // normalized per 100ms
  }

  // --- One Euro Filter ---

  _filterDim(value, timestamp, state) {
    if (!state.hasPrev) {
      state.y = value;
      state.hasPrev = true;
      state.prevTime = timestamp;
      return value;
    }

    const dt = Math.max(timestamp - state.prevTime, 0.001);
    state.prevTime = timestamp;

    const cutoff = this._minCutoff + this._beta * Math.abs(state.dy);
    const alpha = this._smoothingFactor(cutoff, dt);
    const y = state.y + alpha * (value - state.y);

    const derivCutoff = this._derivativeCutoff;
    const alphaDeriv = this._smoothingFactor(derivCutoff, dt);
    state.dy = alphaDeriv * ((y - state.y) / dt) + (1 - alphaDeriv) * state.dy;

    state.y = y;
    return y;
  }

  _smoothingFactor(cutoff, dt) {
    const r = 2 * Math.PI * cutoff * dt;
    return r / (r + 1);
  }

  /** Update filter based on measured jitter */
  tune(jitterMeasurement) {
    this._beta = Math.min(1.0, Math.max(0.05, jitterMeasurement * 5));
    // Auto-adjust dead zone radius based on jitter
    this._deadZoneRadius = Math.min(0.08, Math.max(0.01, jitterMeasurement * 3));
  }

  /**
   * Trạng thái fixation hiện tại — dùng làm context cho BlinkClassifier
   * (Phase 2): gaze đứng yên trong dead-zone càng lâu → fixationStable càng cao.
   * @param {number} timestamp - performance.now()
   * @returns {{ stable:number, holdMs:number, velocity:number }}
   */
  getFixationState(timestamp = performance.now()) {
    const velocity = this._estimateVelocity();
    if (!this._dzActive) {
      return { stable: 0, holdMs: 0, velocity };
    }
    const holdMs = Math.max(0, timestamp - this._dzStableSince);
    return {
      stable: Math.min(1, holdMs / 300),   // 300ms → stable=1
      holdMs,
      velocity
    };
  }

  reset() {
    this._xf.hasPrev = false;
    this._yf.hasPrev = false;
    this._dzSample = [];
    this._dzActive = false;
  }
}
