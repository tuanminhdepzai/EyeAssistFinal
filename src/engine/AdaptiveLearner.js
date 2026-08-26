/**
 * AdaptiveLearner — Bayesian online learning + k-means + BlinkBaseline
 *
 * Learns per-user:
 *   - EAR threshold (blink depth, từ open-eye baseline)
 *   - Duration threshold (natural vs intentional boundary via k-means)
 *   - Jitter tolerance (cho GazeFilter)
 *   - Per-feature baseline phân phối (BlinkBaseline — Welford online stats):
 *     ngưỡng động cho BlinkDetector & BlinkClassifier (Phase 1)
 *
 * k-means (k=2) clusters blink durations into natural vs intentional
 * (fallback khi BlinkBaseline chưa đủ mẫu).
 */
import { BlinkBaseline } from './BlinkBaseline.js';

export class AdaptiveLearner {
  constructor() {
    // Per-feature online baseline (Phase 1)
    this.baseline = new BlinkBaseline();

    // EAR threshold
    this.ear = { mu: 0.22, sigma: 0.05 };
    this.earOpenMu = 0.30;
    this.earClosedMu = 0.14;

    // Duration threshold (will be set by k-means)
    this.duration = { mu: 250, sigma: 50 };

    // Jitter tolerance
    this.jitter = { mu: 0.05, sigma: 0.02 };

    // Learning state
    this.totalBlinkCount = 0;
    this.blinkBuffer = [];  // { duration, earMin, asymmetry, type } — last 100
    this.earValues = [];
    this.maxSamples = 200;
    this.isStable = false;
    this.confidence = 0;

    // k-means state
    this._clusterCenterNatural = 150;    // initial: typical natural blink
    this._clusterCenterIntentional = 500; // initial: typical intentional blink
    this._clusterUpdateCount = 0;
  }

  /**
   * Update from a completed blink event
   * @param {Object} blink - { type, duration, earLeft, earRight, asymmetry, features }
   */
  updateFromBlink(blink) {
    this.totalBlinkCount++;
    this.blinkBuffer.push({
      duration: blink.duration,
      earMin: blink.features?.earMin || 0,
      asymmetry: blink.features?.asymmetry || blink.asymmetry || 0,
      type: blink.type || 'unknown',
      closeVelocity: blink.features?.closeVelocity || 0,
      holdTime: blink.features?.holdTime || 0,
      bilateralCorr: blink.features?.bilateralCorr || 1
    });
    if (this.blinkBuffer.length > this.maxSamples) this.blinkBuffer.shift();

    // Phase 1: cập nhật per-feature baseline (chỉ nháy đã phân loại rõ ràng)
    if (blink.type === 'natural' || blink.type === 'intentional') {
      this.baseline.update({
        type: blink.type,
        duration: blink.duration,
        earMin: blink.features?.earMin ?? blink.earMin ?? 0,
        asymmetry: blink.features?.asymmetry ?? blink.asymmetry ?? 0,
        closeVelocity: blink.features?.closeVelocity ?? 0,
        openVelocity: blink.features?.openVelocity ?? 0,
        holdTime: blink.features?.holdTime ?? 0,
        bilateralCorr: blink.features?.bilateralCorr ?? 1,
        gap: blink.features?.gap ?? 0
      });
    }

    // Update EAR baselines
    if (blink.type === 'natural') {
      this._updateNatural(blink);
    } else {
      this._updateIntentional(blink);
    }

    // Run k-means periodically to find duration threshold
    if (this.totalBlinkCount > 10 && this.totalBlinkCount % 3 === 0) {
      this._runKMeans();
    }

    // Update jitter from features if available
    if (blink.features?.closeVelocity) {
      const jitterEst = Math.abs(blink.features.closeVelocity - 0.5) * 0.02;
      this.updateFromGaze(jitterEst);
    }

    this._recomputeConfidence();
  }

  /**
   * Update from open-eye EAR values (track baseline)
   */
  updateFromOpenEar(earLeft, earRight) {
    const avg = (earLeft + earRight) / 2;
    this.earValues.push(avg);
    if (this.earValues.length > this.maxSamples) this.earValues.shift();

    this.earOpenMu = 0.995 * this.earOpenMu + 0.005 * avg;
    const newEar = (this.earOpenMu + this.earClosedMu) / 2;
    this.ear.mu = 0.98 * this.ear.mu + 0.02 * newEar;
  }

  /** Update from gaze jitter measurement */
  updateFromGaze(jitter) {
    this.jitter.mu = 0.99 * this.jitter.mu + 0.01 * jitter;
    this.jitter.sigma = Math.abs(jitter - this.jitter.mu) * 0.01;
  }

  /** Get current EAR threshold */
  getEARThreshold() {
    return Math.round(this.ear.mu * 1000) / 1000;
  }

  /** Get current duration threshold (ms) — from k-means */
  getDurationThreshold() {
    return Math.round((this._clusterCenterNatural + this._clusterCenterIntentional) / 2);
  }

  /**
   * Get toàn bộ ngưỡng động cho BlinkDetector (Phase 1)
   * Dùng BlinkBaseline khi đã đủ mẫu, fallback về k-means + defaults.
   */
  getThresholds() {
    const defaults = {
      earThreshold: this.getEARThreshold(),
      earClosedThreshold: this.earClosedMu,
      naturalDurationMax: this.getDurationThreshold(),
      shortBlinkMax: 700,
      holdTimeMaxNatural: 30,
      minNaturalCloseVel: 0.3,
      minNaturalOpenVel: 0.25,
      minNaturalCorr: 0.7
    };
    return this.baseline.getThresholds(defaults);
  }

  /** Tóm tắt baseline cho UI/analytics */
  getBaselineSummary() {
    return this.baseline.summary();
  }

  /** Baseline đã sẵn sàng chưa? */
  get isBaselineReady() {
    return this.baseline.isReady;
  }

  /** Get current jitter tolerance */
  getJitterTolerance() {
    return Math.round(this.jitter.mu * 1000) / 1000;
  }

  /** Probability blink is natural (using k-means) */
  isNatural(duration) {
    if (this.totalBlinkCount < 10) return duration < 200;
    const distNatural = Math.abs(duration - this._clusterCenterNatural);
    const distIntentional = Math.abs(duration - this._clusterCenterIntentional);
    return distNatural < distIntentional;
  }

  /** Serialize for storage */
  serialize() {
    return {
      ear: this.ear,
      duration: this.duration,
      jitter: this.jitter,
      totalBlinkCount: this.totalBlinkCount,
      isStable: this.isStable,
      confidence: this.confidence,
      clusterNatural: this._clusterCenterNatural,
      clusterIntentional: this._clusterCenterIntentional,
      baseline: this.baseline.serialize()   // Phase 1
    };
  }

  deserialize(data) {
    if (!data) return;
    const { baseline, ...rest } = data;
    Object.assign(this, rest);
    if (baseline) this.baseline.deserialize(baseline);
  }

  // --- Private ---

  _updateNatural(blink) {
    this.duration.mu = 0.9 * this.duration.mu + 0.1 * blink.duration;
    this.duration.sigma = Math.max(20, Math.abs(blink.duration - this.duration.mu) * 0.1);
  }

  _updateIntentional(blink) {
    // != null bắt cả null lẫn undefined (tránh trượt earClosedMu về 0)
    if (blink.earLeft != null && blink.earRight != null) {
      const closedAvg = (blink.earLeft + blink.earRight) / 2;
      this.earClosedMu = 0.9 * this.earClosedMu + 0.1 * closedAvg;
    }
    this.duration.mu = 0.98 * this.duration.mu + 0.02 * (blink.duration + this.duration.mu) / 2;
  }

  /**
   * k-means clustering (k=2) on blink durations
   * Separates natural (short) from intentional (long) blinks
   */
  _runKMeans() {
    const recent = this.blinkBuffer.map(b => b.duration);
    if (recent.length < 10) return;

    // Initialize centers if needed (use percentiles)
    const sorted = [...recent].sort((a, b) => a - b);
    const p25 = sorted[Math.floor(sorted.length * 0.25)];
    const p75 = sorted[Math.floor(sorted.length * 0.75)];

    let c1 = this._clusterCenterNatural;
    let c2 = this._clusterCenterIntentional;

    // 5 iterations of k-means (k=2, 1D — cheap)
    for (let iter = 0; iter < 5; iter++) {
      let sum1 = 0, sum2 = 0, count1 = 0, count2 = 0;

      for (const d of recent) {
        const dist1 = Math.abs(d - c1);
        const dist2 = Math.abs(d - c2);
        if (dist1 <= dist2) {
          sum1 += d; count1++;
        } else {
          sum2 += d; count2++;
        }
      }

      if (count1 > 0) c1 = sum1 / count1;
      if (count2 > 0) c2 = sum2 / count2;

      // Ensure c1 < c2 (smaller cluster = natural = short)
      if (c1 > c2) {
        [c1, c2] = [c2, c1];
      }
    }

    // Smooth update (prevent oscillation)
    this._clusterCenterNatural = 0.7 * this._clusterCenterNatural + 0.3 * c1;
    this._clusterCenterIntentional = 0.7 * this._clusterCenterIntentional + 0.3 * c2;
    this._clusterUpdateCount++;
  }

  _recomputeConfidence() {
    const factor = this.totalBlinkCount / (this.totalBlinkCount + 50);
    this.confidence = Math.round(factor * 100) / 100;
    this.isStable = this.totalBlinkCount >= 50 && this._clusterUpdateCount >= 5;
  }
}
