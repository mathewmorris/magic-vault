import { signIn, signOut, useSession } from 'next-auth/react';
import Button from './Button';

function AuthButton() {
  const { data: sessionData } = useSession();

  return (
    <Button
      onClick={sessionData ? () => void signOut() : () => void signIn()}
    >
      {sessionData ? "Sign out" : "Sign in"}
    </Button>
  );
}

export default AuthButton;

