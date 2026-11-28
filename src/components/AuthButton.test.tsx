/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { signIn, signOut, useSession } from "next-auth/react";

import { goToSignIn } from "~/utils/goToSignIn";
import AuthButton from "./AuthButton";

jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  useSession: jest.fn(),
}));
jest.mock("~/utils/goToSignIn", () => ({ goToSignIn: jest.fn() }));

const useSessionMock = useSession as jest.Mock;

describe("AuthButton", () => {
  test("signed out, it goes to the sign-in page instead of next-auth's signIn()", () => {
    useSessionMock.mockReturnValue({ data: null, status: "unauthenticated" });
    render(<AuthButton />);

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(goToSignIn).toHaveBeenCalledTimes(1);
    expect(signIn).not.toHaveBeenCalled();
  });

  test("signed in, it signs out", () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "u1" }, expires: "" }, status: "authenticated" });
    render(<AuthButton />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(goToSignIn).not.toHaveBeenCalled();
  });
});
