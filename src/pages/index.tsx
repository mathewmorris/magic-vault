import SearchBar from "~/components/SearchBar";

const App = () => {
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

