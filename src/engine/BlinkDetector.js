/**
 * BlinkDetector — Enhanced blink state machine + adaptive classification
 *
 * States: OPEN → CLOSING → CLOSED → OPENING → OPEN
 *
 * Nâng cấp (Phase 1 + 2):
 *   - Ngưỡng ĐỘNG (setThresholds) học từ BlinkBaseline/AdaptiveLearner thay
 *     vì magic numbers cố định → thích nghi từng người dùng, ánh sáng, camera.
 *   - Feature set mở rộng lên 10 đặc trưng:
 *       1. Duration (ms)            6. Hold time (ms)
 *       2. EAR min                   7. Inter-blink gap (ms)
 *       3. Asymmetry tại đáy         8. Bilateral correlation
 *       4. Close velocity (EAR/s)    9. Velocity symmetry (đóng/mở cân đối)
 *       5. Open velocity (EAR/s)    10. Dip position (vị trí đáy trong chu kỳ)
 *   - Tích hợp BlinkClassifier: điểm tin cậy liên tục (0-1) thay vì cây
 *     quyết định nhị phân. Callback onClassified trả cả confidence + evidence.
 *   - Theo dõi blink rate (nháy/phút) làm context cho classifier.
 *
 * API tương thích ngược: on('onIntentional'|'onNatural'|'onWink'), setThreshold()
 * vẫn hoạt động; thêm setThresholds(obj), setClassifier(c), on('onClassified').
 */
import { BlinkClassifier } from './BlinkClassifier.js';

export class BlinkDetector {
  constructor(options = {}) {
    this.earThreshold = options.earThreshold ?? 0.22;
    this.earClosedThreshold = options.earClosedThreshold ?? 0.18;
    this.naturalDurationMax = options.naturalDurationMax ?? 250;
    this.shortBlinkMax = options.shortBlinkMax ?? 700;
    this.holdTimeMaxNatural = options.holdTimeMaxNatural ?? 30;
    this.minNaturalCloseVel = options.minNaturalCloseVel ?? 0.3;
    this.minNaturalOpenVel = options.minNaturalOpenVel ?? 0.25;
    this.minNaturalCorr = options.minNaturalCorr ?? 0.7;
    this.minFramesClosed = 2;
    this.doubleGapMax = options.doubleGapMax ?? 500;
    this.refractoryMs = 500;      // Bỏ qua blink ngay sau natural blink
    this._inRefractory = false;
    this._refractoryTimer = null;

    this.state = 'OPEN';
    this._framesBelow = 0;
    this._blinkStart = 0;
    this._prevBlinkEnd = 0;
    this._pendingDouble = null;

    // 10-feature recording
    this._earHistory = [];        // [{left, right, t}] during current blink
    this._closeVel = [];
    this._openVel = [];

    // Blink rate tracking (context cho classifier)
    this._blinkTimes = [];        // timestamps của các blink gần đây
    this._blinkRateWindow = 60000; // 60s

    this.callbacks = {
      onIntentional: () => {},    // { type, duration, features, confidence, ... }
      onNatural: () => {},
      onWink: () => {},
      onStare: () => {},
      onClassified: () => {},     // { type, confidence, evidence, blink }
      onCloseFrame: () => {}      // realtime mỗi frame khi mắt đang nhắm: { state, closedMs, earAvg }
    };

    this.stats = {
      totalNatural: 0,
      totalIntentional: 0,
      totalWinks: 0,
      avgDuration: 0
    };

    // BlinkClassifier (Phase 2) — có thể inject hoặc để detector tự tạo
    this.classifier = options.classifier || new BlinkClassifier();
  }

  /** Gắn classifier (chia sẻ baseline từ AdaptiveLearner) */
  setClassifier(classifier) {
    this.classifier = classifier;
  }

  /** Process one frame's EAR values */
  update(earLeft, earRight, timestamp) {
    const earAvg = (earLeft + earRight) / 2;
    const asymmetry = Math.abs(earLeft - earRight);

    // Refractory period: sau natural blink, bỏ qua tín hiệu ngắn
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
          this._classify(duration, timestamp);
          this.state = 'OPEN';
          this._framesBelow = 0;
        }
        break;
    }

    // Realtime callback: cho progress ring biết mắt đã nhắm được bao lâu
    // (chạy MỖI frame trong lúc nhắm — không chờ mở mắt xong mới phân loại)
    if (this.state === 'CLOSING' || this.state === 'CLOSED') {
      this.callbacks.onCloseFrame({
        state: this.state,
        closedMs: timestamp - this._blinkStart,
        earAvg
      });
    }
  }

  /** Đặt toàn bộ ngưỡng động (từ AdaptiveLearner.getThresholds) */
  setThresholds(t) {
    if (!t) return;
    if (typeof t.earThreshold === 'number') this.earThreshold = t.earThreshold;
    if (typeof t.earClosedThreshold === 'number') this.earClosedThreshold = t.earClosedThreshold;
    if (typeof t.naturalDurationMax === 'number') this.naturalDurationMax = t.naturalDurationMax;
    if (typeof t.shortBlinkMax === 'number') this.shortBlinkMax = t.shortBlinkMax;
    if (typeof t.holdTimeMaxNatural === 'number') this.holdTimeMaxNatural = t.holdTimeMaxNatural;
    if (typeof t.minNaturalCloseVel === 'number') this.minNaturalCloseVel = t.minNaturalCloseVel;
    if (typeof t.minNaturalOpenVel === 'number') this.minNaturalOpenVel = t.minNaturalOpenVel;
    if (typeof t.minNaturalCorr === 'number') this.minNaturalCorr = t.minNaturalCorr;
  }

  /** Classify blink — dùng classifier (confidence score) khi có thể */
  _classify(duration, timestamp) {
    // Track blink rate
    this._blinkTimes.push(timestamp);
    while (this._blinkTimes.length && timestamp - this._blinkTimes[0] > this._blinkRateWindow) {
      this._blinkTimes.shift();
    }
    const blinkRate = this._blinkTimes.length / (this._blinkRateWindow / 60000); // nháy/phút

    // Extract features
    const features = this._extractFeatures();

    // --- Wink detection: một mắt đóng hẳn (avg < earClosedThreshold), mắt kia mở ---
    //    (không dùng asymmetry cố định 0.4 vì mắt mở chỉ ~0.30 → asym ~0.25)
    const avgLeft = this._earHistory.reduce((s, e) => s + e.left, 0) / this._earHistory.length;
    const avgRight = this._earHistory.reduce((s, e) => s + e.right, 0) / this._earHistory.length;
    const leftClosed = avgLeft < this.earClosedThreshold;
    const rightClosed = avgRight < this.earClosedThreshold;
    const leftOpen = avgLeft > this.earThreshold + 0.05;
    const rightOpen = avgRight > this.earThreshold + 0.05;
    if ((leftClosed && rightOpen) || (rightClosed && leftOpen)) {
      const winkSide = leftClosed ? 'left' : 'right';
      this.stats.totalWinks++;
      this.stats.totalIntentional++;
      this._pendingDouble = null;

      const classification = {
        type: 'wink',
        confidence: 0.9,
        evidence: { asymmetry: features.asymmetry, side: winkSide }
      };
      this.callbacks.onClassified({
        type: 'wink',
        confidence: 0.9,
        blink: { type: 'wink', side: winkSide, duration, features }
      });
      this.callbacks.onWink(winkSide, duration);
      return;
    }

    // --- Classifier: confidence score + context fusion (Phase 2) ---
    let classification;
    if (this.classifier) {
      classification = this.classifier.classify(features);
    } else {
      // Fallback: cây quyết định cũ (giữ tương thích khi không có classifier)
      classification = this._legacyClassify(duration, features);
    }

    const blink = {
      type: classification.type,
      duration,
      features,
      confidence: classification.confidence,
      evidence: classification.evidence,
      blinkRate
    };

    // Phát sự kiện phân loại chi tiết (mới)
    this.callbacks.onClassified({ ...classification, blink });

    if (classification.type === 'natural' || classification.type === 'uncertain') {
      // Xử lý an toàn: vùng mơ hồ → coi như tự nhiên (không kích hoạt lệnh)
      this.stats.totalNatural++;
      this._pendingDouble = null;
      this._prevBlinkEnd = timestamp;
      this._inRefractory = true;
      this.callbacks.onNatural(blink);
      return;
    }

    // --- Intentional ---
    this.stats.totalIntentional++;

    // Double blink check — đo khoảng cách từ ĐIỂM BẮT ĐẦU (onset) của 2 lần
    // nháy chủ đích (completion-to-completion quá dài vì cộng cả thời lượng)
    if (this._pendingDouble) {
      const gap = this._blinkStart - this._pendingDouble.start;
      if (gap < this.doubleGapMax) {
        this._pendingDouble = null;
        this.callbacks.onIntentional({
          type: 'double',
          duration,
          features,
          confidence: classification.confidence
        });
        return;
      }
    }

    this._pendingDouble = { start: this._blinkStart, end: timestamp };

    // Phân loại theo thời lượng (short/long)
    if (duration < this.shortBlinkMax) {
      this.callbacks.onIntentional({ type: 'short', duration, features, confidence: classification.confidence });
    } else {
      this.callbacks.onIntentional({ type: 'long', duration, features, confidence: classification.confidence });
    }
  }

  /** Fallback khi không có classifier — cây quyết định cũ */
  _legacyClassify(duration, features) {
    const isAsymmetric = features.asymmetry > 0.4;
    const isFast = duration < this.naturalDurationMax;
    const hasHold = features.holdTime > this.holdTimeMaxNatural;
    const isBilateral = features.bilateralCorr > this.minNaturalCorr;
    const closeVel = features.closeVelocity;

    if (isFast && isBilateral && !hasHold && closeVel > this.minNaturalCloseVel) {
      return { type: 'natural', confidence: 0.85 };
    }
    return { type: 'intentional', confidence: 0.7 };
  }

  /** Extract 10 features từ lịch sử EAR */
  _extractFeatures() {
    if (this._earHistory.length < 3) return this._defaultFeatures();

    const first = this._earHistory[0];
    const earVals = this._earHistory.map(e => (e.left + e.right) / 2);

    // 1. Duration
    const duration = this._earHistory[this._earHistory.length - 1].t - this._earHistory[0].t;

    // 2. EAR minimum
    const earMin = Math.min(...earVals);

    // 3. Asymmetry tại đáy
    const minIdx = earVals.indexOf(earMin);
    const atMin = this._earHistory[minIdx];
    const asymmetry = atMin ? Math.abs(atMin.left - atMin.right) : 0;

    // 4. Close velocity (EAR drop rate)
    const closePhase = this._earHistory.filter(e => e.t - first.t < duration * 0.4);
    const closeDrop = closePhase.length > 1
      ? (earVals[earVals.indexOf(Math.max(...closePhase.map(e => (e.left + e.right) / 2)))] - earMin)
      : 0;
    const closeDuration = closePhase.length > 1
      ? (closePhase[closePhase.length - 1].t - closePhase[0].t)
      : 1;
    const closeVelocity = closeDuration > 0 ? closeDrop / closeDuration * 1000 : 0;

    // 5. Open velocity
    const openPhase = this._earHistory.filter(e => e.t - first.t > duration * 0.6);
    const openRise = openPhase.length > 1
      ? (earVals[earVals.indexOf(Math.max(...openPhase.map(e => (e.left + e.right) / 2)))] - earMin)
      : 0;
    const openDuration = openPhase.length > 1
      ? (openPhase[openPhase.length - 1].t - openPhase[0].t)
      : 1;
    const openVelocity = openDuration > 0 ? openRise / openDuration * 1000 : 0;

    // 6. Hold time (EAR < 0.15 hoặc ngưỡng đóng)
    const holdSamples = this._earHistory.filter(e => (e.left + e.right) / 2 < this.earClosedThreshold);
    const holdTime = holdSamples.length > 1
      ? (holdSamples[holdSamples.length - 1].t - holdSamples[0].t)
      : 0;

    // 7. Inter-blink gap
    const gap = this._prevBlinkEnd > 0 ? this._earHistory[0].t - this._prevBlinkEnd : 5000;

    // 8. Bilateral correlation
    const leftVals = this._earHistory.map(e => e.left);
    const rightVals = this._earHistory.map(e => e.right);
    const corr = this._correlation(leftVals, rightVals);

    // 9. Velocity symmetry (đóng/mở cân đối — tự nhiên ≈ 0.6-1.0)
    const maxV = Math.max(closeVelocity, openVelocity);
    const velocitySymmetry = maxV > 0 ? Math.min(closeVelocity, openVelocity) / maxV : 1;

    // 10. Dip position — vị trí đáy trong chu kỳ (tự nhiên ≈ 0.45-0.6)
    const dipPosition = duration > 0 ? (atMin ? atMin.t - first.t : duration * 0.5) / duration : 0.5;

    return {
      duration,
      earMin: Math.round(earMin * 1000) / 1000,
      asymmetry: Math.round(asymmetry * 1000) / 1000,
      closeVelocity: Math.round(closeVelocity * 10) / 10,
      openVelocity: Math.round(openVelocity * 10) / 10,
      holdTime: Math.round(holdTime),
      gap: Math.round(gap),
      bilateralCorr: Math.round(corr * 100) / 100,
      velocitySymmetry: Math.round(velocitySymmetry * 100) / 100,
      dipPosition: Math.round(dipPosition * 100) / 100
    };
  }

  _defaultFeatures() {
    return {
      duration: 0, earMin: 0, asymmetry: 0,
      closeVelocity: 0, openVelocity: 0,
      holdTime: 0, gap: 0, bilateralCorr: 0,
      velocitySymmetry: 1, dipPosition: 0.5
    };
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

  /** Tương thích ngược: setThreshold(earThreshold, durationThreshold) */
  setThreshold(earThreshold, durationThreshold) {
    if (typeof earThreshold === 'number') this.earThreshold = earThreshold;
    if (typeof durationThreshold === 'number') this.naturalDurationMax = durationThreshold;
  }

  /** Lấy blink rate hiện tại (nháy/phút) */
  getBlinkRate(now = performance.now()) {
    while (this._blinkTimes.length && now - this._blinkTimes[0] > this._blinkRateWindow) {
      this._blinkTimes.shift();
    }
    return this._blinkTimes.length / (this._blinkRateWindow / 60000);
  }

  on(event, fn) {
    if (this.callbacks[event]) this.callbacks[event] = fn;
  }
}
