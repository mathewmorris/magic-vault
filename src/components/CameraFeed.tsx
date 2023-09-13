import React, { useRef, useEffect } from "react";

const CameraFeed = () => {
  const videoRef = useRef(null);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        let video = videoRef.current;
        video.srcObject = stream;
        return new Promise((resolve) => (video.onloadedmetadata = resolve));
      })
      .then(() => {
        // video dimensions are known at this point
      });
  }, []);

  return <video ref={videoRef} autoPlay />;
};

export default CameraFeed;

