import useSearch from "~/hooks/useSearch";

const App = () => {
  const { input, handleInputChange, handleKeyPress, data: searchResults, isError, isFetching } = useSearch();

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-4xl">Welcome to Magic Vault!</h1>
      <input 
        type="text" 
        className="text-black"
        value={input}
        onChange={handleInputChange}
        onKeyDown={handleKeyPress}
      />
      {isError && <p className="text-red-500">We have an issue boss.</p>}
      {isFetching && <p>Searching...</p>}
      {searchResults && (searchResults.length == 0 ? <p>No results</p> : (
        searchResults.map((card) => (
          <p key={card.id}>{card.name}</p>
        ))
      ))}
    </div>
  );
};

export default App;

