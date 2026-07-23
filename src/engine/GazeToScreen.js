/**
 * GazeToScreen — Gaze direction to screen coordinate mapping
 *
 * Auto-detects webcam mirror and applies sensitivity amplification.
 * Uses degree-2 polynomial regression when calibrated.
 */
export class GazeToScreen {
  constructor() {
    this.calibrationPoints = [];
    this.coefficients = null;
    this.resolution = { w: 800, h: 500 };
    this.mappedX = 0.5;
    this.mappedY = 0.5;
    this.isCalibrated = false;
    this.accuracy = 0;
    this.sensitivity = 2.0;       // Amplify small head/eye movements
    this.isMirrored = null;       // auto-detect: true if webcam mirrors
    this.flipX = true;            // Manual override: true=flip, false=no flip, null=auto
  }

  /** Set calibration data from game */
  setCalibration(points, screenWidth, screenHeight) {
    this.calibrationPoints = points;
    this.resolution = { w: screenWidth, h: screenHeight };
    this._fitPolynomial();
  }

  /** Map gaze (0-1) → normalized (0-1) with sensitivity applied */
  map(rawGazeX, rawGazeY) {
    // Apply sensitivity amplification (expand from center 0.5)
    let gx = 0.5 + (rawGazeX - 0.5) * this.sensitivity;
    let gy = 0.5 + (rawGazeY - 0.5) * this.sensitivity;

    if (!this.isCalibrated) {
      this.mappedX = Math.max(0, Math.min(1, gx));
      this.mappedY = Math.max(0, Math.min(1, gy));
      return { x: this.mappedX, y: this.mappedY };
    }

    const c = this.coefficients;
    const sx = c.a0 + c.a1*gx + c.a2*gy + c.a3*gx*gx + c.a4*gy*gy + c.a5*gx*gy;
    const sy = c.b0 + c.b1*gx + c.b2*gy + c.b3*gx*gx + c.b4*gy*gy + c.b5*gx*gy;

    this.mappedX = Math.max(0, Math.min(1, sx));
    this.mappedY = Math.max(0, Math.min(1, sy));

    return { x: this.mappedX, y: this.mappedY };
  }

  /** Gentle head pose hint — only minor adjustments, let user drive */
  compensateHeadPose(landmarks) {
    if (!landmarks || landmarks.length < 10) return;

    const nose = landmarks[1];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];

    const faceWidth = Math.abs(rightEye.x - leftEye.x);
    if (faceWidth < 0.01) return;

    const noseOffset = (nose.x - (leftEye.x + rightEye.x) / 2) / faceWidth;
    const headYaw = Math.max(-0.3, Math.min(0.3, noseOffset));

    // Barely compensate — user's head INTENTIONALLY moves cursor
    const compensation = headYaw * 0.1;  // was 0.5, now 0.1
    this.mappedX = Math.max(0, Math.min(1, this.mappedX - compensation));
  }

  /** Get accuracy ratio from calibration */
  getAccuracy() {
    if (this.calibrationPoints.length < 6) return 0;
    let totalError = 0;
    let count = 0;
    for (const p of this.calibrationPoints) {
      const mapped = { x: p.gazeX, y: p.gazeY };
      const err = Math.sqrt(
        (mapped.x - p.screenX)**2 + (mapped.y - p.screenY)**2
      );
      totalError += err;
      count++;
    }
    const avgErr = totalError / count;
    this.accuracy = Math.max(0, Math.min(1, 1 - avgErr / 0.3));
    return this.accuracy;
  }

  /** Normalize gaze vector from landmarks */
  static computeGazeVector(landmarks, flipX = null) {
    if (!landmarks || landmarks.length < 473) {
      return { x: 0.5, y: 0.5 };
    }

    // Use iris landmarks (if available) or eye region center
    const irisLeft = landmarks[468] || this._eyeCenter(landmarks, 33, 133);
    const irisRight = landmarks[473] || this._eyeCenter(landmarks, 362, 263);

    let gazeX = (irisLeft.x + irisRight.x) / 2;
    const gazeY = (irisLeft.y + irisRight.y) / 2;

    // Mirror detection: if left eye (33) appears on the RIGHT side
    // of right eye (263), the image is mirrored (typical laptop webcam)
    if (landmarks.length > 263) {
      const isMirrored = landmarks[33].x > landmarks[263].x;

      if (flipX === null) flipX = isMirrored;  // auto-detect
      if (flipX) gazeX = 1 - gazeX;            // Flip horizontal axis

      // Debug (only once every ~60 frames to avoid spam)
      if (typeof console !== 'undefined' && (Math.random() < 0.02)) {
        console.log(
          `[GazeToScreen] L-eye(33)=${landmarks[33].x.toFixed(3)} ` +
          `R-eye(263)=${landmarks[263].x.toFixed(3)} ` +
          `isMirrored=${isMirrored} flipX=${flipX} ` +
          `gazeX=${gazeX.toFixed(3)}`
        );
      }
    }

    return { x: gazeX, y: gazeY };
  }

  static _eyeCenter(lm, idx1, idx2) {
    return {
      x: (lm[idx1].x + lm[idx2].x) / 2,
      y: (lm[idx1].y + lm[idx2].y) / 2
    };
  }

  // --- Private: polynomial fitting (least squares) ---

  _fitPolynomial() {
    const pts = this.calibrationPoints;
    if (pts.length < 6) { this.isCalibrated = false; return; }

    // Build design matrix: [1, gx, gy, gx², gy², gx*gy]
    const X = pts.map(p => [1, p.gazeX, p.gazeY, p.gazeX**2, p.gazeY**2, p.gazeX*p.gazeY]);
    const yScreenX = pts.map(p => p.screenX);
    const yScreenY = pts.map(p => p.screenY);

    // Solve using normal equations (X^T X)^-1 X^T y
    const coeffsX = this._solveLeastSquares(X, yScreenX);
    const coeffsY = this._solveLeastSquares(X, yScreenY);

    this.coefficients = {
      a0: coeffsX[0], a1: coeffsX[1], a2: coeffsX[2],
      a3: coeffsX[3], a4: coeffsX[4], a5: coeffsX[5],
      b0: coeffsY[0], b1: coeffsY[1], b2: coeffsY[2],
      b3: coeffsY[3], b4: coeffsY[4], b5: coeffsY[5],
    };
    this.isCalibrated = true;
  }

  /** Solve least squares: (X^T X)^-1 X^T y */
  _solveLeastSquares(X, y) {
    const n = X.length;
    const m = X[0].length;

    const XtX = Array.from({ length: m }, () => new Float64Array(m));
    const Xty = new Float64Array(m);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        Xty[j] += X[i][j] * y[i];
        for (let k = 0; k < m; k++) {
          XtX[j][k] += X[i][j] * X[i][k];
        }
      }
    }

    const aug = XtX.map((row, i) => {
      const r = [...row];
      r[i] += 1e-8;
      r.push(Xty[i]);
      return r;
    });

    for (let col = 0; col < m; col++) {
      let maxRow = col;
      for (let row = col + 1; row < m; row++) {
        if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
      }
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

      const pivot = aug[col][col];
      if (Math.abs(pivot) < 1e-12) continue;

      for (let row = col + 1; row < m; row++) {
        const factor = aug[row][col] / pivot;
        for (let j = col; j <= m; j++) {
          aug[row][j] -= factor * aug[col][j];
        }
      }
    }

    const result = new Float64Array(m);
    for (let i = m - 1; i >= 0; i--) {
      let sum = aug[i][m];
      for (let j = i + 1; j < m; j++) {
        sum -= aug[i][j] * result[j];
      }
      result[i] = sum / aug[i][i];
    }

    return result;
  }
}
