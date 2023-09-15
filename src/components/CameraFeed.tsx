import Image from "next/image";
import React, { useEffect, useRef, useCallback, useState } from "react";

export default function CameraFeed() {
  const webcamRef = useRef<HTMLVideoElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const capture = useCallback(() => {
    if (!webcamRef.current) {
      console.error("webcamRef is not defined");
      return;
    };

    const canvas = document.createElement("canvas");
    canvas.width = webcamRef.current.videoWidth;
    canvas.height = webcamRef.current.videoHeight;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      console.error("ctx is not defined");
      return;
    }

    ctx.drawImage(webcamRef.current, 0, 0);

    const imageSrc =  canvas.toDataURL("image/webp", 0.92);

    if (imageSrc) {
      setCapturedImage(imageSrc);
    }
  }, [webcamRef]);

  useEffect(() => {
    const video = document.getElementById('video') as HTMLVideoElement | null;
    navigator.mediaDevices.getUserMedia({ video: true })
      .then((stream) => {
        if (!video) return;

        video.srcObject = stream;
        video.play()
          .catch((err) => console.error(err));
      })
      .catch((err) => console.error(err));
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code === "Space") {
      capture();
    }
  }, [capture]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <div>
      <h4>Press spacebar to capture image</h4>
      <video id="video" ref={webcamRef} width="640" height="480" autoPlay />
      {capturedImage && (
        <Image src={capturedImage} width="640" height="480" alt="captured" />
      )}
    </div>
  )
}
