
# Scryfall Data Broker

# A service that uses Python to get the bulk data from api.scryfall.com
# Right now we're only grabbing Default Cards
# [go here](https://scryfall.com/docs/api/bulk-data) to see the differences


# How long does it take? ~8 minutes (0 changes detected)
# How does it work? Using [DeepDiff by Zepworks](https://zepworks.com/deepdiff/current/basics.html) to diff the lists. Takes quite a while since we're comparing ~210k items, but I'm not too worried about that since I'll be running this locally until I can figure out optimizations.

# Fetch Scryfall Data
# `python get_bulk_data_json_file.py`
import os
import logging.config
import logging
from deepdiff import DeepDiff
import time
import json
from datetime import datetime, timedelta
import requests

logging.config.fileConfig('logger.conf')
logger = logging.getLogger('card_differ')

###################################################
# Gather bulk data from Scryfall
###################################################

url = 'https://api.scryfall.com/bulk-data/default-cards'
headers = {
    'User-Agent': "MagicVaultScryfallDataBroker/1.0",
    'Accept': "application/json;q=1.0,*/*;q=0.9"
}

payload = ""

download_uri_response = requests.get(
    url, headers=headers)


if download_uri_response.status_code == requests.codes.ok:
    logger.debug(
        f"{download_uri_response.status_code}: {download_uri_response}")
    # parse json and get download_uri
    download_uri = download_uri_response.json()['download_uri']
    file_name = f"default_cards_{datetime.today().strftime('%Y_%m_%d')}.json"

    if os.path.exists(file_name):
        logger.warning(f"File exists, skipping download. \
            Delete file ({file_name}) if you want to redownload.")
    else:
        bulk_data_response = requests.get(download_uri, stream=True)
        logger.info(f"downloading {file_name}")
        with open(file_name, 'wb') as fd:
            for idx, chunk in enumerate(bulk_data_response.iter_content(chunk_size=128)):
                # print(f"Downloading chunk: {idx}")
                fd.write(chunk)
        logger.info(f"successfully downloaded {file_name}!")
else:
    logger.critical('Attempting to download %s resulted in %s code.',
                    url, download_uri_response.status_code)

# Diff old set and new set, create file that notes changes
# `python card_differ.py`

##################################################################
# Card Differ: Diff the last bulk dump vs new one then store new
##################################################################

start = time.time()
today = datetime.today()
yesterday = today - timedelta(days=1)


def build_file_name_with_date(date):
    return f"default_cards_{date.strftime('%Y_%m_%d')}.json"


old_file_name = build_file_name_with_date(yesterday)


def open_oldest_file(date):
    file_name = build_file_name_with_date(date)
    try:
        with open(file_name, 'r') as f:
            logger.debug("Found '%s', loading in...", file_name)
            return [json.load(f), file_name]
    except FileNotFoundError:
        next_file_name = build_file_name_with_date(date - timedelta(days=1))
        logger.warning("'%s' not found, trying '%s' next",
                       file_name, next_file_name)
        return open_oldest_file(date - timedelta(days=1))


# Read files
logger.info('Reading files...')
reading_files_start = time.time()

[oldData, old_file_name] = open_oldest_file(yesterday)

with open(file_name, 'r') as f:
    newData = json.load(f)

logger.debug('Took %d seconds!', time.time() - reading_files_start)
logger.info(f"{old_file_name}: has {len(oldData)} cards")
logger.info(f"{file_name}: has {len(newData)} cards")
logger.info(f"Starting to diff {old_file_name} and {file_name}")
# Diff data and keep list of updates


events = DeepDiff(
    newData[:25],
    oldData[:25],
    group_by='id',
    verbose_level=2
)


def identifyAction(action, event_id):
    if action == 'dictionary_item_added':
        action = {'action': 'CREATE',
                  'payload': events[action][event_id]}
    elif action == 'dictionary_item_removed':
        action = {'action': 'DELETE', 'id': event_id.split(
            "['")[1].replace("']", "")}
    elif action == 'values_changed':
        [_, key, name] = event_id.split("['")
        action = {'action': 'UPDATE',
                  'payload': {
                      'id': key.replace("']", ""),
                      'key': name.replace("']", ""),
                      'update': events[action][event_id]}
                  }

    if action is None:
        logger.critical('No case made for event type: action: %s, event_id: %s, events: %s',
                        action, event_id, events)
        pass


actions = []

logger.info('Starting to create actions based on diff...')
for event_type in events:
    logger.debug('event_type: %s', event_type)
    for event_id in events[event_type]:
        logger.debug('event_id: %s', event_id)
        action = identifyAction(event_type, event_id)

        logger.debug('Action created: %s', action)
        actions.append(action)
logger.info('%d actions created!', len(actions))

# Save newest data dump

end = time.time()
length = end - start
logger.info(f"It took {length} seconds!")

# Update database & log changes made
# `python db_updater.py`
# TODO:
###################################################
# Update database
###################################################

# Use list of actions to know which to update/add/delete
# for action in actions:

# Save results of update in database, to use later for metrics
