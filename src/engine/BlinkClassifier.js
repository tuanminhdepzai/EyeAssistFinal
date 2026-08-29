/**
 * BlinkClassifier — 12-đặc-trưng confidence scoring + context fusion
 *
 * Phase 2 của kế hoạch: thay phân loại nhị phân if/else bằng điểm tin cậy
 * liên tục (0-1) kết hợp nhiều bằng chứng, giúp phân biệt chính xác:
 *   - Nháy mắt TỰ NHIÊN (sinh lý): nhanh, đối xứng, 2 mắt đồng bộ, dạng
 *     chuông mượt, xảy ra ngẫu nhiên khi gaze đang di chuyển.
 *   - Nháy mắt CHỦ ĐÍCH (điều khiển): lệch z-score khỏi baseline cá nhân,
 *     có pha giữ (hold), vận tốc méo, hoặc kèm fixation ổn định lên mục tiêu.
 *
 * Mô hình điểm: khởi đầu p=0.5, mỗi bằng chứng cộng/trừ có trọng số, cuối cùng
 * clamp về [0.02, 0.98]. Các trọng số được chọn để:
 *   - Nháy tự nhiên kinh điển (120ms, đối xứng, corr=0.98, không hold,
 *     gaze đang di chuyển) → score ≈ 0.15-0.30
 *   - Nháy chủ đích kinh điển (450ms, hold 120ms, fixation trên nút) → ≈ 0.75-0.9
 *   - Vùng mơ hồ 0.45-0.60 → xử lý an toàn (treat as natural, chỉ log).
 *
 * Context được inject mỗi frame từ main thread (setContext):
 *   - fixationStable: gaze đã đứng yên trên mục tiêu bao lâu (dead-zone)
 *   - gazeVelocity: vận tốc gaze khi blink bắt đầu (0-1)
 *   - target: có phần tử bấm được dưới gaze không
 *   - blinkRate: nháy/phút gần đây (nhịp tự nhiên ~10-20)
 *   - lastActionMs: thời gian từ lệnh cuối (chống kích hoạt lặp)
 */
export class BlinkClassifier {
  constructor(options = {}) {
    /** BlinkBaseline từ AdaptiveLearner (chia sẻ instance) */
    this.baseline = options.baseline || null;

    this.intentThreshold = options.intentThreshold ?? 0.6;
    this.uncertainMin = options.uncertainMin ?? 0.45;
    this.uncertainMax = options.uncertainMax ?? this.intentThreshold;

    /** Context hiện tại (inject mỗi frame) */
    this.context = {
      fixationStable: 0,        // 0-1: mức ổn định fixation (holdMs/300ms)
      gazeVelocity: 0.5,        // 0-1: vận tốc gaze chuẩn hóa
      target: false,            // bool: có mục tiêu dưới gaze
      blinkRate: 15,            // nháy/phút gần đây
      lastActionMs: 10000       // ms từ hành động cuối
    };

    // Thống kê chẩn đoán
    this.stats = { total: 0, natural: 0, intentional: 0, uncertain: 0, rejected: 0 };
  }

  /** Inject context từ frame hiện tại */
  setContext(ctx) {
    if (!ctx) return;
    if (typeof ctx.fixationStable === 'number') this.context.fixationStable = ctx.fixationStable;
    if (typeof ctx.gazeVelocity === 'number') this.context.gazeVelocity = ctx.gazeVelocity;
    if (typeof ctx.target === 'boolean') this.context.target = ctx.target;
    if (typeof ctx.blinkRate === 'number') this.context.blinkRate = ctx.blinkRate;
    if (typeof ctx.lastActionMs === 'number') this.context.lastActionMs = ctx.lastActionMs;
  }

  /**
   * Phân loại một blink đã hoàn tất.
   * @param {Object} f - features từ BlinkDetector._extractFeatures()
   * @returns {{ type:'natural'|'intentional'|'uncertain', confidence:number,
   *            evidence:Object }}
   */
  classify(f) {
    this.stats.total++;
    // Không có baseline → z = null và các bằng chứng z-score BỊ BỎ QUA
    // (sigmoid tại z=0 cho ~0.23-0.31, không phải trung tính → gây thiên lệch)
    const z = this.baseline ? this.baseline.zScore.bind(this.baseline) : null;
    const sig = BlinkClassifier.sigmoid;
    const ctx = this.context;

    let score = 0.5;

    // ================= BẰNG CHỨNG NỘI TẠI CỦA CÚ NHÁY (chủ đạo) =================
    // Phân loại dựa trên CHÍNH cú nháy — thời lượng, độ sâu, pha giữ, động học.
    // Gaze chỉ là tín hiệu phụ nhỏ (xem phần context bên dưới).

    // --- 1. Độ lệch thời lượng so với baseline tự nhiên (z-score) ---
    //    z < 1.2 → bình thường; z > 2.5 → rõ ràng chủ đích (chỉ khi có baseline)
    let zDur = 0, durationEvidence = 0;
    if (z) {
      zDur = z('duration', f.duration);
      durationEvidence = sig(zDur - 1.2);      // 0 → 1 quanh z=1.2
      score += 0.22 * durationEvidence;
    }

    // --- 1b. Thời lượng tuyệt đối ngắn → rất tự nhiên (không cần baseline) ---
    //    Nháy sinh lý thường 100-250ms; <250ms gần như chắc chắn tự nhiên
    if (f.duration < 250) {
      score -= 0.30 * (1 - f.duration / 250);      // 120ms → -0.156; 50ms → -0.24
    }

    // --- 2. Pha giữ (hold time) — dấu hiệu chủ đích mạnh nhất ---
    //    Nháy tự nhiên KHÔNG giữ mắt nhắm; cố ý thì giữ 50-200ms
    const holdEvidence = f.holdTime > 25 ? Math.min(1, f.holdTime / 120) : 0;
    score += 0.20 * holdEvidence;

    // --- 2b. Không có pha giữ → bằng chứng tự nhiên bổ sung ---
    if (f.holdTime <= 25) {
      score -= 0.12 * (1 - f.holdTime / 25);       // 10ms → -0.072; 0ms → -0.12
    }

    // --- 3. Độ sâu đóng mắt — nháy chủ đích thường nhắm kỹ hơn (cần baseline) ---
    if (z) {
      const zMin = -z('earMin', f.earMin);         // earMin càng NHỎ → z càng âm
      score += 0.06 * sig(zMin - 0.8);
    }

    // --- 4. Tương quan 2 mắt — tự nhiên gần như hoàn hảo đồng bộ ---
    score += 0.10 * (1 - f.bilateralCorr);
    //     Tương quan rất cao (>0.9) → thêm bằng chứng tự nhiên
    if (f.bilateralCorr > 0.9) {
      score -= 0.05 * (f.bilateralCorr - 0.9) / 0.1;   // 0.98 → -0.04
    }

    // --- 5. Đối xứng vận tốc đóng/mở — chỉ nghi ngờ khi méo mạnh (<0.5) ---
    const vSym = f.velocitySymmetry ?? 1;          // 1 = cân đối
    if (vSym < 0.5) score += 0.08 * (0.5 - vSym) / 0.5;

    // --- 6. Vị trí đáy EAR (dip position) — tự nhiên ≈ giữa chu kỳ ---
    const dipDev = Math.abs((f.dipPosition ?? 0.5) - 0.5) / 0.5;
    score += 0.06 * Math.min(1, dipDev);

    // --- 7. Tỷ lệ giữ/chu kỳ (closedRatio) ---
    const closedRatio = f.duration > 0 ? (f.holdTime / f.duration) : 0;
    score += 0.08 * Math.min(1, closedRatio / 0.5);

    // --- 8. Khoảng cách giữa 2 lần nháy — lệch nhịp sinh học → nghi ngờ (cần baseline) ---
    if (z && f.gap > 0) {
      const zGap = z('gap', f.gap);
      score += 0.05 * sig(zGap - 1);
    }

    // --- 9. Vận tốc đóng bất thường CHẬM (cố tình nhắm từ từ, cần baseline) ---
    if (z && f.closeVelocity > 0) {
      const zClose = z('closeVelocity', f.closeVelocity);
      if (zClose < -2) score += 0.06;               // chậm hơn 2σ so với tự nhiên
    }

    // ================= CONTEXT PHỤ (chỉ gợi ý nhẹ, không quyết định) =================
    // Giảm mạnh trọng số gaze so với bản cũ: giữ nguyên gaze khi chớp không
    // còn bị hủy tiến trình, liếc đi cũng không hủy — cú nháy tự quyết định.
    // --- 10. Fixation ổn định + có mục tiêu → gợi ý nhẹ ---
    if (ctx.target && ctx.fixationStable > 0.35) {
      score += 0.03 * Math.min(1, ctx.fixationStable);
    }

    // --- 11. Nhịp nháy cao (mỏi mắt, chớp liên tục) → nghi tự nhiên ---
    if (ctx.blinkRate > 25) score -= 0.05;

    // --- 12. Vừa thực hiện hành động gần đây → chống kích hoạt lặp ---
    if (ctx.lastActionMs < 600) score -= 0.08;

    // Clamp + phân loại
    score = Math.max(0.02, Math.min(0.98, score));

    let type = 'natural';
    if (score >= this.intentThreshold) {
      type = 'intentional';
      this.stats.intentional++;
    } else if (score < this.uncertainMin) {
      type = 'natural';
      this.stats.natural++;
    } else {
      type = 'uncertain';                            // vùng mơ hồ → xử lý an toàn
      this.stats.uncertain++;
    }

    // Confidence = xác suất của LOẠI ĐƯỢC CHỌN (không phải score thô):
    //   intentional → score; natural → 1-score; uncertain → độ gần ranh giới
    // Nhờ vậy nháy tự nhiên sẽ hiển thị "Tự nhiên 80-95%", KHÔNG còn hiện
    // "Chủ đích 70-90%" cho nháy tự nhiên như trước.
    const confidence = type === 'intentional'
      ? score
      : type === 'natural'
        ? 1 - score
        : Math.max(score - this.uncertainMin, this.intentThreshold - score) / (this.intentThreshold - this.uncertainMin);

    return {
      type,
      confidence: Math.round(confidence * 1000) / 1000,
      intentScore: Math.round(score * 1000) / 1000,   // score thô (chẩn đoán)
      evidence: {
        zDuration: Math.round(zDur * 100) / 100,
        durationEvidence: Math.round(durationEvidence * 100) / 100,
        holdEvidence: Math.round(holdEvidence * 100) / 100,
        bilateral: f.bilateralCorr,
        velocitySymmetry: Math.round(vSym * 100) / 100,
        dipPosition: Math.round((f.dipPosition ?? 0.5) * 100) / 100,
        closedRatio: Math.round(closedRatio * 100) / 100,
        fixationStable: Math.round(ctx.fixationStable * 100) / 100,
        target: ctx.target,
        blinkRate: Math.round(ctx.blinkRate)
      }
    };
  }

  static sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  resetStats() {
    this.stats = { total: 0, natural: 0, intentional: 0, uncertain: 0, rejected: 0 };
  }
}
