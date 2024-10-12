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

download_uri_response = requests.get(
    'https://api.scryfall.com/bulk-data/default-cards', headers=headers)

download_uri = ""
have_download_uri = False

if download_uri_response.status_code == requests.codes.ok:
    # parse json and get download_uri
    download_uri = download_uri_response.json()['download_uri']
    have_download_uri = True
    print(f"{download_uri_response.status_code}: {download_uri}")

if have_download_uri:
    filename = f"default_cards_{datetime.today().strftime('%Y_%m_%d')}.json"

    # I don't want to keep the large files around (~500Mb)
    # TODO: add to a log, and just check log for successful downloads
    if os.path.exists(filename):
        print(f"File exists, skipping download. \
            Delete file ({filename}) if you want to redownload.")
    else:
        bulk_data_response = requests.get(download_uri, stream=True)
        print(f"downloading {filename}")
        with open(filename, 'wb') as fd:
            for idx, chunk in enumerate(bulk_data_response.iter_content(chunk_size=128)):
                # print(f"Downloading chunk: {idx}")
                fd.write(chunk)
        print(f"successfully downloaded {filename}!")
