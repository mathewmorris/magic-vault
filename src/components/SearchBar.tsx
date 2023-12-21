import useSearch from "~/hooks/useSearch";

export default function SearchBar() {
  const { input, handleInputChange, handleKeyPress, data: searchResults, isError, isFetching } = useSearch();

  return (
    <>
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
    </>
  );
};

