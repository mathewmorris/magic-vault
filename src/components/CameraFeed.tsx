import React, { useEffect, useRef, useCallback, useState } from "react";
import Image from "next/image";
import Tesseract from 'tesseract.js';
import processor from './processor';

export const useCard = () => {
  const [text, setText] = useState<string>();
    const recognizeCard = useCallback((image: Tesseract.ImageLike) => {
      Tesseract.recognize(
          image,
          'eng',
          ).then((data) => {
              setText(data.text);
            });
    }, []);
    
    return { recognizeCard, text };
}
  
export default function CameraFeed() {
  const webcamRef = useRef<HTMLVideoElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const { text, recognizeCard } = useCard();

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
      recognizeCard(imageSrc);
    }
  }, [webcamRef, recognizeCard]);

  useEffect(() => {
    const video = document.getElementById('video') as HTMLVideoElement | null;
    navigator.mediaDevices.getUserMedia({ video: true })
      .then((stream) => {
        if (!video) return;

        video.srcObject = stream;
        video.play()
          .then(() => {
            processor.doLoad();
          })
          .catch((err) => console.error(err));
      })
      .catch((err) => console.error(err));
  }, []);

  return (
    <div>
      <button type="button" className="bg-violet-800 hover:bg-violet-600 text-white font-bold py-2 px-4 rounded-full" onClick={capture}>Capture</button>
      <canvas id="canvas" width="640" height="480"></canvas>
      <video className="hidden" id="video" ref={webcamRef} width="640" height="480" autoPlay />
      {text && <p>{text}</p>}
      {capturedImage && (
        <Image src={capturedImage} width="640" height="480" alt="captured" />
      )}
    </div>
  )
}
