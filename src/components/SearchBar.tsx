import Image from "next/image";
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
      <div className="flex gap-5 flex-wrap">
        {searchResults && (searchResults.length == 0 ? <p>No results</p> : (
          searchResults.map((card) =>  {
            const images = card.image_uris as { small: string } | null;

            return (
            <div key={card.id}>
              <p>{card.name}</p>
                {images?.small && <Image src={images.small} width={146} height={204} alt={card.name} />}
            </div>
          )})
        ))}
      </div>
    </>
  );
};

