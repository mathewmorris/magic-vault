# Scryfall Data Broker

A service that uses Python to get the bulk data from api.scryfall.com

## Procedure (outdated 10/1/24)
1. Grab latest bulk data information that includes the most interesting part, `download_uri`
2. Use `download_uri` from step 1 to open a stream to download the JSON file locally
3. Parse JSON file contents and hit `/api/card/add` for each one (will set up a queue)

