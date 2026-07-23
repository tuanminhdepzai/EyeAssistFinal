/**
 * BlinkDetector — 8-feature natural vs intentional blink classifier
 *
 * States: OPEN → CLOSING → CLOSED → OPENING → OPEN
 *
 * 8 features per blink:
 *   1. Duration            — total blink time (ms)
 *   2. EAR min             — how deeply closed (0.0-0.3)
 *   3. Asymmetry           — |EAR_left - EAR_right| at peak
 *   4. Close velocity      — EAR drop rate (EAR/ms)
 *   5. Open velocity       — EAR rise rate (EAR/ms)
 *   6. Hold time           — time with EAR < 0.15 (ms)
 *   7. Inter-blink gap     — time since previous blink (ms)
 *   8. Bilateral corr      — correlation of left/right EAR during blink
 */
export class BlinkDetector {
  constructor(options = {}) {
    this.earThreshold = options.earThreshold || 0.22;
    this.earClosedThreshold = options.earClosedThreshold || 0.18;
    this.naturalDurationMax = options.naturalDurationMax || 250;
    this.shortBlinkMax = options.shortBlinkMax || 700;
    this.doubleGapMax = options.doubleGapMax || 500;
    this.minFramesClosed = 2;
    this.refractoryMs = 500;      // Ignore blinks after natural blink
    this._inRefractory = false;
    this._refractoryTimer = null;

    this.state = 'OPEN';
    this._framesBelow = 0;
    this._blinkStart = 0;
    this._prevBlinkEnd = 0;
    this._pendingDouble = null;

    // 8-feature recording
    this._earHistory = [];        // [{left, right, t}] during current blink
    this._closeVel = [];
    this._openVel = [];

    this.callbacks = {
      onIntentional: () => {},    // { type, duration, features, ... }
      onNatural: () => {},
      onWink: () => {},
      onStare: () => {}
    };

    this.stats = {
      totalNatural: 0,
      totalIntentional: 0,
      totalWinks: 0,
      avgDuration: 0
    };

    // Natural blink rate estimation (for refractory period)
    this._recentNaturalGaps = [];
  }

  /** Process one frame's EAR values */
  update(earLeft, earRight, timestamp) {
    const earAvg = (earLeft + earRight) / 2;
    const asymmetry = Math.abs(earLeft - earRight);

    // Refractory period: after natural blink, ignore intentional blinks briefly
    if (this._inRefractory && timestamp - this._prevBlinkEnd > this.refractoryMs) {
      this._inRefractory = false;
    }

    switch (this.state) {
      case 'OPEN':
        if (earAvg < this.earThreshold) {
          this._framesBelow++;
          if (this._framesBelow >= this.minFramesClosed) {
            this.state = 'CLOSING';
            this._blinkStart = timestamp;
            this._earHistory = [{ left: earLeft, right: earRight, t: timestamp }];
            this._closeVel = [];
            this._openVel = [];
          }
        } else {
          this._framesBelow = 0;
        }
        break;

      case 'CLOSING':
        this._earHistory.push({ left: earLeft, right: earRight, t: timestamp });
        this._closeVel.push((this._earHistory[this._earHistory.length - 1]?.left || earLeft) - earLeft);

        if (earAvg < this.earClosedThreshold) {
          this.state = 'CLOSED';
        } else if (earAvg > this.earThreshold + 0.03) {
          this.state = 'OPEN';
          this._framesBelow = 0;
        }
        break;

      case 'CLOSED':
        this._earHistory.push({ left: earLeft, right: earRight, t: timestamp });

        if (earAvg > this.earThreshold) {
          this.state = 'OPENING';
        }
        break;

      case 'OPENING':
        this._earHistory.push({ left: earLeft, right: earRight, t: timestamp });
        this._openVel.push(earLeft - (this._earHistory[this._earHistory.length - 2]?.left || earLeft));

        if (earAvg > this.earThreshold + 0.05) {
          const duration = timestamp - this._blinkStart;
          this._classify(duration, earLeft, earRight, timestamp);
          this.state = 'OPEN';
          this._framesBelow = 0;
        }
        break;
    }
  }

  /** Classify blink using all 8 features */
  _classify(duration, finalEarLeft, finalEarRight, timestamp) {
    // Extract features from history
    const features = this._extractFeatures();

    // Decision tree
    const isAsymmetric = features.asymmetry > 0.4;
    const isFast = duration < this.naturalDurationMax;
    const hasHold = features.holdTime > 30;
    const isBilateral = features.bilateralCorr > 0.7;
    const closeVel = features.closeVelocity;

    // --- Wink detection (asymmetric + one eye fully closes) ---
    if (isAsymmetric && !this._bothEyesClosed()) {
      const winkSide = this._whichWink();
      this.callbacks.onWink(winkSide, duration);
      this.stats.totalWinks++;
      this.stats.totalIntentional++;
      this._pendingDouble = null;
      return;
    }

    // --- Natural blink: fast, symmetric, no hold ---
    if (isFast && isBilateral && !hasHold && closeVel > 0.3) {
      this.callbacks.onNatural({ type: 'natural', duration, features });
      this.stats.totalNatural++;
      this._pendingDouble = null;
      this._recentNaturalGaps.push(timestamp - Math.max(this._prevBlinkEnd, timestamp - 10000));
      if (this._recentNaturalGaps.length > 10) this._recentNaturalGaps.shift();
      this._prevBlinkEnd = timestamp;
      this._inRefractory = true;
      return;
    }

    // --- Intentional blink: not natural, not wink ---
    this.stats.totalIntentional++;

    // Double blink check
    if (this._pendingDouble) {
      const gap = timestamp - this._pendingDouble.end;
      if (gap < this.doubleGapMax) {
        this.callbacks.onIntentional({
          type: 'double',
          duration,
          features
        });
        this._pendingDouble = null;
        return;
      }
    }

    this._pendingDouble = { start: this._blinkStart, end: timestamp };

    // Classify by duration
    if (duration < this.shortBlinkMax) {
      this.callbacks.onIntentional({ type: 'short', duration, features });
    } else {
      this.callbacks.onIntentional({ type: 'long', duration, features });
    }
  }

  /** Extract all 8 features from recorded history */
  _extractFeatures() {
    if (this._earHistory.length < 3) return this._defaultFeatures();

    const first = this._earHistory[0];
    const earVals = this._earHistory.map(e => (e.left + e.right) / 2);

    // 1. Duration
    const duration = this._earHistory[this._earHistory.length - 1].t - this._earHistory[0].t;

    // 2. EAR minimum
    const earMin = Math.min(...earVals);

    // 3. Asymmetry at peak
    const minIdx = earVals.indexOf(earMin);
    const atMin = this._earHistory[minIdx];
    const asymmetry = atMin ? Math.abs(atMin.left - atMin.right) : 0;

    // 4. Close velocity (EAR drop rate)
    const closePhase = this._earHistory.filter(e => e.t - first.t < duration * 0.4);
    const closeDrop = closePhase.length > 1
      ? (earVals[earVals.indexOf(Math.max(...closePhase.map(e => (e.left+e.right)/2)))] - earMin)
      : 0;
    const closeDuration = closePhase.length > 1
      ? (closePhase[closePhase.length - 1].t - closePhase[0].t)
      : 1;
    const closeVelocity = closeDuration > 0 ? closeDrop / closeDuration * 1000 : 0;

    // 5. Open velocity
    const openPhase = this._earHistory.filter(e => e.t - first.t > duration * 0.6);
    const openRise = openPhase.length > 1
      ? (earVals[earVals.indexOf(Math.max(...openPhase.map(e => (e.left+e.right)/2)))] - earMin)
      : 0;
    const openDuration = openPhase.length > 1
      ? (openPhase[openPhase.length - 1].t - openPhase[0].t)
      : 1;
    const openVelocity = openDuration > 0 ? openRise / openDuration * 1000 : 0;

    // 6. Hold time (EAR < 0.15)
    const holdSamples = this._earHistory.filter(e => (e.left + e.right) / 2 < 0.15);
    const holdTime = holdSamples.length > 1
      ? (holdSamples[holdSamples.length - 1].t - holdSamples[0].t)
      : 0;

    // 7. Inter-blink gap
    const gap = this._prevBlinkEnd > 0 ? this._earHistory[0].t - this._prevBlinkEnd : 5000;

    // 8. Bilateral correlation
    const leftVals = this._earHistory.map(e => e.left);
    const rightVals = this._earHistory.map(e => e.right);
    const corr = this._correlation(leftVals, rightVals);

    return {
      duration,
      earMin: Math.round(earMin * 1000) / 1000,
      asymmetry: Math.round(asymmetry * 1000) / 1000,
      closeVelocity: Math.round(closeVelocity * 10) / 10,
      openVelocity: Math.round(openVelocity * 10) / 10,
      holdTime: Math.round(holdTime),
      gap: Math.round(gap),
      bilateralCorr: Math.round(corr * 100) / 100
    };
  }

  _defaultFeatures() {
    return {
      duration: 0, earMin: 0, asymmetry: 0,
      closeVelocity: 0, openVelocity: 0,
      holdTime: 0, gap: 0, bilateralCorr: 0
    };
  }

  _bothEyesClosed() {
    return this._earHistory.some(e => e.left < 0.15 && e.right < 0.15);
  }

  _whichWink() {
    const avgLeft = this._earHistory.reduce((s, e) => s + e.left, 0) / this._earHistory.length;
    const avgRight = this._earHistory.reduce((s, e) => s + e.right, 0) / this._earHistory.length;
    return avgLeft < avgRight ? 'left' : 'right';
  }

  /** Pearson correlation coefficient */
  _correlation(a, b) {
    if (a.length < 3) return 1;
    const n = a.length;
    let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
    for (let i = 0; i < n; i++) {
      sumA += a[i]; sumB += b[i];
      sumAB += a[i] * b[i];
      sumA2 += a[i] * a[i];
      sumB2 += b[i] * b[i];
    }
    const num = n * sumAB - sumA * sumB;
    const den = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));
    return den === 0 ? 1 : num / den;
  }

  setThreshold(earThreshold, durationThreshold) {
    this.earThreshold = earThreshold;
    this.shortBlinkMax = durationThreshold;
  }

  on(event, fn) {
    if (this.callbacks[event]) this.callbacks[event] = fn;
  }
}
