import React, {useState}  from "react";
import { Tesseract } from 'tesseract.ts';
import CameraFeed from '~/components/CameraFeed';

function useCaptureFrame (video: HTMLVideoElement) {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    canvas
        .getContext("2d")
        .drawImage(video, 0, 0, canvas.width, canvas.height);
    
    return canvas.toDataURL("image/png");
}

const App = () => {
const [text, setText] = useState("...reading text...");

(async () => {
const worker = await Tesseract.create({
  language: 'en',
});
  const data = await worker.recognize('https://tesseract.projectnaptha.com/img/eng_bw.png');
  setText(data.text);
  await worker.terminate();
})();
return (
      <div className="container mx-auto p-4">
        <h1 className="text-4xl">Welcome to Magic Vault!</h1>
        <div className="columns-3">
            <div className="container p-2 border-4 rounded-lg border-indigo-500/100">
                <CameraFeed />
            </div>
            <p>{text}</p>
        </div>
      </div>
  );
};

export default App;

