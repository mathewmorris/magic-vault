import { useSession } from "next-auth/react";
import Link from "next/link";

const App = () => {
  const { data: sessionData } = useSession();

  return (
    <div className="container mx-auto grid justify-items-stretch">
      <h1 className="text-5xl flex-row justify-self-center py-4">Magic Vault</h1>
      {sessionData && (
        <div>
          <Link href="/collections">Your Collections</Link>
        </div>
      )}
    </div>
  )

};

export default App;

