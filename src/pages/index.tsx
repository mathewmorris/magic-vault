import React from "react";
import CameraFeed from '~/components/CameraFeed';
import ImageInput from '~/components/ImageInput';

const App = () => {
  return (
    <div className="container mx-auto p-4 dark:bg-slate-800">
      <h1 className="text-4xl">Welcome to Magic Vault!</h1>
      <ImageInput />
      <CameraFeed />
    </div>
  );
};

export default App;

