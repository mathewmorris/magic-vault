import React from "react";
import { Tesseract } from 'tesseract.ts';

const App = () => {
  Tesseract.recognize(
  'https://tesseract.projectnaptha.com/img/eng_bw.png',
  'eng'
).progress(console.log).then((res: any) => {
  console.log(res);
})

  return (
      <div className="container mx-auto p-4">
        <h1 className="text-4xl">Welcome to Magic Vault!</h1>
      </div>
  );
};

export default App
;
