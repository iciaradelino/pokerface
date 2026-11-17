// MediaPipe Gesture Recognizer, running in the browser. Only the action it leads to is sent to
// the server; the video never leaves the device.
//
// The JavaScript comes from the pinned npm package and is loaded only when gestures are switched
// on. The WebAssembly files and the model are large, so the browser fetches them on first use.
// MEDIAPIPE_VERSION must match @mediapipe/tasks-vision in package.json.
export const MEDIAPIPE_VERSION = '0.10.14';
export const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
export const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

/** MediaPipe's result → [{ landmarks, gesture, score }], the shape detector.js reads. */
export function handsFromResult(result) {
  return (result?.landmarks ?? []).map((landmarks, i) => ({
    landmarks,
    gesture: result.gestures?.[i]?.[0]?.categoryName ?? 'None',
    score: result.gestures?.[i]?.[0]?.score ?? 0,
  }));
}

let loading = null;

/**
 * Loads the model once per page; the tutorial and the table share it.
 * Uses the GPU when it can and falls back to the CPU (some laptops have no WebGL2).
 */
export function loadGestureRecognizer() {
  loading ??= (async () => {
    const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numHands: 1, // every gesture is one hand; tracking one keeps it on the same hand
    });
    try {
      return await GestureRecognizer.createFromOptions(fileset, options('GPU'));
    } catch {
      return GestureRecognizer.createFromOptions(fileset, options('CPU'));
    }
  })();
  // A failed load (offline, blocked CDN) can be tried again.
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/**
 * Reads hands from a playing <video>. recognize(now) returns the hands in the newest frame, or
 * null when there is no new frame yet (the page redraws faster than the camera).
 */
export function createFrameReader(recognizer, video) {
  let lastTime = -1;
  let lastStamp = 0;
  return {
    recognize(now) {
      if (video.readyState < 2 || video.currentTime === lastTime) return null;
      lastTime = video.currentTime;
      // MediaPipe needs timestamps that always go up.
      lastStamp = Math.max(now, lastStamp + 1);
      return handsFromResult(recognizer.recognizeForVideo(video, lastStamp));
    },
  };
}

/** Only for tests: forget the loaded model. */
export function resetGestureRecognizer() {
  loading = null;
}
