import React from "react";
import { api } from "~/utils/api";

const App = () => {
  const { data, error } = api.collection.getSecretMessage.useQuery();

  return (
      <div className="container mx-auto p-4 dark:bg-slate-800">
      <h1 className="text-4xl">Welcome to Magic Vault!</h1>
      {error ? (
          <p className="text-red-200">{error.message}</p>
          ) : (
            <p>{data ?? 'hold on a sec...'}</p>
            )
      } 
      </div>
      );
};

export default App;

