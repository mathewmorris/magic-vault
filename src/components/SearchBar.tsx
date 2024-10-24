import Image from "next/image";
import { useState } from "react";
import { api } from "~/utils/api";

export default function SearchBar() {
  const [input, setInput] = useState('');

  const {
    data: searchResults,
    isFetching,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch: search,
  } = api.card.search.useInfiniteQuery(
    {
      name: input,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled: false,
    }
  )

  return (
    <>
      <input
        type="text"
        className="text-black"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            void search()
          }
        }}
      />
      {isError && <div className="text-red-500">We got a problem boss...</div>}
      {isFetching && <div>Searching for cards with names that contain &apos;{input}&apos;...</div>}
      <div className="grid grid-cols-5 gap-4">
        {searchResults?.pages?.map((page) => {
          return page.items.map(card => {
            const images = card.image_uris as { small: string } | null;

            return (
              <div key={card.id}>
                <div
                  className="grid justify-center"
                >
                  {images?.small && <Image src={images.small} width={146} height={204} alt={card.name} className="m-2 rounded-lg" />}
                </div>
              </div>
            )
          })
        })}
        {hasNextPage && (<button onClick={() => void fetchNextPage()}>Next Page</button>)}
        {isFetchingNextPage && <div>Fetching next page...</div>}
      </div>
    </>
  );
};

