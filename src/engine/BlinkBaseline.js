/**
 * BlinkBaseline — Online per-user baseline statistics (Welford's algorithm)
 *
 * Phase 1 của kế hoạch nâng cấp: thay các "magic number" bằng ngưỡng thích nghi
 * học từ chính người dùng. Mỗi người có nháy mắt tự nhiên khác nhau (thời gian,
 * độ sâu, vận tốc...), nên một ngưỡng cố định (250ms, EAR 0.22) luôn sai lệch
 * với một phần người dùng.
 *
 * Cách hoạt động:
 *   - Duy trì phân phối (mean/std/min/max) cho TỪNG đặc trưng của nháy tự nhiên
 *     và nháy chủ đích, cập nhật online bằng thuật toán Welford (O(1), ổn định
 *     số học, không cần lưu toàn bộ lịch sử).
 *   - Sau đủ mẫu (mặc định 12 nháy tự nhiên) → baseline "sẵn sàng":
 *       getThresholds() trả ngưỡng động = mean + k·std (z-score based).
 *   - zScore(feature, value) cho biết giá trị lệch bao nhiêu sigma so với
 *     phân phối tự nhiên → dùng để tính confidence score (Phase 2).
 *
 * Serialize/deserialize để lưu vào profile (IndexedDB) — người dùng không phải
 * học lại từ đầu mỗi lần mở app.
 */
export class BlinkBaseline {
  constructor(options = {}) {
    this.readyAfter = options.readyAfter || 12;   // số nháy tự nhiên tối thiểu
    this.naturalCount = 0;
    this.intentionalCount = 0;

    // Noise floor cho std — khi dữ liệu gần như hằng số (người dùng nháy rất
    // đều), variance ≈ 0 làm z-score bùng nổ. Floor này giữ z-score hợp lý.
    this.minStd = {
      duration: 20,        // ms
      earMin: 0.01,        // 0-1
      asymmetry: 0.05,     // 0-1
      closeVelocity: 0.4,  // EAR/s
      openVelocity: 0.4,   // EAR/s
      holdTime: 5,         // ms
      bilateralCorr: 0.05, // 0-1
      gap: 300             // ms
    };

    // Mỗi feature giữ 2 phân phối: natural & intentional
    this.features = [
      'duration',      // ms
      'earMin',        // 0-1
      'asymmetry',     // 0-1
      'closeVelocity', // EAR/s
      'openVelocity',  // EAR/s
      'holdTime',      // ms
      'bilateralCorr', // 0-1
      'gap'            // ms giữa 2 lần nháy
    ];

    this.stats = {};
    for (const f of this.features) {
      this.stats[f] = {
        natural: this._emptyDist(),
        intentional: this._emptyDist()
      };
    }
  }

  _emptyDist() {
    return { n: 0, mean: 0, m2: 0, min: Infinity, max: -Infinity };
  }

  /**
   * Cập nhật baseline từ một blink đã phân loại
   * @param {Object} blink - { type: 'natural'|'intentional'|'wink', duration, earMin, asymmetry, closeVelocity, openVelocity, holdTime, bilateralCorr, gap }
   */
  update(blink) {
    // Chỉ học từ phân loại rõ ràng — blink 'uncertain'/'unknown' KHÔNG được
    // làm nhiễu phân phối (chúng nằm giữa ranh giới tự nhiên/chủ đích)
    if (blink.type !== 'natural' && blink.type !== 'intentional') return;

    const bucket = blink.type === 'natural' ? 'natural' : 'intentional';
    const values = {
      duration: blink.duration,
      earMin: blink.earMin,
      asymmetry: blink.asymmetry,
      closeVelocity: blink.closeVelocity,
      openVelocity: blink.openVelocity,
      holdTime: blink.holdTime,
      bilateralCorr: blink.bilateralCorr,
      gap: blink.gap
    };

    for (const f of this.features) {
      const v = values[f];
      if (v === undefined || v === null || !isFinite(v)) continue;
      this._push(this.stats[f][bucket], v);
    }

    if (bucket === 'natural') this.naturalCount++;
    else this.intentionalCount++;
  }

  _push(dist, v) {
    dist.n++;
    const delta = v - dist.mean;
    dist.mean += delta / dist.n;
    dist.m2 += delta * (v - dist.mean);
    if (v < dist.min) dist.min = v;
    if (v > dist.max) dist.max = v;
  }

  /** Variance (mẫu) của một phân phối */
  variance(dist) {
    if (dist.n < 2) return 0;
    return dist.m2 / (dist.n - 1);
  }

  /** Standard deviation với floor để tránh chia 0 */
  std(dist, feature = '') {
    return Math.max(Math.sqrt(this.variance(dist)), this.minStd[feature] ?? 0.0001);
  }

  get isReady() {
    return this.naturalCount >= this.readyAfter;
  }

  /** Z-score: giá trị lệch bao nhiêu sigma so với phân phối tự nhiên */
  zScore(feature, value) {
    const dist = this.stats[feature]?.natural;
    if (!dist || dist.n < 2) return 0;
    const s = this.std(dist, feature);
    return (value - dist.mean) / s;
  }

  /** Hàm sigmoid ổn định */
  static sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  /**
   * Tính ngưỡng thích nghi cho BlinkDetector.
   * Khi chưa đủ mẫu → trả về giá trị mặc định đã được kiểm chứng.
   */
  getThresholds(defaults = {}) {
    const d = this.stats.duration.natural;
    const h = this.stats.holdTime.natural;
    const vc = this.stats.closeVelocity.natural;
    const vo = this.stats.openVelocity.natural;
    const c = this.stats.bilateralCorr.natural;

    if (!this.isReady) {
      return {
        earThreshold: defaults.earThreshold ?? 0.22,
        earClosedThreshold: defaults.earClosedThreshold ?? 0.18,
        naturalDurationMax: defaults.naturalDurationMax ?? 250,
        shortBlinkMax: defaults.shortBlinkMax ?? 700,
        holdTimeMaxNatural: defaults.holdTimeMaxNatural ?? 30,
        minNaturalCloseVel: defaults.minNaturalCloseVel ?? 0.3,
        minNaturalOpenVel: defaults.minNaturalOpenVel ?? 0.25,
        minNaturalCorr: defaults.minNaturalCorr ?? 0.7
      };
    }

    // Nháy tự nhiên trung bình + ~1.5σ → giới hạn trên của tự nhiên
    const naturalDurationMax = clamp(d.mean + 1.5 * this.std(d, 'duration'), 170, 400);
    // Ranh giới short/long của nháy chủ đích: xa hẳn khỏi tự nhiên (+4σ)
    const shortBlinkMax = clamp(d.mean + 4 * this.std(d, 'duration'), 450, 900);
    const holdTimeMaxNatural = clamp(h.mean + 3 * this.std(h, 'holdTime'), 25, 60);

    // Ngưỡng vận tốc: chỉ chấp nhận "tự nhiên" nếu đóng/mở đủ nhanh
    const minNaturalCloseVel = clamp(vc.mean - 1.5 * this.std(vc, 'closeVelocity'), 0.15, 0.6);
    const minNaturalOpenVel = clamp(vo.mean - 1.5 * this.std(vo, 'openVelocity'), 0.12, 0.5);
    const minNaturalCorr = clamp(c.mean - 1.5 * this.std(c, 'bilateralCorr'), 0.45, 0.85);

    return {
      earThreshold: defaults.earThreshold ?? 0.22,   // EAR ngưỡng do AdaptiveLearner từ open-ear baseline
      earClosedThreshold: defaults.earClosedThreshold ?? 0.18,
      naturalDurationMax: Math.round(naturalDurationMax),
      shortBlinkMax: Math.round(shortBlinkMax),
      holdTimeMaxNatural: Math.round(holdTimeMaxNatural),
      minNaturalCloseVel: Math.round(minNaturalCloseVel * 100) / 100,
      minNaturalOpenVel: Math.round(minNaturalOpenVel * 100) / 100,
      minNaturalCorr: Math.round(minNaturalCorr * 100) / 100
    };
  }

  /** Tóm tắt phân phối để gỡ lỗi / UI */
  summary() {
    const out = {};
    for (const f of this.features) {
      const n = this.stats[f].natural;
      out[f] = n.n > 0 ? {
        n: n.n,
        mean: Math.round(n.mean * 1000) / 1000,
        std: Math.round(this.std(n, f) * 1000) / 1000,
        min: Math.round(n.min * 1000) / 1000,
        max: Math.round(n.max * 1000) / 1000
      } : null;
    }
    out.isReady = this.isReady;
    out.naturalCount = this.naturalCount;
    out.intentionalCount = this.intentionalCount;
    return out;
  }

  serialize() {
    return {
      readyAfter: this.readyAfter,
      naturalCount: this.naturalCount,
      intentionalCount: this.intentionalCount,
      stats: this.stats
    };
  }

  deserialize(data) {
    if (!data) return;
    if (typeof data.readyAfter === 'number') this.readyAfter = data.readyAfter;
    if (typeof data.naturalCount === 'number') this.naturalCount = data.naturalCount;
    if (typeof data.intentionalCount === 'number') this.intentionalCount = data.intentionalCount;
    if (data.stats) {
      for (const f of this.features) {
        if (data.stats[f]) {
          this.stats[f] = {
            natural: this._sanitizeDist(data.stats[f].natural),
            intentional: this._sanitizeDist(data.stats[f].intentional)
          };
        }
      }
    }
  }

  _sanitizeDist(dist) {
    if (!dist || typeof dist !== 'object') return this._emptyDist();
    return {
      n: Math.max(0, dist.n | 0),
      mean: isFinite(dist.mean) ? dist.mean : 0,
      m2: isFinite(dist.m2) ? dist.m2 : 0,
      min: isFinite(dist.min) ? dist.min : Infinity,
      max: isFinite(dist.max) ? dist.max : -Infinity
    };
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
