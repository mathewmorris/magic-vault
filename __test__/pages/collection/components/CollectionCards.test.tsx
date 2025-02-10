import { render } from "../../../utils";
import CollectionCards, { CollectionCard } from "~/pages/collection/components/CollectionCards";

const card: CollectionCard = {
  cardId: "card123",
  collectionId: "collection123",
  count: 1,
  assignedAt: new Date(),
  assignedBy: "John Smith",
  card: {
    id: "card123",
    name: "Forest",
    scryfall_uri: "https://scryfall.com",
    image_status: "image_status",
    image_uris: {
      small: "small_image_uri",
    },
    card_faces: {},
    all_parts: {},
    layout: "normal",
  },
}

test("should render correctly", () => {
  const component = render(<CollectionCards cards={[card]} />);
  expect(component).toMatchSnapshot();
})

test("should handle no cards", () => {
  const component = render(
    <CollectionCards cards={[]} />
  );
  expect(component).toMatchSnapshot();
})

