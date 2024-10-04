# Scryfall Data Broker

A service that uses Python to get the bulk data from api.scryfall.com
Right now we're only grabbing Default Cards
[go here](https://scryfall.com/docs/api/bulk-data) to see the differences

Fetch Scryfall Data
`python get_bulk_data_json_file.py`

Diff old set and new set, create file that notes changes
`python card-differ.py`

Update database & log changes made
`python db_updater.py`
