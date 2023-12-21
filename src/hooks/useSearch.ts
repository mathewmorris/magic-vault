import { useState } from 'react';
import { api } from '~/utils/api';

const useSearch = () => {
  const [input, setInput] = useState('');
  const searchQuery = api.card.search.useQuery(
    input, 
    { 
      enabled: false, // This prevents the query from running on mount
    });


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      void searchQuery.refetch(); // Refetch the query with the updated input
    }
  };

  return {
    input,
    handleInputChange,
    handleKeyPress,
    ...searchQuery,
  };
};

export default useSearch;

