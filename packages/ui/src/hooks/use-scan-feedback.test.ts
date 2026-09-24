import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useScanFeedback } from "./use-scan-feedback.js";

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "AudioContext");
  Reflect.deleteProperty(navigator, "vibrate");
});

describe("useScanFeedback", () => {
  it("never throws when neither AudioContext nor navigator.vibrate exist", () => {
    const { result } = renderHook(() => useScanFeedback());
    expect(() => {
      result.current.playSuccess();
    }).not.toThrow();
    expect(() => {
      result.current.playError();
    }).not.toThrow();
  });

  it("plays a tone and vibrates once on success when both APIs exist", () => {
    const start = vi.fn();
    const stop = vi.fn();
    const connect = vi.fn();
    const oscillator = {
      type: "sine",
      frequency: { value: 0 },
      connect,
      start,
      stop,
    };
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect,
    };
    const createOscillator = vi.fn(() => oscillator);
    const createGain = vi.fn(() => gain);
    class FakeAudioContext {
      currentTime = 0;
      state = "running";
      destination = {};
      createOscillator = createOscillator;
      createGain = createGain;
      resume = vi.fn();
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });

    const { result } = renderHook(() => useScanFeedback());
    result.current.playSuccess();

    expect(createOscillator).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(40);
  });

  it("plays two tones and a double vibration on error", () => {
    const createOscillator = vi.fn(() => ({
      type: "sine",
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }));
    class FakeAudioContext {
      currentTime = 0;
      state = "running";
      destination = {};
      createOscillator = createOscillator;
      createGain = vi.fn(() => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      }));
      resume = vi.fn();
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });

    const { result } = renderHook(() => useScanFeedback());
    result.current.playError();

    expect(createOscillator).toHaveBeenCalledTimes(2);
    expect(vibrate).toHaveBeenCalledWith([40, 60, 40]);
  });
});
