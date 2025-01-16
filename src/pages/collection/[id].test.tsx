import { render, waitFor } from "utils/test-utils"
import CollectionDetailsPage from "./[id]"

describe.skip("Collection Details Page", () => {
  test("should render correctly", async () => {
    await waitFor(() => {
      expect(render(<CollectionDetailsPage />)).toMatchSnapshot();
    }, { timeout: 500 })
  })
})
