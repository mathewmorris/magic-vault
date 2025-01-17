import { render } from "utils/test-utils"
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import CardViewer from "./CardViewer"
import { CollectionCard } from "~/pages/collection/components/CollectionCards"
import userEvent from "@testing-library/user-event"

const server = setupServer(
  http.post('*.setCardCount', () => {
    return HttpResponse.json([
      {
        "result": {
          "data": {

          }
        }
      }
    ])
  }),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const card: CollectionCard = {
  cardId: "card123",
  collectionId: "collection123",
  count: 2,
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

test('it should render correctly', function() {
  const component = render(<CardViewer cards={[]} />)
  expect(component).toMatchSnapshot()
})

test('it should show cards', function() {
  const { getByText } = render(<CardViewer cards={[card]} />)
  getByText(/forest/i)
  getByText("+1")
  getByText("-1")
})

test('it should call to add card', async function() {
  const handleChange = jest.fn()
  const { getByText } = render(<CardViewer cards={[card]} onChange={handleChange} />)
  await userEvent.click(getByText("+1"))
  expect(handleChange).toHaveBeenCalledTimes(1)
  expect(handleChange).toHaveBeenCalledWith(card.collectionId, card.cardId, card.count + 1)
})

test('it should call to remove card', async function() {
  const handleChange = jest.fn()
  const { getByText } = render(<CardViewer cards={[card]} onChange={handleChange} />)
  await userEvent.click(getByText("-1"))
  expect(handleChange).toHaveBeenCalledTimes(1)
  expect(handleChange).toHaveBeenCalledWith(card.collectionId, card.cardId, card.count - 1)
})
