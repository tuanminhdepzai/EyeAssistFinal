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
import VoiceMathController from './modules/VoiceMathController.js';

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

// ============ GLOBAL STATE ============
const state = {
  webcam: null,
  faceMesh: null,
  isRunning: false,
  gazePosition: { x: 0.5, y: 0.5 },
  currentTab: 'casio',
  isCalibrated: false,
  gazeWorker: null,
  gazeCursorEnabled: true,
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
const voiceMath = new VoiceMathController(voice);

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

function isInside3DViewportCanvas(cx, cy) {
  if (state.currentTab !== 'hand') return false;
  const vp = document.getElementById('hand-viewport');
  if (!vp) return false;
  const rect = vp.getBoundingClientRect();
  if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
    const el = document.elementFromPoint(cx, cy);
    if (el) {
      if (el.closest('.hand-guide-panel') || el.closest('.hand-tools') || el.closest('button') || el.closest('.step-card') || el.closest('#hand-sidebar')) {
        return false;
      }
    }
    return true;
  }
  return false;
}

// ============ 3-SECOND EYE CLOSURE TOGGLE FOR GAZE CURSOR ============
let _eyesClosedStartTime = 0;
let _eyesLastClosedTime = 0;
let _eyesClosedTriggered = false;
let _eyesSec1Beeped = false;
let _eyesSec2Beeped = false;

function setGazeCursorEnabled(enabled) {
  state.gazeCursorEnabled = enabled;

  const cursor = dom.gazeCursor;
  if (cursor) {
    if (!enabled) {
      cursor.classList.remove('visible');
      cursor.style.display = 'none';
    } else {
      cursor.style.display = '';
    }
  }

  if (!enabled) {
    if (typeof casioKeys !== 'undefined' && casioKeys) casioKeys.setGazeHover(null);
    if (typeof updateUIHover === 'function') updateUIHover(null);
    if (typeof handModule !== 'undefined' && handModule && handModule.updateGazeHover) {
      handModule.updateGazeHover(-1000, -1000, performance.now());
    }
    fusion.lastGazeTarget = null;
    if (blinkProgress && blinkProgress.isActive) {
      blinkProgress.cancel('cursor_disabled');
    }
    if (audio.playCursorOff) audio.playCursorOff();
    if (dom.voiceFeedback) {
      dom.voiceFeedback.textContent = '👁️ Đã tạm tắt con trỏ chuột (nhắm mắt 3 giây để bật lại)';
      dom.voiceFeedback.classList.add('visible');
      setTimeout(() => dom.voiceFeedback?.classList.remove('visible'), 3200);
    }
  } else {
    if (audio.playCursorOn) audio.playCursorOn();
    if (dom.voiceFeedback) {
      dom.voiceFeedback.textContent = '👁️ Đã bật lại con trỏ chuột màu hổ phách';
      dom.voiceFeedback.classList.add('visible');
      setTimeout(() => dom.voiceFeedback?.classList.remove('visible'), 2500);
    }
  }

  if (dom.gazeStatus) {
    const val = dom.gazeStatus.querySelector('.status-val');
    if (val) {
      val.textContent = enabled ? 'Đang theo' : 'Đã tắt';
    }
    if (!enabled) {
      dom.gazeStatus.classList.remove('active');
    } else {
      dom.gazeStatus.classList.add('active');
    }
  }
}

function toggleGazeCursor() {
  setGazeCursorEnabled(!state.gazeCursorEnabled);
}
window.toggleGazeCursor = toggleGazeCursor;

function check3SecondEyeClosure(isClosed, now) {
  if (state.currentTab === 'calibration') return; // Không can thiệp khi đang hiệu chỉnh

  if (isClosed) {
    _eyesLastClosedTime = now;
    if (!_eyesClosedStartTime) {
      _eyesClosedStartTime = now;
      _eyesClosedTriggered = false;
      _eyesSec1Beeped = false;
      _eyesSec2Beeped = false;
    }

    const duration = now - _eyesClosedStartTime;

    // Âm tick báo tiến trình ở giây 1 và giây 2 để người dùng biết hệ thống đang đếm
    if (duration >= 1000 && !_eyesSec1Beeped) {
      _eyesSec1Beeped = true;
      if (audio.playTick) audio.playTick();
    }
    if (duration >= 2000 && !_eyesSec2Beeped) {
      _eyesSec2Beeped = true;
      if (audio.playTick) audio.playTick();
    }

    // Đạt đủ 3 giây liên tục → đảo trạng thái con trỏ
    if (duration >= 3000 && !_eyesClosedTriggered) {
      _eyesClosedTriggered = true;
      toggleGazeCursor();
    }
  } else {
    // Chỉ reset khi mắt mở lại liên tục hơn 200ms (tránh gián đoạn vì giật frame)
    if (now - _eyesLastClosedTime > 200) {
      _eyesClosedStartTime = 0;
      _eyesClosedTriggered = false;
      _eyesSec1Beeped = false;
      _eyesSec2Beeped = false;
    }
  }
}

blinkDetector.on('onCloseFrame', ({ closedMs }) => {
  if (!state.gazeCursorEnabled || dwellLocked || blinkHandledThisCycle) return;
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

    if (isInside3DViewportCanvas(cx, cy)) {
      return; // Bỏ qua nháy mắt chọn khi đang tương tác xoay 3D viewport
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
let _sensorsStarted = false;

async function startSensors() {
  if (_sensorsStarted) return;
  _sensorsStarted = true;

  try {
    // 1. Khởi động webcam (yêu cầu quyền Camera)
    await initWebcam();

    // 2. Bắt đầu vòng lặp theo dõi ánh mắt
    startGazeLoop();

    // 3. Bắt đầu nhận diện giọng nói (yêu cầu quyền Micro)
    voice.start();
  } catch (err) {
    console.warn('Sensors start error:', err);
  }
}

async function init() {
  try {
    updateLoading(20, 'Đang tải MediaPipe...');
    await initMediaPipe();
    
    updateLoading(50, 'Đang khởi tạo modules...');
    initModules();
    
    updateLoading(80, 'Đang tải profile...');
    await loadProfile();
    
    updateLoading(100, 'Hoàn tất...');
    
    // Show the app & start sensors
    setTimeout(() => {
      if (dom.loading) dom.loading.classList.add('hidden');
      if (dom.app) dom.app.style.display = 'grid';
      moveNavPill(false); // snap pill vào tab active ngay khi app hiện
      scaleCalculator();
      startSensors();
    }, 400);
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
        return `/mediapipe/face_mesh/${file}`;
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
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });
    } catch (primaryErr) {
      console.warn('Constrained webcam request failed, trying simple video request...', primaryErr.message);
      // Fallback: try default video stream without resolution/facingMode constraints
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    
    if (dom.webcam) {
      dom.webcam.srcObject = stream;
      await dom.webcam.play();
    }
    if (dom.camStatus) dom.camStatus.classList.add('active');
  } catch (e) {
    console.warn('Webcam access error:', e.name, e.message);
    if (dom.camStatus) dom.camStatus.classList.add('error');

    let userMsg = 'Lỗi webcam!';
    if (e.name === 'NotFoundError' || e.message.includes('device not found')) {
      userMsg = 'Không tìm thấy Webcam trên máy tính này. Vui lòng cắm webcam hoặc bật camera trong Windows Settings.';
    } else if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
      userMsg = 'Quyền truy cập Webcam bị từ chối. Vui lòng bật quyền camera trong trình duyệt.';
    } else if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
      userMsg = 'Webcam đang bị ứng dụng khác (Zoom, Teams, OBS...) chiếm dụng. Vui lòng đóng ứng dụng đó.';
    }

    if (dom.loadingStatus) dom.loadingStatus.textContent = userMsg;
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

  // Auto-scale Zero-Scroll 100vh viewport lock
  updateAppScale();
  window.addEventListener('resize', updateAppScale);

  // Scale Casio calculator to fill viewport
  scaleCalculator();
  window.addEventListener('resize', scaleCalculator);
  
  // Debug: press F to toggle flipX (mirror mode)
  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))) return;
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
  
  // 5a. Kiểm tra nhắm mắt 3 giây liên tục → Bật/Tắt con trỏ chuột màu vàng hổ phách
  const isEyesClosed = (blinkDetector.state === 'CLOSING' || blinkDetector.state === 'CLOSED') ||
                       (ear.average < (blinkDetector.earThreshold ?? 0.22));
  check3SecondEyeClosure(isEyesClosed, now);

  // 5b. FREEZE gaze during blink — eyes closing/closed = iris landmarks unreliable
  //     Prevents cursor jumping to random position when user blinks to click
  if (blinkDetector.state !== 'OPEN') {
    if (state.gazeCursorEnabled) {
      // Keep last good gaze position, don't update cursor or snap
      const frozen = gazeToViewport(lastGoodGaze.x, lastGoodGaze.y);
      updateGazeCursor(frozen.x, frozen.y);
      // Phase 3: gaze bị đóng băng → không tính là "rời mục tiêu"
      blinkProgress.updateGaze(frozen.x, frozen.y);
    } else if (dom.gazeCursor) {
      dom.gazeCursor.classList.remove('visible');
      dom.gazeCursor.style.display = 'none';
    }
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
  
  if (state.gazeCursorEnabled) {
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
  } else {
    // Khi con trỏ chuột tắt: dọn dẹp toàn bộ hover và ẩn con trỏ
    if (casioKeys) casioKeys.setGazeHover(null);
    if (handModule && handModule.updateGazeHover) handModule.updateGazeHover(-1000, -1000, now);
    updateUIHover(null);
    fusion.lastGazeTarget = null;
    if (dom.gazeCursor) {
      dom.gazeCursor.classList.remove('visible');
      dom.gazeCursor.style.display = 'none';
    }
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
    if (!state.gazeCursorEnabled) {
      if (dom.gazeCursor) {
        dom.gazeCursor.classList.remove('visible');
        dom.gazeCursor.style.display = 'none';
      }
      return;
    }

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
    if (!state.gazeCursorEnabled) return;
    if (e.target.closest('#casio-app')) return; // Nút Casio đã tự xử lý sự kiện riêng
    if (isInside3DViewportCanvas(e.clientX, e.clientY)) return;
    blinkProgress.start(e.clientX, e.clientY, {
      subtype: 'short',
      duration: 300,
      confidence: 0.9
    }, { target: fusion.lastGazeTarget });
  });
  
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!state.gazeCursorEnabled) return;
    if (isInside3DViewportCanvas(e.clientX, e.clientY)) return;
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

  if (!state.gazeCursorEnabled) {
    cursor.classList.remove('visible');
    cursor.style.display = 'none';
    return;
  }
  cursor.style.display = '';

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
  if (!state.gazeCursorEnabled) return;
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

  if (isInside3DViewportCanvas(cx, cy)) {
    return;
  }

  blinkProgress.start(cx, cy, blinkData, {
    target: fusion.lastGazeTarget,
    confirmMs: 250
  });
});

blinkDetector.on('onWink', (side, duration) => {
  if (!state.gazeCursorEnabled) return;
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

  if (isInside3DViewportCanvas(cx, cy)) {
    return;
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
  const t = rawText.toLowerCase().trim().replace(/[.,?!;:…""''`]/g, ' ').replace(/\s+/g, ' ');
  const words = t.split(' ').filter(Boolean);

  // Khẩu lệnh điều khiển hệ thống luôn ngắn gọn (1 đến 5 từ)
  if (words.length === 0 || words.length > 5) return null;

  // Lọc bỏ câu đàm thoại hoặc chứa từ không liên quan
  if (
    t.includes('không phải') ||
    t.includes('phải không') ||
    t.includes('chẳng phải') ||
    t.includes('chả phải') ||
    t.includes('tôi') ||
    t.includes('bạn') ||
    t.includes('nước') ||
    t.includes('cơm') ||
    t.includes('chào') ||
    t.includes('thế nào') ||
    t.includes('làm sao')
  ) {
    return null;
  }

  // 1. Reset góc nhìn camera
  if (
    t === 'reset' ||
    t === 'reset camera' ||
    t === 'reset góc nhìn' ||
    t === 'đặt lại góc nhìn' ||
    t === 'đặt lại camera' ||
    t === 'về gốc' ||
    t === 'về vị trí gốc' ||
    t === 'góc nhìn gốc'
  ) {
    return { type: 'hand_control', action: 'reset_cam', display: 'Reset góc nhìn' };
  }

  // 2. Dừng / Tắt xoay mô hình
  if (
    t === 'dừng xoay' ||
    t === 'tắt xoay' ||
    t === 'ngừng xoay' ||
    t === 'thôi xoay' ||
    t === 'dừng quay' ||
    t === 'tắt quay' ||
    t === 'dừng xoay bàn tay'
  ) {
    return { type: 'hand_control', action: 'stop_rotate', display: 'Dừng xoay bàn tay' };
  }

  // 3. Lệnh Bật / Toggle Xoay 3D
  if (
    t === 'xoay' ||
    t === 'xoay bàn tay' ||
    t === 'quay bàn tay' ||
    t === 'quay mô hình' ||
    t === 'xoay mô hình' ||
    t === 'bật xoay' ||
    t === 'tự động xoay' ||
    t === 'xoay 3d' ||
    t === 'xoay ba đê'
  ) {
    return { type: 'hand_control', action: 'rotate', display: 'Xoay bàn tay' };
  }

  // 4. Bật/tắt Mũi tên Vectơ
  if (
    t === 'mũi tên' ||
    t === 'mũi tên vectơ' ||
    t === 'mũi tên vector' ||
    t === 'mũi tên 3d' ||
    t === 'vectơ' ||
    t === 'vecto' ||
    t === 'vector' ||
    t === 'bật vectơ' ||
    t === 'tắt vectơ' ||
    t === 'bật mũi tên' ||
    t === 'tắt mũi tên'
  ) {
    return { type: 'hand_control', action: 'toggle_arrows', display: 'Mũi tên Vectơ' };
  }

  // 5. Chuyển Tab / Chuyển Tầng
  // 5.1 Tab Casio
  if (
    t === 'casio' ||
    t === 'ca si ô' ||
    t === 'ca sio' ||
    t === 'ca xi ô' ||
    t === 'mở casio' ||
    t === 'mở máy tính' ||
    t === 'máy tính ảo' ||
    t === 'chuyển casio' ||
    t === 'chuyển sang casio' ||
    t === 'chuyển qua casio' ||
    t === 'chuyển máy tính' ||
    t === 'tab casio' ||
    t === 'tầng casio'
  ) {
    return { type: 'switch_tab', target: 'casio', display: 'chuyển qua Casio ảo' };
  }

  // 5.2 Tab Bàn tay 3D
  if (
    t === 'bàn tay' ||
    t === 'bàn tay 3d' ||
    t === 'bàn tay ba đê' ||
    t === 'mở bàn tay' ||
    t === 'mở bàn tay 3d' ||
    t === 'chuyển bàn tay' ||
    t === 'chuyển qua bàn tay' ||
    t === 'chuyển sang bàn tay' ||
    t === 'sang bàn tay' ||
    t === 'qua bàn tay' ||
    t === 'mở tay 3d' ||
    t === 'mở tay ba đê' ||
    t === 'tab bàn tay' ||
    t === 'tầng bàn tay' ||
    t === 'tầng 3d'
  ) {
    return { type: 'switch_tab', target: 'hand', display: 'chuyển qua bàn tay 3D' };
  }

  // 5.3 Tab Hiệu chỉnh
  if (
    t === 'hiệu chỉnh' ||
    t === 'cân chỉnh' ||
    t === 'calib' ||
    t === 'mở hiệu chỉnh' ||
    t === 'chuyển sang hiệu chỉnh' ||
    t === 'chuyển qua hiệu chỉnh' ||
    t === 'tab hiệu chỉnh' ||
    t === 'tầng hiệu chỉnh'
  ) {
    return { type: 'switch_tab', target: 'calibration', display: 'chuyển sang hiệu chỉnh' };
  }

  return null;
}

// ============ VOICE GRID CASIO (tích hợp vào VoiceHandler đã có) ============
// Trục toạ độ (row, col), gốc (0,0) = phím SHIFT
const VOICE_GRID = [
  ['SHIFT', 'ALPHA', 'MENU', 'ON'],
  ['OPTN', 'CALC', 'INTEGRAL', 'X_VAR'],
  ['FRAC', 'SQRT', 'SQUARE', 'POWER', 'LOG_BASE', 'LN'],
  ['NEGATION', 'DEGREE', 'INVERSE', 'SIN', 'COS', 'TAN'],
  ['STO', 'ENG', 'LPAREN', 'RPAREN', 'SD', 'MPLUS'],
  ['7', '8', '9', 'DEL', 'AC'],
  ['4', '5', '6', 'MULTIPLY', 'DIVIDE'],
  ['1', '2', '3', 'PLUS', 'MINUS'],
  ['0', 'DOT', 'EXP', 'ANS', 'EQUALS'],
];

const vgState = { row: 0, col: 0 };
let _vgExecutedTokensCount = 0;
let _vgLastInterimText = '';
let _vgCommandQueue = [];
let _vgQueueTimer = null;
let _vgLastActionTime = 0;
const VG_STEP_INTERVAL = 130; // ms giữa các bước khi chạy queue (mượt, tức thì)

/** Tìm button DOM theo data-key trong #casio-app */
function vgFindBtn(key) {
  return key ? document.querySelector(`#casio-app [data-key="${CSS.escape(key)}"]`) : null;
}

/** Cập nhật viền vàng cho phím hiện tại */
let _vgFocused = null;
function vgUpdateCursor() {
  if (_vgFocused) { _vgFocused.classList.remove('voice-focus'); _vgFocused = null; }
  const key = VOICE_GRID[vgState.row]?.[vgState.col];
  const btn = vgFindBtn(key);
  if (!btn) return;
  btn.classList.add('voice-focus');
  btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  _vgFocused = btn;
}

/** Flash cam khi nhấn OK */
function vgFlash(key) {
  const btn = vgFindBtn(key);
  if (!btn) return;
  btn.classList.add('voice-active');
  setTimeout(() => btn.classList.remove('voice-active'), 280);
}

// Bảng từ vựng Voice Grid hợp lệ (chỉ các từ liên quan đến điều hướng hoặc phím)
const VG_VOCABULARY = new Set([
  'lên', 'len',
  'xuống', 'xuong', 'suống', 'suong', 'xuồng', 'xuổng',
  'trái', 'trai', 'chái',
  'phải', 'phai',
  'ok', 'oke', 'okay', 'ô', 'kê', 'đồng', 'ý', 'chọn', 'bấm', 'ấn', 'nhập', 'enter',
  'đi', 'sang', 'qua', 'bên', 'về', 'rẽ', 'trên', 'dưới', 'hướng', 'nhích', 'kéo',
  'một', 'hai', 'ba', 'bốn', 'năm', 'bước', 'lần', 'ô', 'nấc', 'phím'
]);

/**
 * Trích xuất các khẩu lệnh đơn từ text (nhận diện linh hoạt tiếng Việt):
 * Nhận diện: 'up', 'down', 'left', 'right', 'ok'
 * Bỏ qua ngay lập tức mọi câu nói chứa từ không liên quan.
 */
function vgExtractTokens(text) {
  if (!text) return [];
  const raw = text.toLowerCase().trim();

  // 1. Chặn ngay các cụm từ đàm thoại hoặc phủ định thường gặp
  if (
    raw.includes('không phải') ||
    raw.includes('phải không') ||
    raw.includes('chẳng phải') ||
    raw.includes('chả phải') ||
    raw.includes('phải chăng') ||
    raw.includes('có nên') ||
    raw.includes('cho nên')
  ) {
    return [];
  }

  const t = raw.replace(/[.,!?;:(){}\[\]"'`]/g, ' ');
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  // 2. Kiểm tra nghiêm ngặt: mọi từ phải nằm trong danh mục Voice Grid
  for (const w of words) {
    if (!VG_VOCABULARY.has(w)) {
      // Có từ không liên quan -> Từ chối để không gây nhảy phím Casio bậy
      return [];
    }
  }

  const tokens = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const nextW = words[i + 1] || '';

    // Cụm 2 từ: "ô kê", "đồng ý", "qua trái", "sang trái", "qua phải", "sang phải", "đi lên", "đi xuống", "lên trên", "xuống dưới"
    if ((w === 'ô' && nextW === 'kê') || (w === 'đồng' && nextW === 'ý')) {
      tokens.push('ok');
      i++;
      continue;
    }
    if ((w === 'qua' || w === 'sang' || w === 'bên' || w === 'về' || w === 'rẽ') && (nextW === 'trái' || nextW === 'trai')) {
      tokens.push('left');
      i++;
      continue;
    }
    if ((w === 'qua' || w === 'sang' || w === 'bên' || w === 'về' || w === 'rẽ') && (nextW === 'phải' || nextW === 'phai')) {
      tokens.push('right');
      i++;
      continue;
    }
    if ((w === 'đi' || w === 'hướng' || w === 'nhích' || w === 'kéo') && (nextW === 'lên' || nextW === 'len')) {
      tokens.push('up');
      i++;
      continue;
    }
    if ((w === 'đi' || w === 'hướng' || w === 'nhích' || w === 'kéo') && (nextW === 'xuống' || nextW === 'xuong' || nextW === 'suống')) {
      tokens.push('down');
      i++;
      continue;
    }

    // Từ đơn: 1. Lên (chỉ chấp nhận lên / len)
    if (w === 'lên' || w === 'len') {
      tokens.push('up');
      continue;
    }

    // 2. Xuống (loại bỏ hoàn toàn 'uống')
    if (
      w === 'xuống' || w === 'xuong' ||
      w === 'suống' || w === 'suong' ||
      w === 'xuồng' || w === 'xuổng' || w === 'chuống'
    ) {
      tokens.push('down');
      continue;
    }

    // 3. Trái
    if (w === 'trái' || w === 'trai' || w === 'chái') {
      tokens.push('left');
      continue;
    }

    // 4. Phải
    if (w === 'phải' || w === 'phai') {
      tokens.push('right');
      continue;
    }

    // 5. OK / Chọn / Bấm / Ấn (loại bỏ hoàn toàn standalone 'kê')
    if (
      w === 'ok' || w === 'oke' || w === 'okay' ||
      w === 'chọn' || w === 'bấm' || w === 'ấn' ||
      w === 'nhập' || w === 'enter'
    ) {
      tokens.push('ok');
      continue;
    }
  }
  return tokens;
}

let _vgFeedbackTimer = null;
let _vgResetTimer = null;
const VG_RESET_DELAY = 360; // ms sau khi dứt lệnh để giải phóng buffer Google STT ngay tức thì

/** Tự động ẩn phản hồi trên giao diện, không bị giữ text cũ */
function vgHideFeedback() {
  if (!dom.voiceFeedback) return;
  dom.voiceFeedback.classList.remove('listening');
  clearTimeout(_vgFeedbackTimer);
  _vgFeedbackTimer = setTimeout(() => {
    if (Date.now() - _vgLastActionTime >= 400) {
      dom.voiceFeedback?.classList.remove('visible');
    }
  }, 250);
}

/** Lên lịch reset phiên mic để đọc lệnh kế tiếp ngay lập tức mà không phải chờ 2-3s */
function vgScheduleQuickReset() {
  clearTimeout(_vgResetTimer);
  _vgResetTimer = setTimeout(() => {
    vgHideFeedback();
    _vgExecutedTokensCount = 0;
    _vgLastInterimText = '';
    if (voice && voice.isListening) {
      voice.quickReset();
    }
  }, VG_RESET_DELAY);
}

/**
 * Thực thi một lệnh duy nhất (di chuyển 1 ô hoặc bấm OK)
 */
function vgExecuteToken(token) {
  const maxRow = VOICE_GRID.length - 1;
  if (token === 'up') {
    vgState.row = Math.max(0, vgState.row - 1);
  } else if (token === 'down') {
    vgState.row = Math.min(maxRow, vgState.row + 1);
  } else if (token === 'left') {
    vgState.col = Math.max(0, vgState.col - 1);
  } else if (token === 'right') {
    const colMax = (VOICE_GRID[vgState.row]?.length ?? 1) - 1;
    vgState.col = Math.min(colMax, vgState.col + 1);
  } else if (token === 'ok') {
    const key = VOICE_GRID[vgState.row]?.[vgState.col];
    if (key && window.handleKey) {
      vgFlash(key);
      window.handleKey(key);
      window.saveState && window.saveState();
      if (dom.voiceFeedback) {
        dom.voiceFeedback.textContent = `🎤 "OK → Phím [${key}]"`;
        dom.voiceFeedback.classList.add('visible', 'listening');
        vgHideFeedback();
      }
    }
    return;
  }

  // Giới hạn cột trong phạm vi của hàng
  vgState.col = Math.min(vgState.col, (VOICE_GRID[vgState.row]?.length ?? 1) - 1);
  vgUpdateCursor();

  const key = VOICE_GRID[vgState.row]?.[vgState.col] ?? '?';
  const dirNames = { up: 'Lên', down: 'Xuống', left: 'Trái', right: 'Phải' };
  if (dom.voiceFeedback) {
    dom.voiceFeedback.textContent = `🎤 "${dirNames[token] || token} → [${key}] (${vgState.row},${vgState.col})"`;
    dom.voiceFeedback.classList.add('visible', 'listening');
    vgHideFeedback();
  }
}

/**
 * Xử lý hàng đợi lệnh mượt mà (FIFO Queue)
 * Giúp không bao giờ nuốt lệnh khi người dùng nói nhanh hoặc ASR trả về nhiều từ
 */
function vgProcessQueue() {
  if (_vgCommandQueue.length === 0) {
    _vgQueueTimer = null;
    vgScheduleQuickReset();
    return;
  }

  const now = Date.now();
  const elapsed = now - _vgLastActionTime;
  if (elapsed < VG_STEP_INTERVAL) {
    if (!_vgQueueTimer) {
      _vgQueueTimer = setTimeout(() => {
        _vgQueueTimer = null;
        vgProcessQueue();
      }, VG_STEP_INTERVAL - elapsed);
    }
    return;
  }

  const nextToken = _vgCommandQueue.shift();
  _vgLastActionTime = now;
  vgExecuteToken(nextToken);

  if (_vgCommandQueue.length > 0) {
    _vgQueueTimer = setTimeout(() => {
      _vgQueueTimer = null;
      vgProcessQueue();
    }, VG_STEP_INTERVAL);
  } else {
    _vgQueueTimer = null;
    vgScheduleQuickReset();
  }
}

/**
 * Xử lý giọng nói tức thì (cả interim lẫn final)
 */
function vgProcess(text, isFinal = false) {
  if (!text || state.currentTab !== 'casio') return false;

  const tokens = vgExtractTokens(text);
  if (tokens.length === 0) return false;

  // Hủy hẹn giờ reset vì đang có âm thanh lệnh mới tới
  clearTimeout(_vgResetTimer);

  // Nếu text câu mới bắt đầu hoặc ngắn hơn đáng kể so với câu trước
  if (text.length < _vgLastInterimText.length * 0.5 || tokens.length < _vgExecutedTokensCount) {
    _vgExecutedTokensCount = 0;
  }
  _vgLastInterimText = text;

  // Đưa tất cả các token mới phát hiện vào hàng đợi
  while (_vgExecutedTokensCount < tokens.length) {
    const tokenToQueue = tokens[_vgExecutedTokensCount];
    _vgExecutedTokensCount++;
    _vgCommandQueue.push(tokenToQueue);
  }

  // Khởi động chạy queue nếu đang rảnh
  vgProcessQueue();

  // Reset đếm khi kết thúc câu (isFinal) để sẵn sàng cho câu tiếp theo
  if (isFinal) {
    _vgExecutedTokensCount = 0;
    _vgLastInterimText = '';
    vgScheduleQuickReset();
  }

  return true;
}

// CSS cho voice-focus và voice-active (inject vào <head> tránh sửa file)
(function injectVoiceGridCSS() {
  if (document.getElementById('voice-grid-style')) return;
  const s = document.createElement('style');
  s.id = 'voice-grid-style';
  s.textContent = `
    #casio-app [data-key].voice-focus {
      outline: 3px solid #f5cf6b !important;
      outline-offset: 3px;
      box-shadow: 0 0 16px rgba(245,207,107,.75);
      z-index: 3;
      transition: outline .1s, box-shadow .1s;
    }
    #casio-app [data-key].voice-active {
      background: #e8955f !important;
      color: #fff !important;
      transform: scale(.95);
      transition: background .05s, transform .05s;
    }
  `;
  document.head.appendChild(s);
})();

// Khởi tạo viền vàng tại SHIFT sau khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => vgUpdateCursor(), { once: true });
if (document.readyState !== 'loading') setTimeout(vgUpdateCursor, 600);

// ── MIC WATCHDOG: tự khởi động lại nếu mic bị ngắt ──
setInterval(() => {
  if (voice && !voice.isListening && voice._shouldRestart) {
    voice.start();
  }
}, 2000); // kiểm tra mỗi 2 giây thay vì 18 giây


let _lastVoiceCmdKey = '';
let _lastVoiceCmdTime = 0;
let _voiceCmdResetTimer = null;

function executeVoiceCommand(match) {
  if (!match) return;

  const now = Date.now();
  const cmdKey = `${match.type}:${match.target || match.action}`;

  // Cooldown ngắn (350ms thay vì 1200ms) để chống gọi lặp trong cùng 1 phát âm
  if (cmdKey === _lastVoiceCmdKey && (now - _lastVoiceCmdTime) < 350) {
    return;
  }

  _lastVoiceCmdKey = cmdKey;
  _lastVoiceCmdTime = now;

  // Hiển thị feedback UI lập tức và tự ẩn nhanh sau 500ms (không bị treo 2.2s)
  if (dom.voiceFeedback) {
    dom.voiceFeedback.textContent = `🎤 "${match.display}"`;
    dom.voiceFeedback.classList.add('visible', 'listening');
    clearTimeout(dom._feedbackTimer);
    dom._feedbackTimer = setTimeout(() => {
      dom.voiceFeedback?.classList.remove('listening');
      setTimeout(() => dom.voiceFeedback?.classList.remove('visible'), 250);
    }, 500);
  }

  // Thực thi lệnh ngay tức thì (Instant Execution < 150ms)
  if (match.type === 'switch_tab') {
    if (state.currentTab !== match.target) {
      switchTab(match.target);
    }
  } else if (match.type === 'hand_control') {
    if (state.currentTab !== 'hand') {
      switchTab('hand');
    }
    setTimeout(() => {
      if (match.action === 'rotate') {
        handModule.toggleRot();
      } else if (match.action === 'stop_rotate') {
        handModule.toggleRot(false);
      } else if (match.action === 'reset_cam') {
        handModule.resetCam();
      } else if (match.action === 'toggle_arrows') {
        handModule.toggleArrows();
      }
    }, 50);
  }

  // Lên lịch reset session mic sau 400ms để người dùng đọc tiếp lệnh mới tức thì
  clearTimeout(_voiceCmdResetTimer);
  _voiceCmdResetTimer = setTimeout(() => {
    _lastVoiceCmdKey = '';
    if (voice && voice.isListening) {
      voice.quickReset();
    }
  }, 400);
}

voice.on('onResult', (command, raw) => {
  // Voice Grid: xử lý với isFinal = true (nếu đã chạy từ interim thì chỉ reset đếm)
  if (state.currentTab === 'casio' && vgProcess(raw, true)) return;

  const match = parseAllowedVoiceCommand(raw);
  if (match) {
    executeVoiceCommand(match);
  } else if (dom.voiceFeedback) {
    dom.voiceFeedback.classList.remove('visible', 'listening');
  }
});

voice.on('onInterim', (text) => {
  // Voice Grid: thực thi tức thì ngay trên interim để đạt tốc độ phản hồi cực nhanh (<150ms)
  if (state.currentTab === 'casio' && vgProcess(text, false)) return;

  const match = parseAllowedVoiceCommand(text);
  if (match && dom.voiceFeedback) {
    dom.voiceFeedback.textContent = `🎤 "${match.display}..."`;
    dom.voiceFeedback.classList.add('visible', 'listening');
  } else if (!match && dom.voiceFeedback) {
    // Không phải khẩu lệnh sẵn: Tuyệt đối không hiển thị lên giao diện
    dom.voiceFeedback.classList.remove('visible', 'listening');
  }
});

voice.on('onEnd', () => {
  _vgExecutedTokensCount = 0;
  _vgLastInterimText = '';
  clearTimeout(_vgResetTimer);
  if (dom.voiceFeedback) {
    dom.voiceFeedback.classList.remove('listening');
    setTimeout(() => {
      if (Date.now() - _vgLastActionTime >= 400) {
        dom.voiceFeedback?.classList.remove('visible');
      }
    }, 200);
  }
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
      scaleCalculator();
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

// ============ ZERO-SCROLL VIEWPORT SCALE ============
/**
 * Tự động tính hệ số thu phóng đồng tỉ lệ cho toàn bộ khung nhìn
 * scale = Math.min(window.innerWidth / 1366, window.innerHeight / 768)
 * và gắn vào biến CSS --app-scale để container chính co nhỏ vừa khít màn hình nhỏ.
 */
function updateAppScale() {
  const scale = Math.min(window.innerWidth / 1366, window.innerHeight / 768);
  // Tự co nhỏ vừa khít màn hình khi gặp máy nhỏ (< 1366x768), giữ 1 trên màn hình lớn Full HD/4K
  const safeScale = scale < 1 ? Math.max(0.35, scale) : 1;
  document.documentElement.style.setProperty('--app-scale', safeScale.toFixed(4));
}

// ============ CASIO CALCULATOR SCALING ============
function scaleCalculator() {
  const casioApp = document.getElementById('casio-app');
  const wrapper = document.querySelector('.calculator-wrapper');
  const tab = document.getElementById('tab-casio');
  if (!casioApp || !wrapper || !tab) return;

  const stage = document.querySelector('.casio-center-stage');
  const naturalW = wrapper.offsetWidth || 380;
  const naturalH = wrapper.offsetHeight || 720;
  const stageW = stage && stage.clientWidth > 0 ? stage.clientWidth : 380;
  const availW = Math.max(naturalW, stageW);
  const availH = tab.clientHeight > 0 ? tab.clientHeight - 16 : window.innerHeight - 30;

  if (availW <= 0 || availH <= 0) return;

  const scale = Math.min(1, availH / naturalH, availW / naturalW);
  casioApp.style.transform = `scale(${scale.toFixed(4)})`;
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
  dom.blinkStats.style.display = 'none';
  dom.blinkStats.textContent = '';
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
