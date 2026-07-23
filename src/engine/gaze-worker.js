/**
 * gaze-worker.js — Web Worker for gaze processing pipeline
 *
 * Runs MediaPipe inference + EAR + BlinkDetect + GazeFilter
 * + AdaptiveLearner + GestureMatcher in a background thread.
 *
 * Communicates with main thread via postMessage.
 */

// Load all engine modules inside the worker
importScripts('/src/engine/EARCalculator.js');
importScripts('/src/engine/BlinkDetector.js');
importScripts('/src/engine/GazeFilter.js');
importScripts('/src/engine/GazeToScreen.js');
importScripts('/src/engine/AdaptiveLearner.js');
importScripts('/src/engine/GestureMatcher.js');

// Note: In actual Vite/bundler usage, we use ES module imports.
// This worker file serves as the conceptual architecture.
// The actual worker will be bundled by Vite with proper ES module imports.

// State
let earCalc, blinkDetector, gazeFilter, gazeMapper, adaptiveLearner, gestureMatcher;
let lastTimestamp = 0;
let fps = 0;
let frameCount = 0;
let fpsStartTime = 0;

self.onmessage = function(e) {
  const msg = e.data;

  switch (msg.type) {
    case 'init':
      _init(msg.config);
      break;
    case 'frame':
      _processFrame(msg.landmarks, msg.timestamp);
      break;
    case 'calibrate':
      _setCalibration(msg.points, msg.screenW, msg.screenH);
      break;
    case 'loadProfile':
      _loadProfile(msg.profile);
      break;
    case 'reset':
      _reset();
      break;
  }
};

function _init(config) {
  earCalc = new EARCalculator();
  blinkDetector = new BlinkDetector({
    earThreshold: config.earThreshold || 0.22,
    earClosedThreshold: config.earClosedThreshold || 0.18,
    naturalDurationMax: config.naturalDurationMax || 250,
    shortBlinkMax: config.shortBlinkMax || 700
  });
  gazeFilter = new GazeFilter();
  gazeMapper = new GazeToScreen();
  adaptiveLearner = new AdaptiveLearner();
  gestureMatcher = new GestureMatcher();

  // Wire blink detector callbacks
  blinkDetector.on('onBlink', (type, duration) => {
    self.postMessage({
      type: 'blink',
      subtype: type,
      duration,
      earLeft: blinkDetector._leftStart,
      earRight: blinkDetector._rightStart,
      asymmetry: blinkDetector._lastAsymmetry,
      timestamp: performance.now()
    });
  });

  blinkDetector.on('onIntentional', (blinkData) => {
    // Feed intentional blinks to adaptive learner (for k-means)
    adaptiveLearner.updateFromBlink(blinkData);
    self.postMessage({
      type: 'intentionalBlink',
      subtype: blinkData.type,
      duration: blinkData.duration,
      features: blinkData.features,
      timestamp: performance.now()
    });
  });

  blinkDetector.on('onNatural', (blinkData) => {
    // Feed natural blinks to adaptive learner
    adaptiveLearner.updateFromBlink(blinkData);
    self.postMessage({ type: 'naturalBlink', duration: blinkData.duration });
  });

  blinkDetector.on('onWink', (side, duration) => {
    self.postMessage({
      type: 'wink',
      side,
      duration,
      timestamp: performance.now()
    });
  });

  // Start FPS counter
  fpsStartTime = performance.now();

  self.postMessage({ type: 'ready' });
}

function _processFrame(landmarks, timestamp) {
  if (!landmarks || landmarks.length < 468) return;

  // FPS counter
  frameCount++;
  if (timestamp - fpsStartTime >= 1000) {
    fps = frameCount;
    frameCount = 0;
    fpsStartTime = timestamp;
    self.postMessage({ type: 'fps', fps });
  }

  // 1. Compute EAR
  const ear = EARCalculator.compute(landmarks);
  if (!ear || ear.average === 0) return;

  // 2. Compute gaze direction from iris landmarks
  const gazeRaw = GazeToScreen.computeGazeVector(landmarks, gazeMapper.flipX);

  // 3. Apply One Euro Filter
  const gazeFiltered = gazeFilter.filter(gazeRaw.x, gazeRaw.y, timestamp);

  // 4. Map gaze to screen coordinates
  gazeMapper.compensateHeadPose(landmarks);
  const screenPos = gazeMapper.map(gazeFiltered.x, gazeFiltered.y);

  // 5. Update blink detector
  blinkDetector.update(ear.left, ear.right, timestamp);

  // 6. Update gesture matcher
  gestureMatcher.addSample(screenPos.x, screenPos.y, timestamp);
  const gesture = gestureMatcher.match();

  // 7. Update adaptive learner (from open-ears)
  adaptiveLearner.updateFromOpenEar(ear.left, ear.right);

  // 8. Measure jitter and adapt filter
  const jitter = _measureJitter(gazeFiltered.x, gazeFiltered.y);
  adaptiveLearner.updateFromGaze(jitter);
  gazeFilter.tune(jitter);

  // 9. Dynamically threshold from learner
  blinkDetector.setThreshold(
    adaptiveLearner.getEARThreshold(),
    adaptiveLearner.getDurationThreshold()
  );

  // 10. Send result to main thread
  self.postMessage({
    type: 'gaze',
    screenX: screenPos.x,
    screenY: screenPos.y,
    earLeft: ear.left,
    earRight: ear.right,
    earAvg: ear.average,
    gazeRaw: gazeRaw,
    gazeFiltered: gazeFiltered,
    jitter: jitter,
    confidence: adaptiveLearner.confidence,
    threshold: adaptiveLearner.getEARThreshold(),
    timestamp: timestamp
  });

  // Gesture match (if found)
  if (gesture) {
    self.postMessage({
      type: 'gesture',
      gesture: gesture.gesture,
      score: gesture.score
    });
  }
}

// Rolling jitter measurement (last 5 samples variance)
const _jitterBuffer = [];
function _measureJitter(x, y) {
  _jitterBuffer.push({ x, y });
  if (_jitterBuffer.length > 5) _jitterBuffer.shift();
  if (_jitterBuffer.length < 2) return 0;

  let sumDx = 0, sumDy = 0;
  for (let i = 1; i < _jitterBuffer.length; i++) {
    sumDx += Math.abs(_jitterBuffer[i].x - _jitterBuffer[i-1].x);
    sumDy += Math.abs(_jitterBuffer[i].y - _jitterBuffer[i-1].y);
  }
  return (sumDx + sumDy) / (_jitterBuffer.length - 1) / 2;
}

function _setCalibration(points, screenW, screenH) {
  gazeMapper.setCalibration(points, screenW, screenH);
  const accuracy = gazeMapper.getAccuracy();
  self.postMessage({ type: 'calibrated', accuracy });
}

function _loadProfile(profile) {
  if (profile) adaptiveLearner.deserialize(profile);
}

function _reset() {
  gazeFilter.reset();
  gestureMatcher.reset();
  _jitterBuffer.length = 0;
}
