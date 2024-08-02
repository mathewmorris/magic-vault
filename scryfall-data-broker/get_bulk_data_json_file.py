import requests
import os
from datetime import datetime

###################################################
# Gather bulk data from Scryfall
###################################################

headers = {
    'User-Agent': "MagicVaultScryfallDataBroker/1.0",
    'Accept': "application/json;q=1.0,*/*;q=0.9"
}

payload = ""

bulk_data_response = requests.get(
    'https://api.scryfall.com/bulk-data/default-cards', headers=headers)

download_uri = ""
have_download_uri = False

if bulk_data_response.status_code == requests.codes.ok:
    # parse json and get download_uri
    download_uri = bulk_data_response.json()['download_uri']
    have_download_uri = True
    print(f"{bulk_data_response.status_code}: {download_uri}")

if have_download_uri:
    filename = f"default-cards-{datetime.today().strftime('%Y-%m-%d')}.json"

    # I don't want to keep the large files around (~500Mb)
    # TODO: add to a log, and just check log for successful downloads
    if os.path.exists(filename):
        print('file exists, skipping download')
    else:
        bulk_data_file_response = requests.get(download_uri, stream=True)
        print(f"downloading {filename}")
        with open(filename, 'wb') as fd:
            for chunk in bulk_data_file_response.iter_content(chunk_size=128):
                fd.write(chunk)
        print("successfully downloaded {filename}!")

# TODO:
###################################################
# Add data to database
###################################################
