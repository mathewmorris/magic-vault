import type { Card } from "@prisma/client";
import Image from "next/image";
import { useState } from "react";
import useSearch from "~/hooks/useSearch";

export default function SearchBar() {
  const { input, handleInputChange, handleKeyPress, data: searchResults, isError, isFetching } = useSearch();
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);

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
      <div className="grid grid-cols-5 gap-4">
        {searchResults && (searchResults.length == 0 ? <p>No results</p> : (
          searchResults.map((card) =>  {
            const images = card.image_uris as { small: string } | null;

            return (
            <div 
              className="grid justify-center"
              key={card.id}
            >
                {images?.small && <Image src={images.small} width={146} height={204} alt={card.name} className="m-2 rounded-lg" />}
                <button
                className='rounded-lg bg-blue-500 hover:bg_blue-400 py-2 px-4'
                  onClick={() => {
                    const isCardAlreadySelected = selectedCards.includes(card);
                    if (isCardAlreadySelected) {
                      setSelectedCards(prev => prev.filter(selected => {
                        return selected.id != card.id;
                        }));
                    } else {
                      setSelectedCards(prev => [...prev, card]);
                    }
                  }} 
                  >Add/Remove
                  </button>
            </div>
          )})
        ))}
      </div>
    </>
  );
};

