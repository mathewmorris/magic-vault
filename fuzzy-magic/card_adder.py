import ijson
import requests

# Endpoint URL
url = "http://localhost:3000/api/card/add"

# Function to process each card
def process_card(card):
    data = {
        'name': card['name'],
        'scryfall_id': card['id'],
        'scryfall_uri': card['scryfall_uri'],
        'image_status': card['image_status'],
        'layout': card['layout'],
    }

    try:
        response = requests.post(
            url, 
            json=data, 
            verify=False,
            headers={'Content-Type': 'application/json'}
        )
        print("Status Code:", response.status_code)
        print("Response:", response.json())
    except requests.exceptions.RequestException as e:
        print("Error:", e)

# Open and process the JSON file in chunks
with open('./default-cards-20231215220525.json', 'rb') as file:
    parser = ijson.items(file, 'item')
    for card in parser:
        process_card(card)

