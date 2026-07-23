/**
 * EyeAssist STEM — Main application entry point
 *
 * Bootstraps all subsystems:
 *   - MediaPipe Face Mesh + Webcam
 *   - Gaze Engine (EAR, blink detection, filtering)
 *   - Fusion Engine (multi-modal input fusion)
 *   - Casio App
 *   - Physics App
 *   - Calibration flow
 *   - Analytics
 */
import { FusionEngine } from './fusion/FusionEngine.js';
import { VoiceHandler } from './fusion/VoiceHandler.js';
import { CommandParser } from './fusion/CommandParser.js';
import { CasioKeyMatrix } from './modules/CasioKeyMatrix.js';

import { PhysicsController } from './modules/PhysicsController.js';
import { CalibrationFlow } from './calibration/CalibrationFlow.js';
import { ProfileManager } from './core/ProfileManager.js';
import { AnalyticsLogger } from './core/AnalyticsLogger.js';
import { AudioFeedback } from './core/AudioFeedback.js';
import { GazeToScreen } from './engine/GazeToScreen.js';
import { GazeFilter } from './engine/GazeFilter.js';
import { AdaptiveLearner } from './engine/AdaptiveLearner.js';
import { BlinkDetector } from './engine/BlinkDetector.js';
import { GestureMatcher } from './engine/GestureMatcher.js';
import { EARCalculator } from './engine/EARCalculator.js';

// ============ GLOBAL STATE ============
const state = {
  webcam: null,
  faceMesh: null,
  isRunning: false,
  gazePosition: { x: 0.5, y: 0.5 },
  currentTab: 'casio',
  isCalibrated: false,
  gazeWorker: null,
};

/** Last good gaze position before blink started (to freeze cursor during blinks) */
let lastGoodGaze = { x: 0.5, y: 0.5 };

// ============ INSTANTIATE SUBSYSTEMS ============
const fusion = new FusionEngine();
const voice = new VoiceHandler();
const cmdParser = new CommandParser();
const casioKeys = new CasioKeyMatrix();

const physics = new PhysicsController();
const calibration = new CalibrationFlow();
const profileManager = new ProfileManager();
const analytics = new AnalyticsLogger();
const audio = new AudioFeedback();
const gazeMapper = new GazeToScreen();
const gazeFilter = new GazeFilter();
const adaptiveLearner = new AdaptiveLearner();
const blinkDetector = new BlinkDetector();
const gestureMatcher = new GestureMatcher();

// ============ DOM REFS ============
const $ = (id) => document.getElementById(id);
const dom = {
  loading: $('loading-screen'),
  loadingFill: $('loading-fill'),
  loadingStatus: $('loading-status'),
  app: $('app'),
  webcam: $('webcam'),
  overlay: $('overlay'),
  fps: $('fps-counter'),
  tabs: document.querySelectorAll('.nav-tab'),
  tabContents: document.querySelectorAll('.tab-content'),
  camStatus: $('cam-status'),
  gazeStatus: $('gaze-status'),
  voiceStatus: $('voice-status'),
  calibrationCanvas: $('calibration-canvas'),
  btnStartCal: $('btn-start-calibration'),
  btnSkipCal: $('btn-skip-calibration'),
  calibrationResult: $('calibration-result'),
  calibrationMode: $('calibration-mode'),
  calibrationStatus: $('calibration-status'),
  btnApplyCal: $('btn-apply-calibration'),

  gazeCursor: $('gaze-cursor'),
  voiceFeedback: $('voice-feedback'),
  btnToggleAnalytics: $('btn-toggle-analytics'),
  analyticsContent: $('analytics-content'),
  statSession: $('stat-session-time'),
  statClicks: $('stat-clicks'),
  statAccuracy: $('stat-accuracy'),
  statErrors: $('stat-errors'),
  physicsCanvas: $('physics-canvas'),
  btnNewProblem: $('btn-new-problem'),
  btnLockAnswer: $('btn-lock-answer'),
  btnNextProblem: $('btn-next-problem'),
  physicsQuestion: $('physics-question'),
  physicsScore: $('physics-score'),
  physicsResultText: $('physics-result-text'),
  btnMicToggle: $('btn-mic-toggle'),
  micIcon: $('mic-icon'),
};

// ============ APP INIT ============
async function init() {
  try {
    updateLoading(10, 'Đang tải MediaPipe...');
    await initMediaPipe();
    
    updateLoading(40, 'Đang khởi động webcam...');
    await initWebcam();
    
    updateLoading(70, 'Đang khởi tạo modules...');
    initModules();
    
    updateLoading(85, 'Đang tải profile...');
    await loadProfile();
    
    updateLoading(95, 'Hoàn tất...');
    
    // Show the app
    setTimeout(() => {
      dom.loading.classList.add('hidden');
      dom.app.style.display = 'flex';
      startGazeLoop();
      voice.start();
      scaleCalculator();
    }, 500);
  } catch (err) {
    console.error('Init error:', err);
    dom.loadingStatus.textContent = `Lỗi: ${err.message}. Vui lòng reload.`;
  }
}

// ============ MEDIAPIPE FACE MESH ============
async function initMediaPipe() {
  try {
    // MediaPipe Face Mesh loaded via CDN script tag
    const { FaceMesh } = window;
    if (!FaceMesh) {
      throw new Error('MediaPipe Face Mesh not loaded. Using fallback mode.');
    }
    
    state.faceMesh = new FaceMesh({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
      }
    });

    state.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,  // Enable iris landmarks
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    state.faceMesh.onResults(onFaceResults);
  } catch (e) {
    console.warn('MediaPipe init warning:', e.message);
    // Continue without face mesh - will use mouse fallback
  }
}

async function initWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user',
      },
      audio: false,
    });
    
    dom.webcam.srcObject = stream;
    await dom.webcam.play();
    dom.camStatus.classList.add('active');
  } catch (e) {
    console.warn('Webcam access denied:', e.message);
    dom.camStatus.classList.add('error');
    // Continue without webcam
  }
}

// ============ MODULES INIT ============
function initModules() {
  // Casio (initialized by casio/script.js on DOMContentLoaded)
  
  
  // Physics
  physics.init(dom.physicsCanvas);
  physics.onScoreUpdate = (result) => {
    dom.physicsResultText.textContent = result.correct
      ? `✅ Đúng! (${result.score}/${result.total})`
      : `❌ Sai! Đáp án đúng đã hiển thị (${result.score}/${result.total})`;
    dom.physicsScore.style.display = 'block';
    dom.btnLockAnswer.disabled = true;
  };

  // Tab switching
  dom.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Calibration buttons
  dom.btnStartCal.addEventListener('click', startCalibration);
  dom.btnSkipCal.addEventListener('click', skipCalibration);
  dom.btnApplyCal.addEventListener('click', applyCalibration);

  // Physics buttons
  dom.btnNewProblem.addEventListener('click', () => {
    const problem = physics.newProblem();
    dom.physicsQuestion.textContent = problem.question;
    dom.physicsScore.style.display = 'none';
    dom.btnLockAnswer.disabled = false;
  });
  
  dom.btnLockAnswer.addEventListener('click', () => {
    physics._lockAnswer();
    dom.btnLockAnswer.disabled = true;
  });
  
  dom.btnNextProblem.addEventListener('click', () => {
    const problem = physics.newProblem();
    dom.physicsQuestion.textContent = problem.question;
    dom.physicsScore.style.display = 'none';
    dom.btnLockAnswer.disabled = false;
  });

  // Analytics toggle
  dom.btnToggleAnalytics.addEventListener('click', () => {
    const visible = dom.analyticsContent.style.display !== 'none';
    dom.analyticsContent.style.display = visible ? 'none' : 'block';
  });

  // Mic toggle button
  dom.btnMicToggle.addEventListener('click', () => {
    voice.toggle();
    updateMicUI();
  });
  
  // Voice status update on start/stop
  voice.on('onStart', () => { dom.voiceStatus.classList.add('active'); updateMicUI(); });
  voice.on('onEnd', () => { dom.voiceStatus.classList.remove('active'); updateMicUI(); });
  voice.on('onError', () => { dom.voiceStatus.classList.add('error'); updateMicUI(); });

  // Scale Casio calculator to fill viewport
  scaleCalculator();
  window.addEventListener('resize', scaleCalculator);
  
  // Debug: press F to toggle flipX (mirror mode)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') {
      const old = gazeMapper.flipX;
      if (gazeMapper.flipX === null) gazeMapper.flipX = true;
      else if (gazeMapper.flipX === true) gazeMapper.flipX = false;
      else gazeMapper.flipX = null;  // back to auto
      console.log(
        `[Debug] flipX: ${old} → ${gazeMapper.flipX}` +
        ` (null=auto, true=flip, false=noflip)`
      );
    }
  });
}

// ============ FACE RESULTS CALLBACK ============
/** Convert normalized gaze (0-1) to viewport pixels */
function gazeToViewport(nx, ny) {
  return {
    x: nx * window.innerWidth,
    y: ny * window.innerHeight
  };
}

function onFaceResults(results) {
  if (!results || !results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    return;
  }

  const landmarks = results.multiFaceLandmarks[0];
  
  // 1. Compute EAR
  const ear = EARCalculator.compute(landmarks);
  
  // 2. Compute gaze vector
  const gazeRaw = GazeToScreen.computeGazeVector(landmarks, gazeMapper.flipX);
  
  // 3. Apply One Euro Filter
  const now = performance.now();
  const gazeFiltered = gazeFilter.filter(gazeRaw.x, gazeRaw.y, now);
  
  // 4. Map to normalized (0-1)
  gazeMapper.compensateHeadPose(landmarks);
  const gazeNorm = gazeMapper.map(gazeFiltered.x, gazeFiltered.y);
  
  // Store normalized gaze (used by calibration which needs 0-1 coords)
  state.gazePosition = { x: gazeNorm.x, y: gazeNorm.y };
  
  // Convert to viewport pixels for UI interaction
  const vp = gazeToViewport(gazeNorm.x, gazeNorm.y);
  
  // 5. Update blink detector
  blinkDetector.update(ear.left, ear.right, now);
  
  // 5b. FREEZE gaze during blink — eyes closing/closed = iris landmarks unreliable
  //     Prevents cursor jumping to random position when user blinks to click
  if (blinkDetector.state !== 'OPEN') {
    // Keep last good gaze position, don't update cursor or snap
    const frozen = gazeToViewport(lastGoodGaze.x, lastGoodGaze.y);
    updateGazeCursor(frozen.x, frozen.y);
    dom.gazeStatus.classList.add('active');
    drawOverlay(landmarks);
    return; // Skip gesture, adaptive learner, snap, hit test
  }
  
  // Save last good gaze (only when eyes are OPEN)
  lastGoodGaze = { x: gazeNorm.x, y: gazeNorm.y };
  
  // 6. Update gesture matcher
  gestureMatcher.addSample(vp.x, vp.y, now);
  const gesture = gestureMatcher.match();
  
  // 7. Update adaptive learner
  adaptiveLearner.updateFromOpenEar(ear.left, ear.right);
  const jitter = measureJitter(gazeFiltered.x, gazeFiltered.y);
  adaptiveLearner.updateFromGaze(jitter);
  gazeFilter.tune(jitter);
  
  // 8. Dynamically set blink thresholds
  blinkDetector.setThreshold(
    adaptiveLearner.getEARThreshold(),
    adaptiveLearner.getDurationThreshold()
  );
  
  // 9. Snap gaze to nearest key (magnetic effect)
  if (state.currentTab === 'casio') {
    const snap = casioKeys.snapToNearest(vp.x, vp.y);
    if (snap) {
      vp.x = snap.cx;
      vp.y = snap.cy;
    }
  }

  // 10. Update gaze cursor (viewport coords)
  updateGazeCursor(vp.x, vp.y);
  
  // 11. Hit test for Casio (viewport coords)
  if (state.currentTab === 'casio') {
    const keyId = casioKeys.hitTest(vp.x, vp.y);
    casioKeys.setGazeHover(keyId);
    fusion.lastGazeTarget = keyId;
  }
  
  // 12. Update gaze status
  dom.gazeStatus.classList.add('active');
  
  // Gesture detected
  if (gesture) {
    fusion.handleGesture(gesture);
  }

  // Draw overlay
  drawOverlay(landmarks);
}

// ============ GAZE LOOP ============
function startGazeLoop() {
  if (!state.faceMesh || !dom.webcam.srcObject) return;
  
  state.isRunning = true;
  
  async function loop() {
    if (!state.isRunning) return;
    
    try {
      if (dom.webcam.readyState >= 2) {
        await state.faceMesh.send({ image: dom.webcam });
      }
    } catch (e) {
      // Silently continue
    }
    
    requestAnimationFrame(loop);
  }
  
  loop();
  
  // Also run a fallback mouse-based gaze for testing without webcam
  if (!dom.webcam.srcObject) {
    enableMouseFallback();
  }
}

// ============ MOUSE FALLBACK (for testing without webcam) ============
function enableMouseFallback() {
  document.addEventListener('mousemove', (e) => {
    state.gazePosition = { x: e.clientX, y: e.clientY };
    let mx = e.clientX, my = e.clientY;
    
    if (state.currentTab === 'casio') {
      const snap = casioKeys.snapToNearest(mx, my);
      if (snap) {
        mx = snap.cx;
        my = snap.cy;
      }
      const keyId = casioKeys.hitTest(mx, my);
      casioKeys.setGazeHover(keyId);
      fusion.lastGazeTarget = keyId;
    }
    
    updateGazeCursor(mx, my);
  });
  
  document.addEventListener('click', (e) => {
    fusion.handleBlink({
      subtype: 'short',
      duration: 300,
      timestamp: Date.now(),
    });
  });
  
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    fusion.handleBlink({
      subtype: 'long',
      duration: 800,
      timestamp: Date.now(),
    });
  });
}

// ============ GAZE CURSOR ============
function updateGazeCursor(vpX, vpY) {
  const cursor = dom.gazeCursor;
  
  if (state.currentTab === 'casio') {
    const appEl = document.getElementById('casio-app');
    if (appEl) {
      const appRect = appEl.getBoundingClientRect();
      // Convert viewport coords to be relative to casio-app
      cursor.style.left = `${(vpX - appRect.left) / appRect.width * 100}%`;
      cursor.style.top = `${(vpY - appRect.top) / appRect.height * 100}%`;
      cursor.classList.add('visible');
      return;
    }
  }
  
  // Default: position relative to viewport
  cursor.style.left = `${vpX}px`;
  cursor.style.top = `${vpY}px`;
  cursor.classList.add('visible');
}

// ============ BLINK DETECTOR WIRING ============
// Intentional blink → fusion (click/action) + adaptive learner (k-means training)
blinkDetector.on('onIntentional', (blinkData) => {
  adaptiveLearner.updateFromBlink(blinkData);
  fusion.handleBlink({
    subtype: blinkData.type,
    duration: blinkData.duration,
    timestamp: Date.now(),
  });
});

blinkDetector.on('onWink', (side, duration) => {
  fusion.handleBlink({
    subtype: 'wink',
    side,
    duration,
    timestamp: Date.now(),
  });
});

// Natural blink → adaptive learner only (not an action)
blinkDetector.on('onNatural', (blinkData) => {
  adaptiveLearner.updateFromBlink(blinkData);
});

// ============ FUSION ENGINE WIRING ============
fusion.on('onClick', (clickData) => {
  const { action, target, x, y } = clickData;
  
  audio.playClick();
  analytics.log({
    input: 'blink',
    action,
    target: target || 'unknown',
    accuracy: 1,
    success: true,
  });

  switch (state.currentTab) {
    case 'casio':
      if (target) {
        casioKeys.pressKey(target);
      }
      break;
    case 'physics':
      physics.handleBlink(clickData);
      break;
  }
});

fusion.on('onVoice', (voiceData) => {
  const { command, gazeTarget } = voiceData;
  
  if (!command || command.type === 'unknown') return;
  
  audio.playVoiceReceived();
  
  if (!window.handleKey) return;
  
  // Handle control commands
  if (command.type === 'control') {
    switch (command.action) {
      case 'clear': window.handleKey('AC'); break;
      case 'backspace': window.handleKey('DEL'); break;
    }
    window.saveState && window.saveState();
    return;
  }
  
  // Map Vietnamese operator to Casio key
  const opToKey = {
    '+': 'PLUS', '-': 'MINUS', '*': 'MULTIPLY', '/': 'DIVIDE',
    '=': 'EQUALS', '(': 'LPAREN', ')': 'RPAREN',
    '^': 'POWER', '^2': 'SQUARE',
    'sqrt(': 'SQRT',
  };
  
  if (command.type === 'operator') {
    const key = opToKey[command.op];
    if (key) {
      window.handleKey(key);
      window.saveState && window.saveState();
    }
    return;
  }
  
  // Type a number digit by digit
  if (command.type === 'number') {
    const digits = String(command.value);
    for (const ch of digits) {
      if (ch === '.') {
        window.handleKey('DOT');
      } else {
        window.handleKey(ch);
      }
    }
    window.saveState && window.saveState();
    return;
  }
  
  analytics.log({
    input: 'voice',
    action: command.type,
    target: command.raw,
    success: true,
  });
});

fusion.on('onGesture', (gestureData) => {
  const action = GestureMatcher.gestureToAction(gestureData.gesture);
  if (window.handleKey) {
    if (action === 'clear') window.handleKey('AC');
    else if (action === 'equals') window.handleKey('EQUALS');
  }
  
  analytics.log({
    input: 'gesture',
    action: action,
    target: gestureData.gesture,
    accuracy: gestureData.score,
    success: true,
  });
});

fusion.on('onGazeHover', (gazeData) => {
  // Update analytics if needed
});

// ============ VOICE HANDLER ============
voice.on('onResult', (command, raw) => {
  // Show voice feedback
  dom.voiceFeedback.textContent = `🎤 "${raw}"`;
  dom.voiceFeedback.classList.add('visible', 'listening');
  setTimeout(() => dom.voiceFeedback.classList.remove('listening'), 2000);
  
  fusion.handleVoice(command);
});

voice.on('onInterim', (text) => {
  dom.voiceFeedback.textContent = `🎤 ${text}`;
  dom.voiceFeedback.classList.add('visible');
});

voice.on('onEnd', () => {
  dom.voiceFeedback.classList.remove('visible', 'listening');
});

voice.on('onError', (err) => {
  dom.voiceStatus.classList.add('error');
  dom.voiceFeedback.textContent = `⚠️ Lỗi mic: ${err}`;
  dom.voiceFeedback.classList.add('visible');
});

// ============ TAB SWITCHING ============
function switchTab(tabId) {
  state.currentTab = tabId;
  
  dom.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  dom.tabContents.forEach(t => t.classList.toggle('active', t.id === `tab-${tabId}`));
  
  // Handle physics tab resize
  if (tabId === 'physics') {
    setTimeout(() => {
      const container = dom.physicsCanvas.parentElement;
      if (container) {
        physics.handleResize(container.clientWidth, container.clientHeight);
      }
    }, 100);
  }
}

// ============ CALIBRATION ============
async function startCalibration() {
  dom.btnStartCal.disabled = true;
  dom.btnStartCal.textContent = 'Đang hiệu chỉnh...';
  
  calibration.onProgress = (progress) => {
    dom.calibrationStatus.textContent = 
      `Đã thu thập: ${progress.samples} mẫu`;
  };
  
  calibration.onComplete = (result) => {
    dom.calibrationResult.style.display = 'block';
    dom.calibrationMode.textContent = `Phát hiện: Mode ${result.mode}`;
    dom.calibrationStatus.textContent = 
      `Độ chính xác: ${Math.round(result.accuracy * 100)}%` + 
      (result.winkCapable ? ' | Có thể nháy mắt' : ' | Chớp cả 2 mắt');
    dom.btnStartCal.textContent = 'Bắt đầu hiệu chỉnh';
    dom.btnStartCal.disabled = false;
    
    audio.playCalibrationDone();
    
    // Save profile
    profileManager.save({
      id: 'default',
      mode: result.mode,
      accuracy: result.accuracy,
      gazeCalibrated: true,
      winkCapable: result.winkCapable,
      calibrationPoints: result.calibrationPoints,
      adaptiveState: adaptiveLearner.serialize(),
    });
  };

  const getGaze = () => state.gazePosition;
  
  // Pass existing gaze mapper and adaptive learner
  calibration.start(
    dom.calibrationCanvas,
    getGaze,
    { gazeMapper, adaptiveLearner }
  );
}

function skipCalibration() {
  dom.calibrationResult.style.display = 'block';
  dom.calibrationMode.textContent = 'Phát hiện: Mode A (mặc định)';
  dom.calibrationStatus.textContent = 'Độ chính xác: ~50% (ước tính)';
  calibration.cancel();
}

function applyCalibration() {
  state.isCalibrated = true;
  dom.calibrationResult.style.display = 'none';
  switchTab('casio');
}

// ============ PROFILE ============
async function loadProfile() {
  try {
    const profile = await profileManager.get('default');
    
    if (profile.gazeCalibrated && profile.accuracy > 0) {
      state.isCalibrated = true;
      
      if (profile.adaptiveState) {
        adaptiveLearner.deserialize(profile.adaptiveState);
      }
      
      if (profile.calibrationPoints && profile.calibrationPoints.length > 0) {
        gazeMapper.setCalibration(
          profile.calibrationPoints,
          gazeMapper.resolution.w,
          gazeMapper.resolution.h
        );
      }
    }
  } catch (e) {
    console.warn('Profile load failed:', e);
  }
}

// ============ VOICE MIC UI ============
function updateMicUI() {
  if (voice.isListening) {
    dom.btnMicToggle.classList.add('active', 'listening');
    dom.micIcon.textContent = '🎙️';
    dom.voiceStatus.classList.add('active');
  } else {
    dom.btnMicToggle.classList.remove('active', 'listening');
    dom.micIcon.textContent = '🎤';
    dom.voiceStatus.classList.remove('active');
  }
}

// ============ CASIO CALCULATOR SCALING ============
function scaleCalculator() {
  const casioApp = document.getElementById('casio-app');
  const wrapper = document.querySelector('.calculator-wrapper');
  const tab = document.getElementById('tab-casio');
  if (!casioApp || !wrapper || !tab) return;

  const naturalW = 370;   // .calculator width in px (from casio/style.css)
  const naturalH = 650;   // approximate full height
  const availW = tab.clientWidth - 40;   // 20px padding each side
  const availH = tab.clientHeight - 40;

  if (availW <= 0 || availH <= 0) return;

  const scale = Math.min(1, availW / naturalW, availH / naturalH);
  casioApp.style.transform = `scale(${scale})`;
  casioApp.style.marginBottom = `${-(1 - scale) * naturalH}px`;
}

// ============ UTILITIES ============
function updateLoading(pct, text) {
  dom.loadingFill.style.width = `${pct}%`;
  if (text) dom.loadingStatus.textContent = text;
}

// Jitter measurement buffer
const _jitterBuf = [];
function measureJitter(x, y) {
  _jitterBuf.push({ x, y });
  if (_jitterBuf.length > 10) _jitterBuf.shift();
  if (_jitterBuf.length < 3) return 0;
  
  let sumDx = 0, sumDy = 0;
  for (let i = 1; i < _jitterBuf.length; i++) {
    sumDx += Math.abs(_jitterBuf[i].x - _jitterBuf[i-1].x);
    sumDy += Math.abs(_jitterBuf[i].y - _jitterBuf[i-1].y);
  }
  return (sumDx + sumDy) / (_jitterBuf.length - 1) / 2;
}

// Draw overlay on cam preview
function drawOverlay(landmarks) {
  const ctx = dom.overlay.getContext('2d');
  const W = 160, H = 120;
  
  ctx.clearRect(0, 0, W, H);
  
  if (!landmarks) return;
  
  // Draw eye landmarks
  ctx.fillStyle = '#00d4ff';
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 1;
  
  const eyeIndices = [33, 133, 159, 145, 158, 153, 362, 263, 385, 380, 386, 373];
  eyeIndices.forEach(idx => {
    const pt = landmarks[idx];
    if (pt) {
      const x = pt.x * W;
      const y = pt.y * H;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// ============ ANALYTICS UPDATE LOOP ============
setInterval(() => {
  const metrics = analytics.getMetrics();
  dom.statSession.textContent = metrics.sessionTime;
  dom.statClicks.textContent = metrics.totalClicks;
  dom.statAccuracy.textContent = `${metrics.avgAccuracy}%`;
  dom.statErrors.textContent = metrics.totalErrors;
}, 2000);

// ============ START ============
document.addEventListener('DOMContentLoaded', () => {
  init();
  
  // Physics canvas resize on window resize
  window.addEventListener('resize', () => {
    if (state.currentTab === 'physics') {
      const container = dom.physicsCanvas.parentElement;
      if (container) {
        physics.handleResize(container.clientWidth, container.clientHeight);
      }
    }
  });
});
