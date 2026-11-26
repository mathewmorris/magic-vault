"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "./Button";

interface CameraFeedProps {
  /** Called with a full-resolution snapshot of the current frame. */
  onCapture: (frame: HTMLCanvasElement) => void;
  /** Called if the camera can't start (permission denied, no camera, etc). */
  onError?: (error: unknown) => void;
  /** Called once the stream is playing, with the frame size in pixels. */
  onReady?: (size: { width: number; height: number }) => void;
  /** Drawn on top of the live video, e.g. a framing guide. */
  overlay?: React.ReactNode;
  disabled?: boolean;
  captureLabel?: string;
  /**
   * Called once the stream is playing with a function that snapshots the
   * current frame (a new canvas each call, or null if there's no frame yet),
   * and with null when the feed goes away. For callers that look at frames
   * continuously, e.g. live card detection.
   */
  onFrameSource?: (grab: (() => HTMLCanvasElement | null) | null) => void;
}

/**
 * Live camera preview with a capture button. Prefers the rear camera on
 * phones and stops the stream when it unmounts.
 */
export default function CameraFeed({
  onCapture,
  onError,
  onReady,
  overlay,
  disabled = false,
  captureLabel = "Capture",
  onFrameSource,
}: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  // Keep the latest error callback without restarting the camera when it changes.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    // mediaDevices is missing on insecure origins (plain http that isn't localhost).
    if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
      const error = new Error("Camera API is not available");
      error.name = "NotSupportedError";
      onErrorRef.current?.(error);
      return;
    }

    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then(async (mediaStream) => {
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = mediaStream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = mediaStream;
        await video.play();
      })
      .catch((error: unknown) => {
        if (!cancelled) onErrorRef.current?.(error);
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setReady(true);
    onReady?.({ width: video.videoWidth, height: video.videoHeight });
  }, [onReady]);

  const grabFrame = useCallback((): HTMLCanvasElement | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);
    return canvas;
  }, []);

  const capture = useCallback(() => {
    const canvas = grabFrame();
    if (canvas) onCapture(canvas);
  }, [grabFrame, onCapture]);

  // Hand out the frame grabber once frames exist, and take it back on unmount.
  const onFrameSourceRef = useRef(onFrameSource);
  useEffect(() => {
    onFrameSourceRef.current = onFrameSource;
  }, [onFrameSource]);
  useEffect(() => {
    if (!ready) return;
    onFrameSourceRef.current?.(grabFrame);
    return () => onFrameSourceRef.current?.(null);
  }, [ready, grabFrame]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-xl overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          className="block h-auto w-full"
          onLoadedMetadata={handleLoadedMetadata}
          autoPlay
          muted
          playsInline
        />
        {ready && overlay}
      </div>
      <Button type="button" onClick={capture} disabled={disabled || !ready}>
        {captureLabel}
      </Button>
    </div>
  );
}
