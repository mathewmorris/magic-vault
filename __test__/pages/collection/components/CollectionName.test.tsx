import { render } from "../../../utils"
import userEvent from "@testing-library/user-event";
import { CollectionName } from "../../../../src/pages/collection/components/CollectionName"

test("should render correctly", () => {
  const handleSave = jest.fn();
  const component = render(<CollectionName name="My Collection" onSave={handleSave} />);
  expect(component).toMatchSnapshot();
})

test("should save new name", async () => {
  const handleSave = jest.fn();
  const { getByText, getByLabelText } = render(
    <CollectionName name="My Collection" onSave={handleSave} />
  );

  await userEvent.click(getByText('Edit'));
  await userEvent.type(getByLabelText(/collection name/i), ' Edited')
  await userEvent.click(getByText(/save/i))
  expect(handleSave).toHaveBeenCalledTimes(1)
  expect(handleSave).toHaveBeenCalledWith('My Collection Edited')
})

test("should stop editing on cancel", async () => {
  const handleSave = jest.fn();
  const { getByText, getByLabelText } = render(
    <CollectionName name="My Collection" onSave={handleSave} />
  );

  await userEvent.click(getByText('Edit'));
  await userEvent.type(getByLabelText(/collection name/i), ' Edited')
  await userEvent.click(getByText(/cancel/i))
  getByText(/my collection/i)
  getByText(/edit/i)
  expect(handleSave).toHaveBeenCalledTimes(0)
})

test("should keep editing when displaying rename error", async () => {
  const handleSave = jest.fn();
  const { getByText, getByLabelText, getByRole, queryByText } = render(
    <CollectionName name="My Collection" onSave={handleSave} />
  );

  await userEvent.click(getByText('Edit'));
  await userEvent.clear(getByLabelText(/collection name/i))
  await userEvent.click(getByText(/save/i))
  getByRole('alert')
  getByText(/save/i)
  getByText(/cancel/i)
  expect(handleSave).toHaveBeenCalledTimes(0)

  await userEvent.click(getByText(/got it/i))
  expect(queryByText(/got it/i)).toBeNull()
})
