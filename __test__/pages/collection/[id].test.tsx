import { render } from "../../utils"
import CollectionDetailsPage from "../../../src/pages/collection/[id]"

describe("Collection Details Page", () => {
  test("should render correctly", function() {
    expect(render(<CollectionDetailsPage />)).toMatchSnapshot();
  })
})
