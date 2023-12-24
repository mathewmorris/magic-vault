import sys
import ijson
import json
import requests
from decimal import Decimal

# Check for command-line argument
if len(sys.argv) < 2:
    print("Usage: python script.py filename.json")
    sys.exit(1)

filename = sys.argv[1]

# Endpoint URL
url = "http://localhost:3000/api/card/add"

# Custom JSON Encoder
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

# Function to process each card
def process_card(card):
    data = {
        'name': card['name'],
        'scryfall_id': card['id'],
        'scryfall_uri': card['scryfall_uri'],
        'image_status': card['image_status'],
        'image_uris': card['image_uris'],
        'layout': card['layout'],
    }

    try:
        response = requests.post(
            url, 
            json=data, 
            verify=False,
            headers={'Content-Type': 'application/json'}
        )
        pretty_card = json.dumps(data, cls=DecimalEncoder, indent=4)
        print(f"Card data successfully sent. {pretty_card}")
    except requests.exceptions.RequestException as e:
        print("Error:", e)

# Open and process the JSON file in chunks
with open(filename, 'rb') as file:
    parser = ijson.items(file, 'item')
    for card in parser:
        process_card(card)

