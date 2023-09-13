import Reac from "react";
import { Tesseract } from "tesseract.ts";

const About: React.FC = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-4xl">About Magic Vault</h1>
      <p className="mt-4">
        Magic Vault is your go-to app for managing your Magic the Gathering card collection.
        Whether you're building decks, tracking card values, or playtesting strategies,
        Magic Vault has you covered! Love it!
      </p>
    </div>
  );
};

export default About;

