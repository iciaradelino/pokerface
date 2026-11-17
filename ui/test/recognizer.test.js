import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MODEL_URL,
  WASM_URL,
  createFrameReader,
  handsFromResult,
  loadGestureRecognizer,
  resetGestureRecognizer,
} from '../gestures/recognizer.js';
import { hand, mediapipeResult } from './gestureHands.js';

const mediapipe = vi.hoisted(() => ({
  forVisionTasks: vi.fn(async (url) => ({ url })),
  createFromOptions: vi.fn(),
}));

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: mediapipe.forVisionTasks },
  GestureRecognizer: { createFromOptions: mediapipe.createFromOptions },
}));

afterEach(() => {
  resetGestureRecognizer();
  vi.clearAllMocks();
});

describe('gesture recognizer', () => {
  it('turns MediaPipe results into hands', () => {
    const thumb = hand('Thumb_Up', { score: 0.8 });
    expect(handsFromResult(mediapipeResult([thumb]))).toEqual([thumb]);
    expect(handsFromResult({ landmarks: [thumb.landmarks], gestures: [] })).toEqual([
      { landmarks: thumb.landmarks, gesture: 'None', score: 0 },
    ]);
    expect(handsFromResult(undefined)).toEqual([]);
  });

  it('loads the model once, on the GPU, for video', async () => {
    const recognizer = { recognizeForVideo: vi.fn() };
    mediapipe.createFromOptions.mockResolvedValue(recognizer);

    const [first, second] = await Promise.all([loadGestureRecognizer(), loadGestureRecognizer()]);
    expect(first).toBe(recognizer);
    expect(second).toBe(recognizer);
    expect(mediapipe.forVisionTasks).toHaveBeenCalledTimes(1);
    expect(mediapipe.forVisionTasks).toHaveBeenCalledWith(WASM_URL);
    expect(mediapipe.createFromOptions).toHaveBeenCalledWith(
      { url: WASM_URL },
      {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 1,
      },
    );
  });

  it('falls back to the CPU when the GPU does not work', async () => {
    const recognizer = { recognizeForVideo: vi.fn() };
    mediapipe.createFromOptions
      .mockRejectedValueOnce(new Error('No WebGL2'))
      .mockResolvedValueOnce(recognizer);

    expect(await loadGestureRecognizer()).toBe(recognizer);
    expect(mediapipe.createFromOptions.mock.calls[1][1].baseOptions.delegate).toBe('CPU');
  });

  it('can try again after the model failed to load', async () => {
    mediapipe.forVisionTasks.mockRejectedValueOnce(new Error('offline'));
    await expect(loadGestureRecognizer()).rejects.toThrow('offline');

    const recognizer = { recognizeForVideo: vi.fn() };
    mediapipe.createFromOptions.mockResolvedValue(recognizer);
    await vi.waitFor(async () => expect(await loadGestureRecognizer()).toBe(recognizer));
  });

  it('reads each new video frame once, with timestamps that always go up', () => {
    const thumb = hand('Thumb_Up');
    const recognizer = { recognizeForVideo: vi.fn(() => mediapipeResult([thumb])) };
    const video = { readyState: 1, currentTime: 0 };
    const reader = createFrameReader(recognizer, video);

    expect(reader.recognize(10)).toBeNull(); // not playing yet
    video.readyState = 4;
    video.currentTime = 0.04;
    expect(reader.recognize(20)).toEqual([thumb]);
    expect(reader.recognize(30)).toBeNull(); // same frame
    video.currentTime = 0.08;
    expect(reader.recognize(20)).toEqual([thumb]); // clock went back
    expect(recognizer.recognizeForVideo.mock.calls.map(([, stamp]) => stamp)).toEqual([20, 21]);
  });
});
