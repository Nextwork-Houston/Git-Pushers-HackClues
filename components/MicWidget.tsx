"use client";

import { useRef, useCallback, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { Mic, MicOff, AlertCircle } from "lucide-react";

export default function MicWidget() {
  const {
    micActive,
    setMicActive,
    micVolume,
    setMicVolume,
    micError,
    setMicError,
  } = useAppStore();

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);

  const stopMic = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setMicActive(false);
    setMicVolume(0);
  }, [setMicActive, setMicVolume]);

  const startMic = useCallback(async () => {
    try {
      setMicError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const readVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg =
          dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setMicVolume(avg / 255); // 0–1
        animFrameRef.current = requestAnimationFrame(readVolume);
      };

      readVolume();
      setMicActive(true);
    } catch (err: any) {
      const msg =
        err.name === "NotAllowedError"
          ? "Microphone access denied. Please allow mic permissions."
          : err.name === "NotFoundError"
          ? "No microphone found."
          : "Could not access microphone.";
      setMicError(msg);
    }
  }, [setMicActive, setMicVolume, setMicError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  const toggle = () => {
    if (micActive) {
      stopMic();
    } else {
      startMic();
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Volume ring */}
      <div className="relative w-10 h-10 flex items-center justify-center">
        {/* Background ring */}
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 40 40">
          <circle
            cx="20" cy="20" r="17"
            fill="none"
            stroke="#23232f"
            strokeWidth="2.5"
          />
        </svg>
        {/* Volume ring */}
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 40 40">
          <circle
            cx="20" cy="20" r="17"
            fill="none"
            stroke="url(#volGrad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${micVolume * 107} 107`}
            className={`transition-all duration-100 ${micActive ? "opacity-100" : "opacity-0"}`}
          />
          <defs>
            <linearGradient id="volGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7c5cfc" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
        </svg>

        {/* Button */}
        <button
          onClick={toggle}
          className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
            micActive
              ? "bg-accent text-white animate-pulse-ring"
              : micError
              ? "bg-danger/20 text-danger"
              : "bg-bg-surface text-text-secondary hover:bg-accent/20 hover:text-accent"
          }`}
          title={micActive ? "Mute microphone" : "Unmute microphone"}
        >
          {micError ? (
            <AlertCircle size={14} />
          ) : micActive ? (
            <Mic size={14} />
          ) : (
            <MicOff size={14} />
          )}
        </button>
      </div>

      {/* Error message */}
      {micError && (
        <span className="text-[11px] text-danger max-w-[180px] leading-tight">
          {micError}
        </span>
      )}
    </div>
  );
}