import React from "react";

import SupportLink from "~/components/SupportLink";
import { env } from "~/env";

export default function About() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-4xl">About Magic Vault</h1>
      <p>There is still a ton to do, but I&apos;m working on it all the time</p>
      <p>
        If you wanna follow along with the project,{" "}
        <a
          href="https://github.com/users/mathewmorris/projects/2?pane=info"
          className="font-bold"
        >
          checkout the project on github
        </a>
      </p>
      {env.NEXT_PUBLIC_DONATION_URL && (
        <p className="mt-4">
          Want to help keep it running?{" "}
          <SupportLink
            href={env.NEXT_PUBLIC_DONATION_URL}
            className="font-bold"
          />
        </p>
      )}
    </div>
  );
}
