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
  /**
   * @param {Object} landmarks - face landmarks array
   * @returns {{ left: number, right: number, average: number }}
   */
  static compute(landmarks) {
    if (!landmarks || landmarks.length < 468) {
      return { left: 0, right: 0, average: 0 };
    }

    const left = this._computeEAR(
      landmarks[33],  landmarks[159], landmarks[158],
      landmarks[133], landmarks[153], landmarks[145]
    );
    const right = this._computeEAR(
      landmarks[362], landmarks[385], landmarks[386],
      landmarks[263], landmarks[373], landmarks[380]
    );

    return {
      left: Math.round(left * 1000) / 1000,
      right: Math.round(right * 1000) / 1000,
      average: Math.round((left + right) / 2 * 1000) / 1000
    };
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
    const dx = (a.x || a[0]) - (b.x || b[0]);
    const dy = (a.y || a[1]) - (b.y || b[1]);
    const dz = (a.z || a[2]) - (b.z || b[2]);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}
