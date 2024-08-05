import { useSession } from "next-auth/react";
import SearchBar from "~/components/SearchBar";
import { api } from '~/utils/api';

const admins = [
  'clzeo3i7q003dgeb0yeqowtrf'
]

const App = () => {
  const { data: sessionData } = useSession();
  const stream = api.migration.runStreamMigration.useQuery("", {enabled: false});
  const bulk = api.migration.runSimpleMigration.useQuery("", {enabled: false});
  
  if (!sessionData) {
    return (
      <div className="container mx-auto grid justify-items-stretch">
        <h1 className="text-5xl flex-row justify-self-center py-4">Magic Vault</h1>
      </div>
    )
  }
  
  if (admins.includes(sessionData.user.id)) {
    return (
      <div className="container mx-auto p-4">
        <div>
          <h2 className="text-xl">Refresh Database</h2>
          <button onClick={() => {void stream.refetch()}}>Download latest data to db</button>
          <br/>
          <button onClick={() => {void bulk.refetch()}}>Import downloaded data to Cards table</button>
        </div>
      </div>
    );
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

