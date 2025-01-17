import { render } from "utils/test-utils"
import CollectionDetailsPage from "./[id]"

describe("Collection Details Page", () => {
  test("should render correctly", function() {
    expect(render(<CollectionDetailsPage />)).toMatchSnapshot();
  })
})
