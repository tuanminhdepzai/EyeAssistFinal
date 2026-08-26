/**
 * PursuitGame — Advanced Multi-Method Eye Calibration Engine
 *
 * Supports:
 *   1. 'grid9': 9-Point Scientific Grid Calibration (Gold standard for gaze mapping)
 *   2. 'pursuit': Smooth Lissajous Curve Tracking with star particles & wink test
 *   3. 'test': Live Interactive Verification Target Zone after calibration
 */
export class PursuitGame {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.isRunning = false;
    this.isComplete = false;
    this.mode = 'grid9'; // 'grid9' | 'pursuit' | 'test'

    // 9-Point Grid state
    this.gridPoints = [];
    this.currentGridIndex = 0;
    this.gridDwellProgress = 0;
    this.gridDwellTarget = 1000; // 1s per point
    this.pointSamples = [];

    // Pursuit parameters
    this.a = 3;
    this.b = 2;
    this.t = 0;
    this.speed = 0.85;
    this.startTime = 0;

    // Wink test state
    this.winkTestPhase = false;
    this.winkResults = { left: [], right: [] };
    this.currentWinkSide = null;
    this.winkTestCount = 0;
    this._winkPromptText = '';

    // Live Test Targets
    this.testTargets = [];
    this.activeTestHit = null;

    // Collected dataset: array of { screenX, screenY, gazeX, gazeY, timestamp }
    this.samples = [];

    // Callbacks
    this.callbacks = {
      onSample: () => {},
      onPointComplete: () => {},
      onComplete: () => {},
      onWinkDetected: () => {},
      onTestHit: () => {},
    };

    this._rafId = null;
  }

  /**
   * Start calibration
   * @param {HTMLCanvasElement} canvas
   * @param {Function} getGazePosition - () => { x, y } (0 to 1 normalized)
   * @param {'grid9' | 'pursuit'} mode
   */
  start(canvas, getGazePosition, mode = 'grid9') {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.getGazePosition = getGazePosition;
    this.mode = mode;
    this.isRunning = true;
    this.isComplete = false;
    this.samples = [];
    this.startTime = performance.now();

    this._ensureCanvasSize();

    if (mode === 'grid9') {
      this._init9Grid();
    } else {
      this._initPursuit();
    }

    this._startLoop();
  }

  _ensureCanvasSize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const w = Math.floor(rect.width || 800);
    const h = Math.floor(rect.height || 500);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  // ============ 9-POINT GRID CALIBRATION ============

  _init9Grid() {
    this.gridPoints = [
      { x: 0.15, y: 0.15, label: 'Góc trên trái' },
      { x: 0.50, y: 0.15, label: 'Phía trên giữa' },
      { x: 0.85, y: 0.15, label: 'Góc trên phải' },
      { x: 0.15, y: 0.50, label: 'Bên trái giữa' },
      { x: 0.50, y: 0.50, label: 'Chính tâm trung tâm' },
      { x: 0.85, y: 0.50, label: 'Bên phải giữa' },
      { x: 0.15, y: 0.85, label: 'Góc dưới trái' },
      { x: 0.50, y: 0.85, label: 'Phía dưới giữa' },
      { x: 0.85, y: 0.85, label: 'Góc dưới phải' },
    ];
    this.currentGridIndex = 0;
    this.gridDwellProgress = 0;
    this.pointSamples = [];
    this.gridDwellTarget = 1500; // ms per calibration point
  }

  _update9Grid(delta) {
    const W = this.canvas.width;
    const H = this.canvas.height;

    if (this.currentGridIndex >= this.gridPoints.length) {
      this._finish();
      return;
    }

    const currentPt = this.gridPoints[this.currentGridIndex];
    const gaze = this.getGazePosition();

    if (gaze) {
      this.pointSamples.push({
        screenX: currentPt.x,
        screenY: currentPt.y,
        gazeX: gaze.x,
        gazeY: gaze.y,
        timestamp: performance.now() - this.startTime,
      });

      this.gridDwellProgress += delta;

      if (this.callbacks.onSample) {
        this.callbacks.onSample(this.samples.length + this.pointSamples.length);
      }

      // Point completed after dwell target reached
      if (this.gridDwellProgress >= this.gridDwellTarget) {
        // Keep the best central 80% samples
        const kept = this.pointSamples.slice(Math.floor(this.pointSamples.length * 0.2));
        this.samples.push(...kept);

        this.currentGridIndex++;
        this.gridDwellProgress = 0;
        this.pointSamples = [];

        if (this.callbacks.onPointComplete) {
          this.callbacks.onPointComplete({
            index: this.currentGridIndex,
            total: this.gridPoints.length,
          });
        }
      }
    }

    this._render9Grid(currentPt, gaze);
  }

  _render9Grid(targetPt, gaze) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Dark clear background
    ctx.fillStyle = '#060913';
    ctx.fillRect(0, 0, W, H);

    // Draw subtle cyber grid lines
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Draw previous and remaining grid positions as faint dots
    this.gridPoints.forEach((pt, idx) => {
      const px = pt.x * W;
      const py = pt.y * H;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      if (idx < this.currentGridIndex) {
        ctx.fillStyle = '#00e676'; // Completed: Green
      } else if (idx === this.currentGridIndex) {
        ctx.fillStyle = '#00d4ff'; // Current
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; // Remaining
      }
      ctx.fill();
    });

    // Draw active target with pulsing animation and shrinking ring
    const tx = targetPt.x * W;
    const ty = targetPt.y * H;
    const progress = Math.min(1.0, this.gridDwellProgress / this.gridDwellTarget);

    // Outer progress ring (shrinks to center)
    const maxRadius = 38;
    const currentRadius = maxRadius * (1 - progress * 0.7);

    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(tx, ty, currentRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Progress arc fill
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#00e676';
    ctx.beginPath();
    ctx.arc(tx, ty, maxRadius + 4, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Center target bullseye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(tx, ty, 6, 0, Math.PI * 2);
    ctx.fill();

    // Draw gaze cursor if available
    if (gaze) {
      const gx = gaze.x * W;
      const gy = gaze.y * H;
      ctx.fillStyle = 'rgba(255, 61, 113, 0.7)';
      ctx.shadowColor = '#ff3d71';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(gx, gy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Top instruction & counter
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `Nhìn thẳng vào tâm vòng tròn (${this.currentGridIndex + 1}/9)`,
      W / 2,
      35
    );

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px sans-serif';
    ctx.fillText('Giữ yên đầu và tập trung ánh mắt vào điểm sáng', W / 2, 58);
  }

  // ============ SMOOTH PURSUIT CALIBRATION ============

  _initPursuit() {
    this.t = 0;
    this.winkTestPhase = false;
    this.winkResults = { left: [], right: [] };
    this.currentWinkSide = null;
    this.winkTestCount = 0;
  }

  _updatePursuit(now) {
    const elapsed = now - this.startTime;

    if (elapsed < 10000) {
      // Phase 1: Lissajous curve tracking
      this.t = (elapsed / 1000) * this.speed;
      const W = this.canvas.width;
      const H = this.canvas.height;

      const targetX = W * 0.5 + W * 0.36 * Math.sin(this.a * this.t);
      const targetY = H * 0.5 + H * 0.32 * Math.sin(this.b * this.t);

      const gaze = this.getGazePosition();
      if (gaze) {
        this.samples.push({
          screenX: targetX / W,
          screenY: targetY / H,
          gazeX: gaze.x,
          gazeY: gaze.y,
          timestamp: elapsed,
        });

        if (this.callbacks.onSample) {
          this.callbacks.onSample(this.samples.length);
        }
      }

      this._renderPursuit(targetX, targetY, gaze);
    } else if (elapsed < 12000 && !this.winkTestPhase) {
      // Phase 2: Wink capability test
      this.winkTestPhase = true;
      this.currentWinkSide = 'left';
      this.winkTestCount = 0;
      this._winkPromptText = 'Nháy mắt TRÁI 3 lần! 👁️';
    } else if (elapsed < 15000) {
      this._renderWinkTest();
    } else if (!this.isComplete) {
      this._finish();
    }
  }

  _renderPursuit(targetX, targetY, gaze) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.fillStyle = '#060913';
    ctx.fillRect(0, 0, W, H);

    // Trail
    if (this.samples.length > 5) {
      const trail = this.samples.slice(-35);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.25)';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < trail.length; i++) {
        const x = trail[i].screenX * W;
        const y = trail[i].screenY * H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Animated Star
    const starSize = 22 + 4 * Math.sin(this.t * 4);
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#00d4ff';
    this._drawStar(ctx, targetX, targetY, 5, starSize, starSize * 0.48);
    ctx.shadowBlur = 0;

    // Gaze cursor
    if (gaze) {
      const gx = gaze.x * W;
      const gy = gaze.y * H;
      ctx.fillStyle = 'rgba(255, 61, 113, 0.8)';
      ctx.shadowColor = '#ff3d71';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(gx, gy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Progress bar
    const elapsed = performance.now() - this.startTime;
    const progress = Math.min(1, elapsed / 10000);
    ctx.fillStyle = 'rgba(0, 212, 255, 0.2)';
    ctx.fillRect(0, H - 6, W, 6);
    ctx.fillStyle = '#00d4ff';
    ctx.fillRect(0, H - 6, W * progress, 6);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nhìn theo ngôi sao đang di chuyển 🎯', W / 2, 35);
  }

  _renderWinkTest() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.fillStyle = '#060913';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('👁️', W / 2, H / 2 - 40);

    ctx.fillStyle = '#00e676';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(this._winkPromptText || 'Nháy mắt!', W / 2, H / 2 + 20);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    const count = this.winkResults.left.length + this.winkResults.right.length;
    ctx.fillText(`Đã nhận diện: ${count}/6 lần`, W / 2, H / 2 + 55);
  }

  registerWink(side) {
    if (!this.winkTestPhase) return;

    if (this.currentWinkSide === side) {
      this.winkResults[side].push(Date.now());
      this.winkTestCount++;

      if (this.winkTestCount >= 3) {
        if (this.currentWinkSide === 'left') {
          this.currentWinkSide = 'right';
          this.winkTestCount = 0;
          this._winkPromptText = 'Nháy mắt PHẢI 3 lần! 👁️';
        } else {
          this.currentWinkSide = 'done';
        }
      }
    }
  }

  // ============ LIVE VERIFICATION TEST MODE ============

  startTestMode(canvas, getGazePosition) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.getGazePosition = getGazePosition;
    this.mode = 'test';
    this.isRunning = true;

    this._ensureCanvasSize();
    const W = this.canvas.width;
    const H = this.canvas.height;

    this.testTargets = [
      { id: 'T1', x: W * 0.25, y: H * 0.3, label: 'Mục tiêu 1', r: 35, hits: 0 },
      { id: 'T2', x: W * 0.75, y: H * 0.3, label: 'Mục tiêu 2', r: 35, hits: 0 },
      { id: 'T3', x: W * 0.25, y: H * 0.7, label: 'Mục tiêu 3', r: 35, hits: 0 },
      { id: 'T4', x: W * 0.75, y: H * 0.7, label: 'Mục tiêu 4', r: 35, hits: 0 },
    ];

    this._startLoop();
  }

  _updateTestMode() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.fillStyle = '#060913';
    ctx.fillRect(0, 0, W, H);

    const gaze = this.getGazePosition();
    const gx = gaze ? gaze.x * W : -100;
    const gy = gaze ? gaze.y * H : -100;

    // Render test target buttons
    this.testTargets.forEach((t) => {
      const dist = Math.hypot(gx - t.x, gy - t.y);
      const isHovered = dist < t.r;

      if (isHovered) {
        t.hits = Math.min(100, t.hits + 2);
      } else {
        t.hits = Math.max(0, t.hits - 1);
      }

      // Draw target circle
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? 'rgba(0, 230, 118, 0.25)' : 'rgba(15, 23, 42, 0.8)';
      ctx.fill();
      ctx.strokeStyle = isHovered ? '#00e676' : 'rgba(0, 212, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.fillStyle = isHovered ? '#00e676' : '#cbd5e1';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t.label, t.x, t.y + 5);

      // Hit meter
      if (t.hits > 0) {
        ctx.strokeStyle = '#00e676';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r + 4, -Math.PI / 2, -Math.PI / 2 + (t.hits / 100) * Math.PI * 2);
        ctx.stroke();
      }
    });

    // Draw live gaze cursor
    if (gaze) {
      ctx.fillStyle = '#00d4ff';
      ctx.shadowColor = '#00d4ff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(gx, gy, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🧪 Chế độ thử nghiệm: Hãy nhìn vào 4 mục tiêu để kiểm tra độ nhạy', W / 2, 35);
  }

  // ============ LOOP & LIFECYCLE ============

  _startLoop() {
    let lastTime = performance.now();

    const loop = (now) => {
      if (!this.isRunning) return;
      const delta = now - lastTime;
      lastTime = now;

      if (this.mode === 'grid9') {
        this._update9Grid(delta);
      } else if (this.mode === 'pursuit') {
        this._updatePursuit(now);
      } else if (this.mode === 'test') {
        this._updateTestMode();
      }

      this._rafId = requestAnimationFrame(loop);
    };

    this._rafId = requestAnimationFrame(loop);
  }

  _finish() {
    this.isRunning = false;
    this.isComplete = true;

    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    const leftWinks = this.winkResults.left.length;
    const rightWinks = this.winkResults.right.length;
    const winkCapable = leftWinks >= 2 && rightWinks >= 2;

    if (this.callbacks.onComplete) {
      this.callbacks.onComplete({
        samples: this.samples,
        winkCapable,
        winkResults: this.winkResults,
      });
    }

    // Completion screen
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.fillStyle = '#060913';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#00e676';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✅ Thu thập dữ liệu hiệu chỉnh hoàn tất!', W / 2, H / 2);
  }

  stop() {
    this.isRunning = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);

    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
  }
}
