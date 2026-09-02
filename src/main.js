/**
 * EyeAssist — Main application entry point
 *
 * Bootstraps all subsystems:
 *   - MediaPipe Face Mesh + Webcam
 *   - Gaze Engine (EAR, adaptive thresholds, BlinkBaseline, BlinkClassifier, filtering)
 *   - Dwell-Blink Confirmation (BlinkProgressBar)
 *   - Fusion Engine (multi-modal input fusion)
 *   - Casio App (fx-580VN X simulation)
 *   - Hand Module 3D (Three.js simulation)
 *   - Physics App (Problem generator & simulation)
 *   - Calibration Flow (9-Point Grid & Lissajous Pursuit)
 *   - Analytics & Audio Feedback
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
import { BlinkClassifier } from './engine/BlinkClassifier.js';
import { GestureMatcher } from './engine/GestureMatcher.js';
import { EARCalculator } from './engine/EARCalculator.js';
import { BlinkProgressBar } from './modules/BlinkProgressBar.js';
import { HandModule3D } from './modules/HandModule3D.js';
import { GazeSelect } from './modules/GazeSelect.js';
import {
  loginWithEmail,
  registerWithEmail,
  loginWithGoogle,
  logoutUser,
  resetPassword,
  onAuthChange
} from './auth/auth.js';

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

/** Thời điểm hành động cuối được thực thi (chống kích hoạt lặp) */
let lastActionTime = 0;

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

// Phase 2: classifier chia sẻ baseline của adaptiveLearner (học từ người dùng)
const blinkClassifier = new BlinkClassifier({ baseline: adaptiveLearner.baseline });
const blinkDetector = new BlinkDetector({ classifier: blinkClassifier });
const gestureMatcher = new GestureMatcher();

// Phase 3: progress bar xác nhận nháy mắt chủ đích (dwell-blink confirmation)
const blinkProgress = new BlinkProgressBar({
  confirmMs: 600,
  cancelRadius: 48
});

// ---- Realtime dwell ring: lấp đầy NGAY TRONG LÚC nhắm mắt ----
// Vòng tròn bắt đầu khi mắt nhắm qua mức tối thiểu và lấp đầy theo thời gian
// nhắm thực tế; đủ lâu thì kích hoạt — không chờ mở mắt xong mới chạy.
const DWELL_INTENTIONAL_MS = 450;   // nhắm đủ mức này → xác nhận
const DWELL_MIN_START_MS = 120;     // dưới mức này = chớp thường, chưa hiện ring
let dwellData = null;               // realtime state của vòng hiện tại
let dwellLocked = false;            // Khóa chống bấm lặp trong cùng lần nhắm
let blinkHandledThisCycle = false;  // Cờ đánh dấu nháy mắt chu kỳ này đã kích hoạt click

blinkDetector.on('onCloseFrame', ({ closedMs }) => {
  if (dwellLocked || blinkHandledThisCycle) return;
  if (closedMs < DWELL_MIN_START_MS) return;

  if (!dwellData) {
    const rect = dom.gazeCursor ? dom.gazeCursor.getBoundingClientRect() : null;
    let cx = 0, cy = 0;
    if (rect && rect.width > 0 && rect.height > 0) {
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
    } else {
      const vp = gazeToViewport(lastGoodGaze.x, lastGoodGaze.y);
      cx = vp.x; cy = vp.y;
    }
    dwellData = { x: cx, y: cy };
    blinkProgress.start(cx, cy, { subtype: 'long', duration: 0, confidence: 0.85 }, {
      target: fusion.lastGazeTarget,
      confirmMs: DWELL_INTENTIONAL_MS - DWELL_MIN_START_MS
    });
  }
});

const handModule = new HandModule3D();
let handModuleInited = false;

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
  blinkStats: $('blink-stats'),
  tabs: document.querySelectorAll('.nav-tab'),
  tabContents: document.querySelectorAll('.tab-content'),
  camStatus: $('cam-status'),
  gazeStatus: $('gaze-status'),
  voiceStatus: $('voice-status'),

  // Calibration DOM
  calSetupCard: $('cal-setup-card'),
  calWorkspaceCard: $('cal-workspace-card'),
  calibrationResult: $('calibration-result'),
  calibrationCanvas: $('calibration-canvas'),
  calGazePreview: $('cal-gaze-preview'),
  calProgressFill: $('cal-progress-fill'),
  calPhaseText: $('cal-phase-text'),
  calSampleCount: $('cal-sample-count'),
  calMetricAcc: $('cal-metric-acc'),
  calMetricStab: $('cal-metric-stab'),
  calMetricMode: $('cal-metric-mode'),
  calMetricModeSub: $('cal-metric-mode-sub'),
  calibrationMode: $('calibration-mode'),
  calibrationStatus: $('calibration-status'),
  calModeDesc: $('calibration-mode-desc'),
  calHitRate: $('cal-hit-rate'),
  hitRateGrid: $('hit-rate-grid'),
  btnStartCal: $('btn-start-calibration'),
  btnSkipCal: $('btn-skip-calibration'),
  btnCancelCal: $('btn-cancel-calibration'),
  btnTestCal: $('btn-test-calibration'),
  btnApplyCal: $('btn-apply-calibration'),
  btnRestartCal: $('btn-restart-calibration'),

  // General UI
  gazeCursor: $('gaze-cursor'),
  voiceFeedback: $('voice-feedback'),
  btnToggleAnalytics: $('btn-toggle-analytics'),
  analyticsContent: $('analytics-content'),
  statSession: $('stat-session-time'),
  statClicks: $('stat-clicks'),
  statAccuracy: $('stat-accuracy'),
  statErrors: $('stat-errors'),

  // Physics DOM
  physicsCanvas: $('physics-canvas'),
  btnNewProblem: $('btn-new-problem'),
  btnLockAnswer: $('btn-lock-answer'),
  btnNextProblem: $('btn-next-problem'),
  physicsQuestion: $('physics-question'),
  physicsScore: $('physics-score'),
  physicsResultText: $('physics-result-text'),

  // Voice toggle
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
      if (dom.loading) dom.loading.classList.add('hidden');
      if (dom.app) dom.app.style.display = 'grid';
      moveNavPill(false); // snap pill vào tab active ngay khi app hiện (không animate lần đầu)
      startGazeLoop();
      voice.start();
      scaleCalculator();
    }, 500);
  } catch (err) {
    console.error('Init error:', err);
    if (dom.loadingStatus) dom.loadingStatus.textContent = `Lỗi: ${err.message}. Vui lòng reload.`;
  }
}

// ============ MEDIAPIPE FACE MESH ============
async function initMediaPipe() {
  try {
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
    
    if (dom.webcam) {
      dom.webcam.srcObject = stream;
      await dom.webcam.play();
    }
    if (dom.camStatus) dom.camStatus.classList.add('active');
  } catch (e) {
    console.warn('Webcam access denied:', e.message);
    if (dom.camStatus) dom.camStatus.classList.add('error');
  }
}

// ============ STATUS LABEL SYNC (feedback kép: dot + nhãn chữ) ============
const STATUS_TEXT = {
  'cam-status':   { base: 'Chờ', active: 'Ổn định', error: 'Lỗi cam' },
  'gaze-status':  { base: 'Chờ', active: 'Đang theo', error: 'Lỗi' },
  'voice-status': { base: 'Chờ', active: 'Đang nghe', error: 'Lỗi mic' },
};

function syncStatusLabel(row) {
  if (!row) return;
  const map = STATUS_TEXT[row.id];
  const val = row.querySelector('.status-val');
  if (!map || !val) return;
  val.textContent = row.classList.contains('error') ? map.error
    : row.classList.contains('active') ? map.active
    : map.base;
}

function initStatusLabelSync() {
  for (const id of Object.keys(STATUS_TEXT)) {
    const row = $(id);
    if (!row) continue;
    new MutationObserver(() => syncStatusLabel(row))
      .observe(row, { attributes: true, attributeFilter: ['class'] });
    syncStatusLabel(row);
  }
}

// ============ MODULES INIT ============
function initModules() {
  // Physics
  if (dom.physicsCanvas) {
    physics.init(dom.physicsCanvas);
    physics.onScoreUpdate = (result) => {
      if (dom.physicsResultText) {
        dom.physicsResultText.textContent = result.correct
          ? `✅ Đúng! (${result.score}/${result.total})`
          : `❌ Sai! Đáp án đúng đã hiển thị (${result.score}/${result.total})`;
      }
      if (dom.physicsScore) dom.physicsScore.style.display = 'block';
      if (dom.btnLockAnswer) dom.btnLockAnswer.disabled = true;
    };
  }

  // Tab switching
  dom.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      if (tabId) switchTab(tabId);
    });
  });

  // Resize: đo lại pill không animation để nó snap đúng vị trí
  window.addEventListener('resize', () => moveNavPill(false));

  // Method selector radio cards in calibration
  const methodCards = document.querySelectorAll('.cal-method-select .method-card');
  methodCards.forEach(card => {
    card.addEventListener('click', () => {
      methodCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  // Calibration buttons
  if (dom.btnStartCal) dom.btnStartCal.addEventListener('click', startCalibration);
  if (dom.btnSkipCal) dom.btnSkipCal.addEventListener('click', skipCalibration);
  if (dom.btnCancelCal) dom.btnCancelCal.addEventListener('click', cancelCalibration);
  if (dom.btnTestCal) dom.btnTestCal.addEventListener('click', startLiveTest);
  if (dom.btnApplyCal) dom.btnApplyCal.addEventListener('click', applyCalibration);
  if (dom.btnRestartCal) dom.btnRestartCal.addEventListener('click', restartCalibration);

  // Physics buttons
  if (dom.btnNewProblem) {
    dom.btnNewProblem.addEventListener('click', () => {
      const problem = physics.newProblem();
      if (dom.physicsQuestion) dom.physicsQuestion.textContent = problem.question;
      if (dom.physicsScore) dom.physicsScore.style.display = 'none';
      if (dom.btnLockAnswer) dom.btnLockAnswer.disabled = false;
    });
  }
  
  if (dom.btnLockAnswer) {
    dom.btnLockAnswer.addEventListener('click', () => {
      physics._lockAnswer();
      dom.btnLockAnswer.disabled = true;
    });
  }
  
  if (dom.btnNextProblem) {
    dom.btnNextProblem.addEventListener('click', () => {
      const problem = physics.newProblem();
      if (dom.physicsQuestion) dom.physicsQuestion.textContent = problem.question;
      if (dom.physicsScore) dom.physicsScore.style.display = 'none';
      if (dom.btnLockAnswer) dom.btnLockAnswer.disabled = false;
    });
  }

  // Analytics toggle
  if (dom.btnToggleAnalytics && dom.analyticsContent) {
    dom.btnToggleAnalytics.addEventListener('click', () => {
      const visible = dom.analyticsContent.style.display !== 'none';
      dom.analyticsContent.style.display = visible ? 'none' : 'block';
    });
  }

  // Mic toggle button
  if (dom.btnMicToggle) {
    dom.btnMicToggle.addEventListener('click', () => {
      voice.toggle();
      updateMicUI();
    });
  }
  
  // Voice status update on start/stop
  voice.on('onStart', () => { if (dom.voiceStatus) dom.voiceStatus.classList.add('active'); updateMicUI(); });
  voice.on('onEnd', () => { if (dom.voiceStatus) dom.voiceStatus.classList.remove('active'); updateMicUI(); });
  voice.on('onError', () => { if (dom.voiceStatus) dom.voiceStatus.classList.add('error'); updateMicUI(); });

  // Dual-feedback: cập nhật nhãn chữ của cụm trạng thái theo class
  initStatusLabelSync();

  // Scale Casio calculator to fill viewport
  scaleCalculator();
  window.addEventListener('resize', scaleCalculator);

  // Initialize Firebase Auth UI
  initAuthUI();
  
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
  
  // 1. Compute EAR (bù pitch để cúi/ngửa mặt không làm EAR sụt giả tạo)
  const earRaw = EARCalculator.compute(landmarks);
  const ear = {
    left: EARCalculator.compensate(earRaw.left, earRaw.cosPitch),
    right: EARCalculator.compensate(earRaw.right, earRaw.cosPitch),
    average: EARCalculator.compensate(earRaw.average, earRaw.cosPitch)
  };
  
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
    // Phase 3: gaze bị đóng băng → không tính là "rời mục tiêu"
    blinkProgress.updateGaze(frozen.x, frozen.y);
    if (dom.gazeStatus) dom.gazeStatus.classList.add('active');
    drawOverlay(landmarks);
    return; // Skip gesture, adaptive learner, snap, hit test
  }

  // FIX: Khi mắt đã OPEN trở lại (kết thúc chu kỳ nháy), reset cờ và mở khóa cho lần nháy tiếp theo
  if (blinkDetector.state === 'OPEN') {
    dwellLocked = false;
    blinkHandledThisCycle = false;
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
  
  // 8. Phase 1: set toàn bộ ngưỡng động (baseline cá nhân hóa)
  blinkDetector.setThresholds(adaptiveLearner.getThresholds());
  
  // 8b. Phase 2: feed context cho classifier — fixation stability, vận tốc
  //     gaze, mục tiêu, nhịp nháy, thời gian từ hành động cuối
  const fixation = gazeFilter.getFixationState(now);
  blinkClassifier.setContext({
    fixationStable: fixation.stable,
    gazeVelocity: fixation.velocity,
    target: fusion.lastGazeTarget !== null && fusion.lastGazeTarget !== undefined,
    blinkRate: blinkDetector.getBlinkRate(now),
    lastActionMs: performance.now() - lastActionTime
  });
  
  // 9. Snap gaze to nearest key/button (magnetic effect)
  if (state.currentTab === 'casio') {
    const snap = casioKeys.snapToNearest(vp.x, vp.y);
    if (snap) {
      vp.x = snap.cx;
      vp.y = snap.cy;
    }
  } else if (state.currentTab === 'hand' && handModule.snapToNearest) {
    const snap = handModule.snapToNearest(vp.x, vp.y);
    if (snap) {
      vp.x = snap.cx;
      vp.y = snap.cy;
    }
  }

  // 10. Update gaze cursor (viewport coords)
  updateGazeCursor(vp.x, vp.y);
  
  // 10b. Phase 3: theo dõi gaze để hủy xác nhận nếu rời mục tiêu
  blinkProgress.updateGaze(vp.x, vp.y);
  
  // 11. Hit test for Casio (viewport coords)
  if (state.currentTab === 'casio') {
    const keyId = casioKeys.hitTest(vp.x, vp.y);
    casioKeys.setGazeHover(keyId);
    fusion.lastGazeTarget = keyId;
  }

  // 11b. Hit test for Hand Module
  if (state.currentTab === 'hand') {
    const handTarget = handModule.updateGazeHover(vp.x, vp.y, now);
    fusion.lastGazeTarget = handTarget ? 'hand_element' : null;
  }

  // 11c. Nút UI chung (tabs, mic, hiệu chỉnh...) — học sinh không dùng tay
  //      phải bấm được MỌI nút bằng mắt. Nếu gaze nằm trên một nút UI thì
  //      nó thắng (bỏ qua phím trong #casio-app vì đã có đường casioKeys riêng)
  const uiEl = hitTestUIElement(vp.x, vp.y);
  updateUIHover(uiEl);
  if (uiEl) {
    fusion.lastGazeTarget = uiEl;
  } else if (state.currentTab !== 'casio' && state.currentTab !== 'hand') {
    fusion.lastGazeTarget = null;
  }
  
  // 12. Update gaze status
  if (dom.gazeStatus) dom.gazeStatus.classList.add('active');
  
  // Gesture detected
  if (gesture) {
    fusion.handleGesture(gesture);
  }

  // Draw overlay
  drawOverlay(landmarks);
}

// ============ GAZE LOOP ============
function startGazeLoop() {
  if (!state.faceMesh || !dom.webcam || !dom.webcam.srcObject) return;
  
  state.isRunning = true;
  
  async function loop() {
    if (!state.isRunning) return;
    
    try {
      if (dom.webcam && dom.webcam.readyState >= 2) {
        await state.faceMesh.send({ image: dom.webcam });
      }
    } catch (e) {
      // Silently continue
    }
    
    requestAnimationFrame(loop);
  }
  
  loop();
}

// ============ MOUSE FALLBACK (for testing without webcam) ============
function enableMouseFallback() {
  document.addEventListener('mousemove', (e) => {
    state.gazePosition = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
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
    } else if (state.currentTab === 'hand') {
      if (handModule.snapToNearest) {
        const snap = handModule.snapToNearest(mx, my);
        if (snap) {
          mx = snap.cx;
          my = snap.cy;
        }
      }
      const handTarget = handModule.updateGazeHover(mx, my, performance.now());
      fusion.lastGazeTarget = handTarget ? 'hand_element' : null;
    }
    
    blinkProgress.updateGaze(mx, my);
    updateGazeCursor(mx, my);
  });
  
  document.addEventListener('click', (e) => {
    if (e.target.closest('#casio-app')) return; // Nút Casio đã tự xử lý sự kiện riêng
    blinkProgress.start(e.clientX, e.clientY, {
      subtype: 'short',
      duration: 300,
      confidence: 0.9
    }, { target: fusion.lastGazeTarget });
  });
  
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    blinkProgress.start(e.clientX, e.clientY, {
      subtype: 'long',
      duration: 800,
      confidence: 0.9
    }, { target: fusion.lastGazeTarget });
  });
}

// ============ GAZE CURSOR ============
function updateGazeCursor(vpX, vpY) {
  const cursor = dom.gazeCursor;
  if (!cursor) return;
  
  if (state.currentTab === 'casio') {
    const appEl = document.getElementById('casio-app');
    if (appEl) {
      const appRect = appEl.getBoundingClientRect();
      cursor.style.left = `${(vpX - appRect.left) / appRect.width * 100}%`;
      cursor.style.top = `${(vpY - appRect.top) / appRect.height * 100}%`;
      cursor.classList.add('visible');
      return;
    }
  }
  
  cursor.style.left = `${vpX}px`;
  cursor.style.top = `${vpY}px`;
  cursor.classList.add('visible');
}

// ============ BLINK DETECTOR WIRING (Phase 1 + 2 + 3) ============
// Phân loại chi tiết → adaptive learner + chip UI
blinkDetector.on('onClassified', (classification) => {
  if (classification.blink) {
    adaptiveLearner.updateFromBlink({
      type: classification.type,
      duration: classification.blink.duration,
      earLeft: null,
      earRight: null,
      features: classification.blink.features,
      ...classification.blink
    });
  }

  // Chip phân loại gần con trỏ (feedback realtime)
  if (classification.type === 'natural' || classification.type === 'intentional' || classification.type === 'uncertain') {
    blinkProgress.showClassification(
      lastGoodGaze.x * window.innerWidth,
      lastGoodGaze.y * window.innerHeight,
      classification
    );
  }

  analytics.log({
    input: 'blink_classified',
    type: classification.type,
    confidence: classification.confidence,
    ...(classification.blink?.features ? { duration: classification.blink.duration } : {})
  });

  updateBlinkStatsUI();
});

// Nháy chủ đích → realtime dwell ring đã xử lý phần lớn trường hợp (nhắm đủ lâu).
// Handler này chỉ còn cho double-blink upgrade hoặc nháy ngắn không kịp chạy onCloseFrame.
blinkDetector.on('onIntentional', (blinkData) => {
  // Nếu chu kỳ nháy này đã được kích hoạt click xong (từ onCloseFrame dwell) → BỎ QUA, không bấm lặp!
  if (blinkHandledThisCycle || dwellLocked) {
    return;
  }

  if (blinkProgress.isActive) {
    if (blinkData.type === 'double') {
      blinkProgress.upgradeToDouble(blinkData);
    }
    return;
  }

  // Nếu realtime ring chưa kịp chạy (nháy rất nhanh nhưng vẫn được phân loại chủ đích)
  let cx = 0, cy = 0;
  const rect = dom.gazeCursor ? dom.gazeCursor.getBoundingClientRect() : null;
  if (rect && rect.width > 0 && rect.height > 0) {
    cx = rect.left + rect.width / 2;
    cy = rect.top + rect.height / 2;
  } else {
    const vp = gazeToViewport(lastGoodGaze.x, lastGoodGaze.y);
    cx = vp.x; cy = vp.y;
  }

  blinkProgress.start(cx, cy, blinkData, {
    target: fusion.lastGazeTarget,
    confirmMs: 250
  });
});

blinkDetector.on('onWink', (side, duration) => {
  if (blinkHandledThisCycle || dwellLocked) return;

  let cx = 0, cy = 0;
  const rect = dom.gazeCursor ? dom.gazeCursor.getBoundingClientRect() : null;
  if (rect && rect.width > 0 && rect.height > 0) {
    cx = rect.left + rect.width / 2;
    cy = rect.top + rect.height / 2;
  } else {
    const vp = gazeToViewport(lastGoodGaze.x, lastGoodGaze.y);
    cx = vp.x; cy = vp.y;
  }

  blinkProgress.start(cx, cy, { subtype: 'wink', side, duration }, {
    target: fusion.lastGazeTarget
  });
});

// Nháy tự nhiên → adaptive learner + dừng progress ring nếu đang chạy
blinkDetector.on('onNatural', (blinkData) => {
  adaptiveLearner.updateFromBlink({
    type: blinkData.type === 'uncertain' ? 'unknown' : 'natural',
    duration: blinkData.duration,
    features: blinkData.features
  });

  // Mở mắt quá sớm (chớp thường) → dừng ring, không hủy kiểu "gaze_moved"
  if (blinkProgress.isActive) {
    blinkProgress.cancel('natural_blink');
  }
  dwellData = null;
  blinkHandledThisCycle = false;

  updateBlinkStatsUI();
});

// ============ BLINK PROGRESS BAR CALLBACKS (Phase 3) ============
blinkProgress.on('onConfirm', (data) => {
  dwellData = null;   // ring hoàn tất → reset realtime state
  dwellLocked = true; // khóa đến khi mở mắt lại — chống vòng lặp click
  blinkHandledThisCycle = true; // Đánh dấu nháy mắt này đã kích hoạt click thành công
  const blink = data.blink;
  lastActionTime = performance.now();

  audio.playClick();

  analytics.log({
    input: 'blink',
    action: blink.subtype || 'click',
    target: data.target || 'unknown',
    confidence: blink.confidence,
    success: true
  });

  fusion.handleBlink({
    subtype: blink.subtype || 'short',
    duration: blink.duration,
    side: blink.side,
    confidence: blink.confidence,
    features: blink.features,
    timestamp: Date.now()
  });
});

blinkProgress.on('onCancel', (data, reason) => {
  dwellData = null;   // ring bị hủy → reset realtime state
  // Hủy vì lý do kỹ thuật (gaze nhảy) thì cho thử lại ngay; hủy vì natural blink
  // thì khóa đến khi mở mắt lại để tránh ring khởi động lại trong cùng lần nhắm
  if (reason === 'natural_blink') dwellLocked = true;
  audio.playCancel();
  analytics.log({
    input: 'blink_cancel',
    reason,
    subtype: data.blink?.subtype,
    success: false
  });
});

blinkProgress.onHalfTick = () => {
  audio.playTick();
};

// ============ FUSION ENGINE WIRING ============
fusion.on('onClick', (clickData) => {
  const { action, target, x, y } = clickData;

  // Nút UI chung (tabs, mic, hiệu chỉnh...) → phát click thật lên phần tử DOM
  // để listener có sẵn (switchTab, voice.toggle, startCalibration...) chạy
  if (target instanceof Element) {
    // Bấm ra ngoài dropdown → đóng panel đang mở (trừ khi bấm chính trigger/option của nó)
    if (!target.closest('.gaze-select-panel, .gaze-select-btn')) GazeSelect.closeOpen();
    target.click();
    return;
  }

  switch (state.currentTab) {
    case 'casio':
      if (target) {
        casioKeys.pressKey(target);
      }
      break;
    case 'hand':
      handModule.triggerEyeClick();
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

  // Handle physics 3D voice commands
  if (command.type === 'physics') {
    analytics.log({
      input: 'voice',
      action: command.action,
      target: command.raw,
      success: true,
    });
    return;
  }
  
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

// ============ VOICE HANDLER (STRICT FILTER) ============
function parseAllowedVoiceCommand(rawText) {
  if (!rawText) return null;
  const t = rawText.toLowerCase().trim().replace(/[.,?!]/g, '');

  // 1. Chuyển qua bàn tay 3D
  if (
    t.includes('chuyển qua bàn tay 3d') ||
    t.includes('chuyển sang bàn tay 3d') ||
    t.includes('chuyển qua bàn tay ba đê') ||
    t.includes('chuyển sang bàn tay ba đê') ||
    t.includes('bàn tay 3d') ||
    t.includes('bàn tay ba đê') ||
    t.includes('mở bàn tay 3d') ||
    t.includes('mở bàn tay ba đê') ||
    t === 'hãy mở bàn tay 3d'
  ) {
    return { type: 'switch_tab', target: 'hand', display: 'chuyển qua bàn tay 3D' };
  }

  // 2. Chuyển qua Casio ảo
  if (
    t.includes('chuyển qua casio ảo') ||
    t.includes('chuyển sang casio ảo') ||
    t.includes('chuyển qua casio') ||
    t.includes('chuyển sang casio') ||
    t.includes('casio ảo') ||
    t.includes('mở casio ảo') ||
    t === 'hãy mở casio ảo'
  ) {
    return { type: 'switch_tab', target: 'casio', display: 'chuyển qua Casio ảo' };
  }

  // 3. Chuyển sang hiệu chỉnh
  if (
    t.includes('chuyển sang hiệu chỉnh') ||
    t.includes('chuyển qua hiệu chỉnh') ||
    t.includes('hiệu chỉnh') ||
    t.includes('mở hiệu chỉnh')
  ) {
    return { type: 'switch_tab', target: 'calibration', display: 'chuyển sang hiệu chỉnh' };
  }

  // 4. Ở mục bàn tay 3D: Xoay bàn tay
  if (
    t.includes('xoay bàn tay') ||
    t.includes('xoay tay') ||
    t.includes('bật xoay') ||
    t.includes('tắt xoay') ||
    t.includes('tự động xoay')
  ) {
    return { type: 'hand_control', action: 'rotate', display: 'Xoay bàn tay' };
  }

  // 5. Ở mục bàn tay 3D: Reset camera / góc nhìn
  if (
    t.includes('reset camera') ||
    t.includes('reset góc nhìn') ||
    t.includes('đặt lại camera') ||
    t.includes('đặt lại góc nhìn') ||
    t.includes('quay về gốc') ||
    t.includes('về góc nhìn gốc') ||
    t.includes('về vị trí gốc') ||
    t === 'reset'
  ) {
    return { type: 'hand_control', action: 'reset_cam', display: 'Reset góc nhìn' };
  }

  // 6. Ở mục bàn tay 3D: Bật/tắt mũi tên Vectơ
  if (
    t.includes('mũi tên') ||
    t.includes('vectơ') ||
    t.includes('vecto') ||
    t.includes('bật vectơ') ||
    t.includes('tắt vectơ')
  ) {
    return { type: 'hand_control', action: 'toggle_arrows', display: 'Mũi tên Vectơ' };
  }

  return null;
}

voice.on('onResult', (command, raw) => {
  const match = parseAllowedVoiceCommand(raw);
  if (!match) {
    if (dom.voiceFeedback) dom.voiceFeedback.classList.remove('visible', 'listening');
    return;
  }

  // Hiển thị sub ở dưới
  if (dom.voiceFeedback) {
    dom.voiceFeedback.textContent = `🎤 "${match.display}"`;
    dom.voiceFeedback.classList.add('visible', 'listening');
    setTimeout(() => dom.voiceFeedback.classList.remove('listening'), 2500);
  }

  // Thực thi lệnh tương ứng
  if (match.type === 'switch_tab') {
    if (state.currentTab !== match.target) {
      switchTab(match.target);
    }
  } else if (match.type === 'hand_control') {
    if (state.currentTab === 'hand') {
      if (match.action === 'rotate') {
        handModule.toggleRot();
      } else if (match.action === 'reset_cam') {
        handModule.resetCam();
      } else if (match.action === 'toggle_arrows') {
        handModule.toggleArrows();
      }
    }
  }
});

voice.on('onInterim', (text) => {
  const match = parseAllowedVoiceCommand(text);
  if (match && dom.voiceFeedback) {
    dom.voiceFeedback.textContent = `🎤 ${match.display}`;
    dom.voiceFeedback.classList.add('visible');
  } else if (dom.voiceFeedback) {
    dom.voiceFeedback.classList.remove('visible');
  }
});

voice.on('onEnd', () => {
  if (dom.voiceFeedback) dom.voiceFeedback.classList.remove('visible', 'listening');
});

voice.on('onError', (err) => {
  if (dom.voiceStatus) dom.voiceStatus.classList.add('error');
  if (dom.voiceFeedback) {
    dom.voiceFeedback.textContent = `⚠️ Lỗi mic: ${err}`;
    dom.voiceFeedback.classList.add('visible');
  }
});

// ============ GAZE HIT-TEST NÚT UI CHUNG ============
// Học sinh không dùng tay phải chuyển tab / bật mic / hiệu chỉnh bằng mắt:
// elementFromPoint tại vị trí gaze → phần tử bấm được gần nhất (trừ #casio-app
// vì phím Casio đã đi đường casioKeys.pressKey riêng — tránh double-fire)
const UI_CLICK_SELECTOR = 'button, .method-card, [role="button"]';
let hoveredUIEl = null;

function hitTestUIElement(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const btn = el.closest(UI_CLICK_SELECTOR);
  if (!btn || btn.closest('#casio-app')) return null;
  if (btn.disabled || btn.hidden || btn.closest('[hidden]')) return null;
  return btn;
}

function updateUIHover(el) {
  if (hoveredUIEl === el) return;
  if (hoveredUIEl) hoveredUIEl.classList.remove('gaze-hover');
  hoveredUIEl = el;
  if (el) el.classList.add('gaze-hover');
}

// ============ TAB SWITCHING ============
// Pill trượt dọc trên rail: đo tab active rồi viết translateY/height lên
// .nav-tabs-pill để CSS transition tween giữa hai vị trí (transitions.dev tabs-sliding)
function moveNavPill(animate) {
  const pill = document.querySelector('.nav-tabs-pill');
  if (!pill) return;
  const active = [...dom.tabs].find(t => t.classList.contains('active')) || dom.tabs[0];
  if (!active || active.offsetHeight === 0) return; // app còn display:none → bỏ qua
  if (!animate) {
    // Snap không animation: tắt transition, viết vị trí, force reflow, restore —
    // tránh pill bay từ translateY(0)/height 0 ở lần đo đầu và khi resize
    const prev = pill.style.transition;
    pill.style.transition = 'none';
    pill.style.transform = `translateY(${active.offsetTop}px)`;
    pill.style.height = `${active.offsetHeight}px`;
    void pill.offsetWidth;
    pill.style.transition = prev;
  } else {
    pill.style.transform = `translateY(${active.offsetTop}px)`;
    pill.style.height = `${active.offsetHeight}px`;
  }
}

// ============ PIN PROTECTION FOR CALIBRATION ============
const CALIBRATION_PIN = '0709';
let isCalibrationUnlocked = false;
let currentPin = '';
let pinSuccessCallback = null;

function getPinElements() {
  return {
    modal: document.getElementById('pin-modal'),
    card: document.getElementById('pin-modal-card'),
    dots: document.querySelectorAll('#pin-dots .pin-dot'),
    errorMsg: document.getElementById('pin-error-msg'),
    hiddenInput: document.getElementById('pin-hidden-input'),
    btnClose: document.getElementById('btn-pin-close'),
    btnClear: document.getElementById('btn-pin-clear'),
    btnCancel: document.getElementById('btn-pin-cancel'),
    keypadBtns: document.querySelectorAll('.pin-key[data-digit]'),
  };
}

function updatePinDisplay(stateClass = null) {
  const { dots } = getPinElements();
  dots.forEach((dot, idx) => {
    dot.className = 'pin-dot';
    if (stateClass) {
      dot.classList.add(stateClass);
    } else if (idx < currentPin.length) {
      dot.classList.add('filled');
    }
  });
}

function openPinModal(onSuccess) {
  pinSuccessCallback = onSuccess;
  currentPin = '';
  const { modal, card, errorMsg, hiddenInput } = getPinElements();
  if (errorMsg) errorMsg.textContent = '';
  updatePinDisplay();
  if (modal) modal.style.display = 'flex';
  if (card) card.classList.remove('shake');
  if (hiddenInput) {
    hiddenInput.value = '';
    hiddenInput.focus();
  }
}

function closePinModal() {
  const { modal, errorMsg } = getPinElements();
  if (modal) modal.style.display = 'none';
  currentPin = '';
  if (errorMsg) errorMsg.textContent = '';
  updatePinDisplay();
  pinSuccessCallback = null;
}

function handlePinDigit(digit) {
  if (currentPin.length >= 4) return;
  currentPin += digit;
  const { errorMsg } = getPinElements();
  if (errorMsg) errorMsg.textContent = '';
  updatePinDisplay();

  if (currentPin.length === 4) {
    verifyPin();
  }
}

function handlePinBackspace() {
  if (currentPin.length > 0) {
    currentPin = currentPin.slice(0, -1);
    const { errorMsg } = getPinElements();
    if (errorMsg) errorMsg.textContent = '';
    updatePinDisplay();
  }
}

function verifyPin() {
  const { card, errorMsg } = getPinElements();
  if (currentPin === CALIBRATION_PIN) {
    updatePinDisplay('success');
    audio.playCalibrationSuccess && audio.playCalibrationSuccess();
    isCalibrationUnlocked = true;
    setTimeout(() => {
      closePinModal();
      if (pinSuccessCallback) {
        pinSuccessCallback();
      } else {
        switchTab('calibration');
      }
    }, 280);
  } else {
    updatePinDisplay('error');
    if (card) {
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
    }
    if (errorMsg) errorMsg.textContent = 'Mã PIN không đúng. Vui lòng thử lại!';
    audio.playError && audio.playError();
    setTimeout(() => {
      currentPin = '';
      updatePinDisplay();
    }, 550);
  }
}

// Initialize PIN keypad listeners
document.addEventListener('DOMContentLoaded', () => {
  initPinListeners();
});
setTimeout(() => initPinListeners(), 500);

function initPinListeners() {
  const { modal, btnClose, btnClear, btnCancel, keypadBtns, hiddenInput } = getPinElements();
  
  keypadBtns.forEach(btn => {
    if (!btn._hasPinListener) {
      btn._hasPinListener = true;
      btn.addEventListener('click', () => handlePinDigit(btn.dataset.digit));
    }
  });

  if (btnClear && !btnClear._hasPinListener) {
    btnClear._hasPinListener = true;
    btnClear.addEventListener('click', () => {
      currentPin = '';
      const { errorMsg } = getPinElements();
      if (errorMsg) errorMsg.textContent = '';
      updatePinDisplay();
    });
  }

  if (btnCancel && !btnCancel._hasPinListener) {
    btnCancel._hasPinListener = true;
    btnCancel.addEventListener('click', closePinModal);
  }

  if (btnClose && !btnClose._hasPinListener) {
    btnClose._hasPinListener = true;
    btnClose.addEventListener('click', closePinModal);
  }

  if (modal && !modal._hasPinListener) {
    modal._hasPinListener = true;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closePinModal();
    });
  }

  if (hiddenInput && !hiddenInput._hasPinListener) {
    hiddenInput._hasPinListener = true;
    hiddenInput.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
      currentPin = val;
      updatePinDisplay();
      if (currentPin.length === 4) verifyPin();
    });
  }
}

window.addEventListener('keydown', (e) => {
  const { modal } = getPinElements();
  if (!modal || modal.style.display === 'none') return;

  if (e.key >= '0' && e.key <= '9') {
    e.preventDefault();
    handlePinDigit(e.key);
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    handlePinBackspace();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closePinModal();
  }
});

function switchTab(tabId) {
  // Check PIN protection for calibration
  if (tabId === 'calibration' && !isCalibrationUnlocked) {
    openPinModal(() => switchTab('calibration'));
    return;
  }

  // Clear hand hover when leaving hand tab
  if (state.currentTab === 'hand' && tabId !== 'hand') {
    handModule.clearHover();
    GazeSelect.closeOpen(); // đóng dropdown đang mở để panel không rò rỉ sang tab khác
  }

  state.currentTab = tabId;
  
  dom.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  moveNavPill(true); // pill trượt tới tab vừa chọn
  dom.tabContents.forEach(t => t.classList.toggle('active', t.id === `tab-${tabId}`));
  
  const cursor = dom.gazeCursor;
  if (cursor) {
    if (tabId === 'casio') {
      const overlay = document.getElementById('gaze-overlay');
      if (overlay && cursor.parentElement !== overlay) {
        overlay.appendChild(cursor);
      }
    } else {
      const app = document.getElementById('app') || document.body;
      if (app && cursor.parentElement !== app) {
        app.appendChild(cursor);
      }
    }
  }
  
  // Lazy-init Hand Module on first switch
  if (tabId === 'hand' && !handModuleInited) {
    handModuleInited = true;
    const vp = document.getElementById('hand-viewport');
    const container = document.getElementById('tab-hand');
    setTimeout(() => {
      handModule.init(vp, container);
      setTimeout(() => handModule.handleResize(), 100);
    }, 50);
  }

  // Handle physics tab resize
  if (tabId === 'physics' && dom.physicsCanvas) {
    setTimeout(() => {
      const container = dom.physicsCanvas.parentElement;
      if (container) {
        physics.handleResize(container.clientWidth, container.clientHeight);
      }
    }, 100);
  }

  // Handle hand tab resize when re-entering
  if (tabId === 'hand' && handModuleInited) {
    setTimeout(() => handModule.handleResize(), 100);
  }
}

// ============ CALIBRATION ============
async function startCalibration() {
  const selectedMethodRadio = document.querySelector('input[name="cal-method"]:checked');
  const method = selectedMethodRadio ? selectedMethodRadio.value : 'grid9';

  // Switch to workspace view
  if (dom.calSetupCard) dom.calSetupCard.style.display = 'none';
  if (dom.calibrationResult) dom.calibrationResult.style.display = 'none';
  if (dom.calWorkspaceCard) dom.calWorkspaceCard.style.display = 'flex';

  if (dom.calProgressFill) dom.calProgressFill.style.transform = 'scaleX(0)';
  if (dom.calPhaseText) {
    dom.calPhaseText.textContent = method === 'grid9'
      ? 'Đang hiệu chỉnh lưới 9 điểm (Điểm 1/9)...'
      : 'Đang theo dõi bám đuổi chuyển động...';
  }
  if (dom.calSampleCount) dom.calSampleCount.textContent = '0 mẫu';

  audio.playClick();

  calibration.onProgress = (progress) => {
    if (progress.phase === 'point_done') {
      const pct = Math.round((progress.index / progress.total) * 100);
      if (dom.calProgressFill) dom.calProgressFill.style.transform = `scaleX(${pct / 100})`;
      if (dom.calPhaseText) {
        dom.calPhaseText.textContent = `Đang hiệu chỉnh lưới 9 điểm (Điểm ${Math.min(progress.index + 1, 9)}/9)...`;
      }
      audio.playClick();
    } else {
      if (dom.calSampleCount) dom.calSampleCount.textContent = `${progress.samples} mẫu`;
    }
  };

  calibration.onComplete = (result) => {
    if (dom.calWorkspaceCard) dom.calWorkspaceCard.style.display = 'none';
    if (dom.calibrationResult) dom.calibrationResult.style.display = 'flex';

    const accPct = Math.round(result.accuracy * 100);
    const stabPct = Math.round((result.stability || 0.85) * 100);

    if (dom.calMetricAcc) dom.calMetricAcc.textContent = `${accPct}%`;
    if (dom.calMetricStab) dom.calMetricStab.textContent = `${stabPct}%`;
    if (dom.calMetricMode) dom.calMetricMode.textContent = `Mode ${result.mode}`;
    if (dom.calMetricModeSub) {
      dom.calMetricModeSub.textContent = result.mode === 'B' ? 'Nháy mắt riêng' : result.mode === 'C' ? 'Nhìn dừng' : 'Chớp 2 mắt';
    }

    if (dom.calibrationMode) {
      dom.calibrationMode.textContent = `Phát hiện: Mode ${result.mode} (${result.mode === 'B' ? 'Nháy mắt trái/phải độc lập' : result.mode === 'C' ? 'Nhìn dừng 1.2s' : 'Chớp mắt bình thường'})`;
    }
    if (dom.calibrationStatus) {
      dom.calibrationStatus.textContent = `Độ chính xác: ${accPct}% | Độ ổn định: ${stabPct}% | Sẵn sàng điều khiển`;
    }
    if (dom.calModeDesc) {
      dom.calModeDesc.textContent = result.modeDescription || 'Hệ thống đã tính toán xong ma trận ánh xạ tọa độ.';
    }

    audio.playCalibrationDone();

    // Save profile to IndexedDB + sync lên Firestore theo user đăng nhập
    const calProfile = {
      id: 'default',
      mode: result.mode,
      accuracy: result.accuracy,
      stability: result.stability,
      gazeCalibrated: true,
      winkCapable: result.winkCapable,
      calibrationPoints: result.calibrationPoints,
      adaptiveState: adaptiveLearner.serialize(),
    };
    profileManager.save(calProfile);
  };

  const getGaze = () => state.gazePosition;

  calibration.start(
    dom.calibrationCanvas,
    getGaze,
    { method, gazeMapper, adaptiveLearner }
  );
}

function startLiveTest() {
  if (!calibration || !dom.calibrationCanvas) return;
  if (dom.calSetupCard) dom.calSetupCard.style.display = 'none';
  if (dom.calibrationResult) dom.calibrationResult.style.display = 'none';
  if (dom.calWorkspaceCard) dom.calWorkspaceCard.style.display = 'flex';
  if (dom.calPhaseText) dom.calPhaseText.textContent = '🧪 Chế độ thử nghiệm trực tiếp điểm nhìn';

  const getGaze = () => state.gazePosition;
  calibration.startLiveTest(dom.calibrationCanvas, getGaze);
}

function restartCalibration() {
  calibration.cancel();
  if (dom.calWorkspaceCard) dom.calWorkspaceCard.style.display = 'none';
  if (dom.calibrationResult) dom.calibrationResult.style.display = 'none';
  if (dom.calSetupCard) dom.calSetupCard.style.display = 'flex';
}

function cancelCalibration() {
  calibration.cancel();
  restartCalibration();
}

function skipCalibration() {
  if (dom.calSetupCard) dom.calSetupCard.style.display = 'none';
  if (dom.calWorkspaceCard) dom.calWorkspaceCard.style.display = 'none';
  if (dom.calibrationResult) dom.calibrationResult.style.display = 'flex';

  if (dom.calMetricAcc) dom.calMetricAcc.textContent = '65%';
  if (dom.calMetricStab) dom.calMetricStab.textContent = '70%';
  if (dom.calMetricMode) dom.calMetricMode.textContent = 'Mode A';
  if (dom.calMetricModeSub) dom.calMetricModeSub.textContent = 'Chớp 2 mắt';
  if (dom.calibrationMode) dom.calibrationMode.textContent = 'Phát hiện: Mode A (Mặc định)';
  if (dom.calibrationStatus) dom.calibrationStatus.textContent = 'Độ chính xác ước tính: 65% (Chưa hiệu chỉnh)';
  calibration.cancel();
}

function applyCalibration() {
  state.isCalibrated = true;
  if (dom.gazeStatus) {
    dom.gazeStatus.classList.add('active');
  }
  if (dom.calibrationResult) dom.calibrationResult.style.display = 'none';
  audio.playCalibrationDone();
  switchTab('casio');
}

// ============ PROFILE ============
async function loadProfile() {
  try {
    const profile = await profileManager.get('default');

    if (profile && profile.gazeCalibrated && profile.accuracy > 0) {
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
    if (dom.btnMicToggle) dom.btnMicToggle.classList.add('active', 'listening');
    if (dom.micIcon) dom.micIcon.textContent = '🎙️';
    if (dom.voiceStatus) dom.voiceStatus.classList.add('active');
  } else {
    if (dom.btnMicToggle) dom.btnMicToggle.classList.remove('active', 'listening');
    if (dom.micIcon) dom.micIcon.textContent = '🎤';
    if (dom.voiceStatus) dom.voiceStatus.classList.remove('active');
  }
}

// ============ CASIO CALCULATOR SCALING ============
function scaleCalculator() {
  const casioApp = document.getElementById('casio-app');
  const wrapper = document.querySelector('.calculator-wrapper');
  const tab = document.getElementById('tab-casio');
  if (!casioApp || !wrapper || !tab) return;

  const stage = document.querySelector('.casio-center-stage');
  const naturalW = 380;   // .calculator-wrapper width in px
  const naturalH = 785;   // actual full rendered height of fx-580VN X in px
  const stageW = stage && stage.clientWidth > 0 ? stage.clientWidth : 380;
  const availW = Math.max(naturalW, stageW);
  const availH = tab.clientHeight > 0 ? tab.clientHeight - 20 : window.innerHeight - 40;

  if (availW <= 0 || availH <= 0) return;

  const scale = Math.min(1, availH / naturalH, availW / naturalW);
  casioApp.style.transform = `scale(${scale})`;
}

// ============ AUTH UI INTEGRATION ============
function initAuthUI() {
  const modal = document.getElementById('auth-modal');
  const btnOpenLogin = document.getElementById('btn-open-login');
  const btnClose = document.getElementById('btn-auth-close');
  const btnSkip = document.getElementById('btn-auth-skip');
  const userProfile = document.getElementById('nav-user-profile');
  const userName = document.getElementById('nav-user-name');
  const userAvatar = document.getElementById('nav-user-avatar');
  const btnLogout = document.getElementById('btn-user-logout');

  const tabGroup = document.getElementById('auth-tab-group');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const formForgot = document.getElementById('form-forgot');
  const feedback = document.getElementById('auth-feedback');

  const linkForgot = document.getElementById('link-forgot-password');
  const linkBackToLogin = document.getElementById('link-back-to-login');
  const btnGoogle = document.getElementById('btn-google-login');

  if (!modal) return;

  function showFeedback(msg, type = 'error') {
    if (!feedback) return;
    feedback.textContent = msg;
    feedback.className = `auth-feedback-msg ${type}`;
  }

  function clearFeedback() {
    if (!feedback) return;
    feedback.textContent = '';
    feedback.className = 'auth-feedback-msg';
  }

  function openModal(initialTab = 'login') {
    clearFeedback();
    switchAuthTab(initialTab);
    modal.classList.add('active');
  }

  function closeModal() {
    modal.classList.remove('active');
    clearFeedback();
  }

  function switchAuthTab(tabName) {
    clearFeedback();
    const tabBtns = tabGroup ? tabGroup.querySelectorAll('.auth-tab-btn') : [];
    tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    if (tabGroup) {
      tabGroup.style.display = (tabName === 'forgot') ? 'none' : 'flex';
    }

    if (formLogin) formLogin.style.display = (tabName === 'login') ? 'flex' : 'none';
    if (formRegister) formRegister.style.display = (tabName === 'register') ? 'flex' : 'none';
    if (formForgot) formForgot.style.display = (tabName === 'forgot') ? 'flex' : 'none';

    const modalTitle = document.getElementById('auth-modal-title');
    const modalDesc = document.getElementById('auth-modal-desc');
    if (modalTitle && modalDesc) {
      if (tabName === 'login') {
        modalTitle.textContent = 'Đăng Nhập EyeAssist';
        modalDesc.textContent = 'Đăng nhập để đồng bộ dữ liệu học tập và hiệu chuẩn';
      } else if (tabName === 'register') {
        modalTitle.textContent = 'Tạo Tài Khoản Mới';
        modalDesc.textContent = 'Đăng ký nhanh chóng để lưu profile cá nhân hóa';
      } else if (tabName === 'forgot') {
        modalTitle.textContent = 'Khôi Phục Mật Khẩu';
        modalDesc.textContent = 'Nhập email để nhận liên kết đặt lại mật khẩu';
      }
    }
  }

  // Open / Close events
  if (btnOpenLogin) btnOpenLogin.addEventListener('click', () => openModal('login'));
  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnSkip) btnSkip.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Tab switcher
  if (tabGroup) {
    tabGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.auth-tab-btn');
      if (btn && btn.dataset.tab) {
        switchAuthTab(btn.dataset.tab);
      }
    });
  }

  if (linkForgot) linkForgot.addEventListener('click', () => switchAuthTab('forgot'));
  if (linkBackToLogin) linkBackToLogin.addEventListener('click', () => switchAuthTab('login'));

  // Form: Login
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFeedback();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const submitBtn = document.getElementById('btn-submit-login');

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang đăng nhập...';
      }

      const res = await loginWithEmail(email, password);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Đăng Nhập';
      }

      if (res.success) {
        showFeedback('Đăng nhập thành công!', 'success');
        setTimeout(() => closeModal(), 600);
      } else {
        showFeedback(res.error, 'error');
      }
    });
  }

  // Form: Register
  if (formRegister) {
    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFeedback();
      const name = document.getElementById('register-name').value;
      const email = document.getElementById('register-email').value;
      const password = document.getElementById('register-password').value;
      const submitBtn = document.getElementById('btn-submit-register');

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang tạo tài khoản...';
      }

      const res = await registerWithEmail(email, password, name);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Tạo Tài Khoản';
      }

      if (res.success) {
        showFeedback('Tạo tài khoản thành công!', 'success');
        setTimeout(() => closeModal(), 600);
      } else {
        showFeedback(res.error, 'error');
      }
    });
  }

  // Form: Forgot Password
  if (formForgot) {
    formForgot.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFeedback();
      const email = document.getElementById('forgot-email').value;
      const submitBtn = document.getElementById('btn-submit-forgot');

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang gửi yêu cầu...';
      }

      const res = await resetPassword(email);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Gửi Liên Kết Khôi Phục';
      }

      if (res.success) {
        showFeedback(res.message, 'success');
      } else {
        showFeedback(res.error, 'error');
      }
    });
  }

  // Google Login
  if (btnGoogle) {
    btnGoogle.addEventListener('click', async () => {
      clearFeedback();
      const res = await loginWithGoogle();
      if (res.success) {
        showFeedback('Đăng nhập Google thành công!', 'success');
        setTimeout(() => closeModal(), 600);
      } else if (res.code !== 'auth/popup-closed-by-user') {
        showFeedback(res.error, 'error');
      }
    });
  }

  // Logout
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await logoutUser();
    });
  }

  // Realtime Auth State Listener
  onAuthChange((user) => {
    if (user) {
      if (btnOpenLogin) btnOpenLogin.style.display = 'none';
      if (userProfile) userProfile.style.display = 'flex';

      const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Người dùng');
      if (userName) userName.textContent = displayName;

      if (userAvatar) {
        if (user.photoURL) {
          userAvatar.innerHTML = `<img src="${user.photoURL}" alt="${displayName}" />`;
        } else {
          userAvatar.innerHTML = `<span id="nav-user-initial">${displayName.charAt(0).toUpperCase()}</span>`;
        }
      }
    } else {
      if (btnOpenLogin) btnOpenLogin.style.display = 'flex';
      if (userProfile) userProfile.style.display = 'none';
    }
  });
}

// ============ UTILITIES ============
function updateLoading(pct, text) {
  if (dom.loadingFill) dom.loadingFill.style.transform = `scaleX(${Math.min(100, pct) / 100})`;
  if (text && dom.loadingStatus) dom.loadingStatus.textContent = text;
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

// Draw overlay on cam preview & calibration preview
function drawOverlay(landmarks) {
  if (!landmarks) return;

  if (dom.overlay) {
    const ctx = dom.overlay.getContext('2d');
    const W = 160, H = 120;
    ctx.clearRect(0, 0, W, H);
    
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

  // Draw real-time preview in calibration setup card if active
  if (state.currentTab === 'calibration' && dom.calGazePreview && dom.calSetupCard && dom.calSetupCard.style.display !== 'none') {
    const pCtx = dom.calGazePreview.getContext('2d');
    const pW = dom.calGazePreview.width || 200;
    const pH = dom.calGazePreview.height || 150;
    pCtx.clearRect(0, 0, pW, pH);

    pCtx.fillStyle = 'rgba(0, 212, 255, 0.2)';
    pCtx.strokeStyle = '#00d4ff';
    pCtx.lineWidth = 1.5;

    const eyeIndices = [33, 133, 159, 145, 158, 153, 362, 263, 385, 380, 386, 373];
    eyeIndices.forEach(idx => {
      const pt = landmarks[idx];
      if (pt) {
        pCtx.beginPath();
        pCtx.arc(pt.x * pW, pt.y * pH, 2.5, 0, Math.PI * 2);
        pCtx.fill();
      }
    });

    if (state.gazePosition) {
      pCtx.fillStyle = '#00e676';
      pCtx.beginPath();
      pCtx.arc(state.gazePosition.x * pW, state.gazePosition.y * pH, 4, 0, Math.PI * 2);
      pCtx.fill();
    }
  }
}

// ============ BLINK STATS UI ============
function updateBlinkStatsUI() {
  if (!dom.blinkStats) return;

  const s = blinkDetector.stats;
  const baseline = adaptiveLearner.getBaselineSummary();
  const ready = baseline.isReady ? '✓' : '⏳';

  dom.blinkStats.textContent =
    `Nháy: ${s.totalNatural} tự nhiên · ${s.totalIntentional} chủ đích · ${s.totalWinks} nháy 1 mắt` +
    ` | Baseline ${ready}${baseline.isReady ? ` (${baseline.naturalCount} mẫu)` : ` ${baseline.naturalCount}/${baseline.readyAfter} mẫu`}`;
}

// ============ ANALYTICS UPDATE LOOP ============
setInterval(() => {
  const metrics = analytics.getMetrics();
  if (dom.statSession) dom.statSession.textContent = metrics.sessionTime;
  if (dom.statClicks) dom.statClicks.textContent = metrics.totalClicks;
  if (dom.statAccuracy) dom.statAccuracy.textContent = `${metrics.avgAccuracy}%`;
  if (dom.statErrors) dom.statErrors.textContent = metrics.totalErrors;
}, 2000);

// ============ START ============
function bootstrap() {
  init();

  // Physics canvas resize on window resize
  window.addEventListener('resize', () => {
    if (state.currentTab === 'physics' && dom.physicsCanvas) {
      const container = dom.physicsCanvas.parentElement;
      if (container) {
        physics.handleResize(container.clientWidth, container.clientHeight);
      }
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
