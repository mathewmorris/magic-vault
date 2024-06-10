import { useSession } from "next-auth/react";
import SearchBar from "~/components/SearchBar";

const App = () => {
  const { data: sessionData } = useSession();
  
  if (!sessionData) {
    return (
      <div className="container mx-auto grid justify-items-stretch">
        <h1 className="text-5xl flex-row justify-self-center py-4">Magic Vault</h1>
      </div>
    )
  }

  return (
      <div className="container mx-auto p-4">
        <div>
          <h2 className="text-xl">Look for a card</h2>
          <SearchBar />
      </div>
    </div>
  );
};

export default App;

