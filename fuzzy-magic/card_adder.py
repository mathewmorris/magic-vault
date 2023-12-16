import ijson
import requests

# Endpoint URL
url = "http://localhost:3000/api/card/add"

# Function to process each card
def process_card(card):
    data = {
        "scryfallId": card['id'],
        "name": card['name']
    }

    try:
        response = requests.post(url, json=data, verify=False)
        print("Status Code:", response.status_code)
        print("Response:", response.json())
    except requests.exceptions.RequestException as e:
        print("Error:", e)

# Open and process the JSON file in chunks
with open('./all-cards-20231215221751.json', 'rb') as file:
    parser = ijson.items(file, 'item')
    for card in parser:
        process_card(card)

