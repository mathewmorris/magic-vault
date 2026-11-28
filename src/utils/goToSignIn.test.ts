import { goToSignIn } from "./goToSignIn";

describe("goToSignIn", () => {
  test("opens the sign-in page with the current page as the callback", () => {
    const assign = jest.fn();

    goToSignIn({ href: "https://example.com/collections?page=2", assign });

    expect(assign).toHaveBeenCalledWith(
      "/api/auth/signin?callbackUrl=https%3A%2F%2Fexample.com%2Fcollections%3Fpage%3D2",
    );
  });
});
