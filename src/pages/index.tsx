import React from "react";
import CameraFeed from '~/components/CameraFeed';

const App = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-4xl">Welcome to Magic Vault!</h1>
      <div className="columns-3">
        <div className="container p-2 border-4 rounded-lg border-indigo-500/100">
          <CameraFeed />
        </div>
      </div>
    </div>
  );
};

export default App;

