"use client";

import { signOut, useSession } from 'next-auth/react';
import { goToSignIn } from '~/utils/goToSignIn';
import Button from './Button';

function AuthButton() {
  const { data: sessionData } = useSession();

  return (
    <Button
      onClick={sessionData ? () => void signOut() : () => goToSignIn()}
    >
      {sessionData ? "Sign out" : "Sign in"}
    </Button>
  );
}

export default AuthButton;
