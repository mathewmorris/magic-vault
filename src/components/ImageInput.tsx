import React, { useState } from 'react';
import type { ChangeEvent } from 'react';
import { useCard } from './CameraFeed';
import Image from 'next/image';

const App: React.FC = () => {
  const { recognizeCard, text } = useCard();
  const [image, setImage] = useState<string | null>();
  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setImage(base64String);
      };
      reader.readAsDataURL(file);

      recognizeCard(file);
    }
  };

  return (
    <div>
      <input type="file" accept="image/*" onChange={handleImageUpload} />
      {text && <p>{text}</p>}
      {image && <Image src={image} alt="uploaded image" width={600} height={100} />}
    </div>
  );
};

export default App;

