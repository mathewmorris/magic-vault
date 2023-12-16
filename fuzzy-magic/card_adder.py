import json
import requests

# Endpoint URL
url = "http://localhost:3000/api/card/add"

# Open and process the entire JSON file
with open('../cards.json') as file:
    cards = json.load(file)  # Load the entire file as JSON

    for card in cards:
        # Data to be sent
        data = {
            "scryfallId": card['id'],
            "name": card['name']
        }

        # Making a POST request
        try:
            response = requests.post(url, json=data, verify=False)
            print("Status Code:", response.status_code)
            print("Response:", response.json())
        except requests.exceptions.RequestException as e:
            print("Error:", e)

