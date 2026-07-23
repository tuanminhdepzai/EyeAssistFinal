/**
 * PursuitGame — Gamified calibration with Lissajous pursuit tracking
 *
 * A star moves in a Lissajous curve; user follows it with their gaze.
 * Records (gaze_x, gaze_y, target_x, target_y) pairs for polynomial mapping.
 * Also tests wink capability and measures natural blink distribution.
 */
export class PursuitGame {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.isRunning = false;
    this.isComplete = false;

    // Lissajous parameters
    this.a = 3;
    this.b = 2;
    this.t = 0;
    this.speed = 0.8;
    this.duration = 15000; // 15 seconds
    this.startTime = 0;

    // Data collection
    this.samples = [];
    this.winkTestPhase = false;
    this.winkResults = { left: [], right: [] };
    this.currentWinkSide = null;
    this.winkTestCount = 0;

    // Callbacks
    this.callbacks = {
      onSample: () => {},
      onComplete: () => {},
      onWinkDetected: () => {}
    };

    // Animation frame
    this._rafId = null;
  }

  /**
   * Start the pursuit game
   * @param {HTMLCanvasElement} canvas
   * @param {Function} getGazePosition - callback returning current {x, y}
   */
  start(canvas, getGazePosition) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.getGazePosition = getGazePosition;
    this.isRunning = true;
    this.isComplete = false;
    this.t = 0;
    this.samples = [];
    this.startTime = performance.now();

    // Run animation loop
    const loop = (now) => {
      if (!this.isRunning) return;

      const elapsed = now - this.startTime;

      // Phase 1: pursuit tracking (0-10s)
      if (elapsed < 10000) {
        this._updatePursuit(now);
      }
      // Phase 2: wink test (10-12s)
      else if (elapsed < 12000 && !this.winkTestPhase) {
        this.winkTestPhase = true;
        this.currentWinkSide = 'left';
        this.winkTestCount = 0;
        this._showWinkPrompt('Nhấp nháy mắt TRÁI 3 lần! 👁️');
      } else if (elapsed < 14000) {
        this._renderWinkTest(now);
      }
      // Complete
      else if (!this.isComplete) {
        this._finish();
        return;
      }

      this._rafId = requestAnimationFrame(loop);
    };

    this._rafId = requestAnimationFrame(loop);
  }

  _updatePursuit(now) {
    const elapsed = now - this.startTime;

    // Calculate target position using Lissajous curve
    this.t = (elapsed / 1000) * this.speed;
    const W = this.canvas.width;
    const H = this.canvas.height;

    const targetX = W * 0.5 + W * 0.35 * Math.sin(this.a * this.t);
    const targetY = H * 0.5 + H * 0.35 * Math.sin(this.b * this.t);

    // Get current gaze position
    const gaze = this.getGazePosition();

    // Record sample
    if (gaze) {
      this.samples.push({
        screenX: targetX / W,
        screenY: targetY / H,
        gazeX: gaze.x,
        gazeY: gaze.y,
        timestamp: elapsed
      });

      if (this.callbacks.onSample) {
        this.callbacks.onSample(this.samples.length);
      }
    }

    // Render
    this._renderPursuit(targetX, targetY, gaze);
  }

  _renderPursuit(targetX, targetY, gaze) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Clear
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, W, H);

    // Draw trail
    if (this.samples.length > 5) {
      const trail = this.samples.slice(-30);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.15)';
      ctx.lineWidth = 2;
      for (let i = 0; i < trail.length; i++) {
        const x = trail[i].screenX * W;
        const y = trail[i].screenY * H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Draw grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const x = (i / 10) * W;
      const y = (i / 10) * H;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Draw target star
    const starSize = 20 + 5 * Math.sin(this.t * 3);
    ctx.shadowColor = '#ff9100';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ff9100';
    this._drawStar(ctx, targetX, targetY, 5, starSize, starSize * 0.5);
    ctx.shadowBlur = 0;

    // Draw gaze cursor
    if (gaze) {
      const gx = gaze.x * W;
      const gy = gaze.y * H;

      ctx.shadowColor = '#00d4ff';
      ctx.shadowBlur = 15;
      ctx.fillStyle = 'rgba(0, 212, 255, 0.6)';
      ctx.beginPath();
      ctx.arc(gx, gy, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(0, 212, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(gx, gy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw line between target and gaze
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(targetX, targetY);
      ctx.lineTo(gx, gy);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Progress bar
    const elapsed = performance.now() - this.startTime;
    const progress = Math.min(1, elapsed / 10000);
    ctx.fillStyle = 'rgba(0, 212, 255, 0.2)';
    ctx.fillRect(0, H - 4, W * progress, 4);
    ctx.fillStyle = '#00d4ff';
    ctx.fillRect(0, H - 4, W * progress, 2);

    // Instructions
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nhìn theo ngôi sao 🎯', W / 2, 30);
  }

  _showWinkPrompt(text) {
    // Will be overridden by CalibrationFlow
    this._winkPromptText = text;
  }

  _renderWinkTest(now) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#b388ff';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('👁️', W / 2, H / 2 - 40);

    ctx.fillStyle = '#00d4ff';
    ctx.font = '22px sans-serif';
    ctx.fillText(this._winkPromptText || 'Nhấp nháy mắt!', W / 2, H / 2 + 30);

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '14px sans-serif';
    const count = this.winkResults.left.length + this.winkResults.right.length;
    ctx.fillText(`Đã phát hiện: ${count}/6 lần`, W / 2, H / 2 + 70);
  }

  /**
   * Register a wink detection (called from outside)
   */
  registerWink(side) {
    if (!this.winkTestPhase) return;

    if (this.currentWinkSide === side) {
      this.winkResults[side].push(Date.now());
      this.winkTestCount++;

      if (this.winkTestCount >= 3) {
        // Switch to the other eye
        if (this.currentWinkSide === 'left') {
          this.currentWinkSide = 'right';
          this.winkTestCount = 0;
          this._showWinkPrompt('Nhấp nháy mắt PHẢI 3 lần! 👁️');
        } else {
          // All done, let the loop finish naturally
          this.currentWinkSide = 'done';
        }
      }
    }
  }

  _finish() {
    this.isRunning = false;
    this.isComplete = true;

    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    // Analyze wink capability
    const leftWinks = this.winkResults.left.length;
    const rightWinks = this.winkResults.right.length;
    const winkCapable = leftWinks >= 2 && rightWinks >= 2;

    if (this.callbacks.onComplete) {
      this.callbacks.onComplete({
        samples: this.samples,
        winkCapable,
        winkResults: this.winkResults
      });
    }

    // Render completion message
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#00e676';
    ctx.font = '32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✅ Hoàn tất!', W / 2, H / 2);
  }

  /** Stop the game early */
  stop() {
    this.isRunning = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /** Draw a star shape */
  _drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
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
