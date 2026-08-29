/**
 * EARCalculator — Eye Aspect Ratio
 *
 * Landmark indices (MediaPipe Face Mesh):
 *   Left eye:   p1=33,  p2=159, p3=158, p4=133, p5=153, p6=145
 *   Right eye:  p1=362, p2=385, p3=386, p4=263, p5=373, p6=380
 *
 * EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
 */
export class EARCalculator {
  /** Trạng thái làm mượt pitch giữa các frame (tránh nhảy nhiễu) */
  static _cosPitchSmooth = 1;
  /** Tỷ lệ chiều cao/chiều rộng mặt khi TRUNG TÍNH (giá trị lớn nhất quan sát được) */
  static _ratioBaseline = 0;

  /**
   * @param {Object} landmarks - face landmarks array
   * @returns {{ left: number, right: number, average: number, cosPitch: number }}
   *
   * Bù pitch: khi cúi/ngửa mặt, khoảng cách dọc giữa mí mắt chiếu lên mặt
   * phẳng ảnh bị co lại theo cos(pitch) dù mắt vẫn mở bình thường → EAR
   * sụt giả tạo. Chia EAR cho cos(pitch) để khử hiệu ứng này.
   */
  static compute(landmarks) {
    if (!landmarks || landmarks.length < 468) {
      return { left: 0, right: 0, average: 0, cosPitch: this._cosPitchSmooth };
    }

    const left = this._computeEAR(
      landmarks[33],  landmarks[159], landmarks[158],
      landmarks[133], landmarks[153], landmarks[145]
    );
    const right = this._computeEAR(
      landmarks[362], landmarks[385], landmarks[386],
      landmarks[263], landmarks[373], landmarks[380]
    );

    const cosPitch = this._estimateCosPitch(landmarks);

    return {
      left: Math.round(left * 1000) / 1000,
      right: Math.round(right * 1000) / 1000,
      average: Math.round((left + right) / 2 * 1000) / 1000,
      cosPitch: Math.round(cosPitch * 1000) / 1000
    };
  }

  /**
   * Trả về hệ số bù pitch (≈1 khi mặt thẳng, nhỏ dần khi cúi/ngửa sâu).
   *
   * Ý tưởng: khi cúi/ngửa, khoảng cách trán→cằm (10→152) chiếu lên mặt phẳng
   * ảnh co lại theo cos(pitch), trong khi chiều ngang mặt (33→263) gần như
   * không đổi → tỷ lệ cao/rộng giảm. Học tỷ lệ khi mặt TRUNG TÍNH (giá trị
   * lớn nhất quan sát được — mặt thẳng luôn cho tỷ lệ cao nhất) rồi so tỷ
   * lệ hiện tại với baseline: cosPitch ≈ ratio / baseline.
   */
  static _estimateCosPitch(landmarks) {
    const faceHeight = this._dist(landmarks[10], landmarks[152]);
    const faceWidth = this._dist(landmarks[33], landmarks[263]);
    if (faceWidth < 1e-6 || faceHeight < 1e-6) return this._cosPitchSmooth;

    const ratio = faceHeight / faceWidth;

    // Baseline = tỷ lệ lớn nhất từng thấy; xả rất chậm để kịp thích nghi
    // khi người dùng đổi khoảng cách camera mà không phá vỡ bù pitch
    if (ratio > this._ratioBaseline) {
      this._ratioBaseline = ratio;
    } else {
      this._ratioBaseline = Math.max(ratio, this._ratioBaseline * 0.9995);
    }

    const cosPitch = Math.min(1, ratio / this._ratioBaseline);

    // EMA làm mượt (alpha 0.3 — phản ứng đủ nhanh khi đổi tư thế)
    this._cosPitchSmooth = 0.3 * cosPitch + 0.7 * this._cosPitchSmooth;
    return this._cosPitchSmooth;
  }

  /**
   * EAR đã bù pitch: chia EAR thô cho hệ số cos (kẹp dưới 0.45 để tránh
   * khuếch đại quá mức khi cúi rất sâu). Dùng giá trị này cho blink detection.
   */
  static compensate(ear, cosPitch) {
    const cos = Math.max(0.45, cosPitch || 1);
    return Math.min(1, ear / cos);
  }

  /**
   * EAR for one eye
   */
  static _computeEAR(p1, p2, p3, p4, p5, p6) {
    const d1 = this._dist(p2, p6);
    const d2 = this._dist(p3, p5);
    const d3 = this._dist(p1, p4);
    if (d3 === 0) return 0;
    return (d1 + d2) / (2.0 * d3);
  }

  /** Euclidean distance in 3D */
  static _dist(a, b) {
    // `??` chứ không phải `||`: tọa độ 0 là hợp lệ (|| coi 0 là falsy → NaN)
    const dx = (a.x ?? a[0]) - (b.x ?? b[0]);
    const dy = (a.y ?? a[1]) - (b.y ?? b[1]);
    const dz = (a.z ?? a[2]) - (b.z ?? b[2]);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}
