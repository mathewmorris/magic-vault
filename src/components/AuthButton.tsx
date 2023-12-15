import { signIn, signOut, useSession } from 'next-auth/react';

function AuthButton() {
  const { data: sessionData } = useSession();

  return (
    <button
      className="rounded-full dark:bg-purple-950 px-4 py-2 font-semibold no-underline transition dark:hover:bg-pink-800 dark:hover:drop-shadow-glow"
      onClick={sessionData ? () => void signOut() : () => void signIn()}
    >
      {sessionData ? "Sign out" : "Sign in"}
    </button>
  );
}

export default AuthButton;

