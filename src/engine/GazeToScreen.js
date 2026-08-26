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
    if (!landmarks || landmarks.length < 468) return;

    const nose = landmarks[1];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const chin = landmarks[152];
    const forehead = landmarks[10];

    const faceWidth = Math.abs(rightEye.x - leftEye.x);
    if (faceWidth < 0.01) return;

    // Yaw: horizontal head rotation from nose-eye offset
    const eyeCenterX = (leftEye.x + rightEye.x) / 2;
    const noseOffsetX = (nose.x - eyeCenterX) / faceWidth;
    const headYaw = Math.max(-0.4, Math.min(0.4, noseOffsetX));

    // Pitch: vertical head tilt from nose-chin-forehead geometry
    const faceHeight = Math.abs(chin.y - forehead.y);
    const eyeCenterY = (leftEye.y + rightEye.y) / 2;
    const noseOffsetY = (nose.y - eyeCenterY) / (faceHeight || 0.1);
    const headPitch = Math.max(-0.3, Math.min(0.3, noseOffsetY));

    // Apply compensation to raw gaze BEFORE polynomial mapping
    // Stronger than before (0.1) but not overwhelming (0.35 for yaw, 0.25 for pitch)
    this.mappedX = Math.max(0, Math.min(1, this.mappedX - headYaw * 0.35));
    this.mappedY = Math.max(0, Math.min(1, this.mappedY - headPitch * 0.25));
  }

  /** Get accuracy ratio from calibration */
  getAccuracy() {
    if (this.calibrationPoints.length < 6) return 0;
    let totalError = 0;
    let count = 0;
    for (const p of this.calibrationPoints) {
      const mapped = this.map(p.gazeX, p.gazeY);
      const err = Math.sqrt(
        (mapped.x - p.screenX)**2 + (mapped.y - p.screenY)**2
      );
      totalError += err;
      count++;
    }
    const avgErr = totalError / count;
    this.accuracy = Math.max(0, Math.min(1, 1 - avgErr / 0.15));
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
    let pts = this.calibrationPoints;
    if (pts.length < 6) { this.isCalibrated = false; return; }

    // Initial fit to compute residuals for outlier detection
    const X_init = pts.map(p => [1, p.gazeX, p.gazeY, p.gazeX**2, p.gazeY**2, p.gazeX*p.gazeY]);
    const yX_init = pts.map(p => p.screenX);
    const yY_init = pts.map(p => p.screenY);
    const cX_init = this._solveLeastSquares(X_init, yX_init);
    const cY_init = this._solveLeastSquares(X_init, yY_init);

    // Compute residuals and trim top 20% outliers
    const residuals = pts.map((p, i) => {
      const predX = cX_init[0] + cX_init[1]*p.gazeX + cX_init[2]*p.gazeY + cX_init[3]*p.gazeX**2 + cX_init[4]*p.gazeY**2 + cX_init[5]*p.gazeX*p.gazeY;
      const predY = cY_init[0] + cY_init[1]*p.gazeX + cY_init[2]*p.gazeY + cY_init[3]*p.gazeX**2 + cY_init[4]*p.gazeY**2 + cY_init[5]*p.gazeX*p.gazeY;
      return { idx: i, err: Math.sqrt((predX - p.screenX)**2 + (predY - p.screenY)**2) };
    });
    residuals.sort((a, b) => a.err - b.err);
    const keepCount = Math.max(6, Math.floor(residuals.length * 0.8));
    const keepIndices = new Set(residuals.slice(0, keepCount).map(r => r.idx));
    pts = pts.filter((_, i) => keepIndices.has(i));

    if (pts.length < 6) { this.isCalibrated = false; return; }

    // Refit with trimmed data
    const X = pts.map(p => [1, p.gazeX, p.gazeY, p.gazeX**2, p.gazeY**2, p.gazeX*p.gazeY]);
    const yScreenX = pts.map(p => p.screenX);
    const yScreenY = pts.map(p => p.screenY);

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
