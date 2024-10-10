from datetime import datetime, timedelta
import json
import time
from deepdiff import DeepDiff
import logging
import logging.config

logging.config.fileConfig('logger.conf')
logger = logging.getLogger('card_differ')

##################################################################
# Card Differ: Diff the last bulk dump vs new one then store new
##################################################################

start = time.time()
today = datetime.today()
yesterday = today - timedelta(days=1)
oldFilename = f"default_cards_{yesterday.strftime('%Y_%m_%d')}.json"
newFilename = f"default_cards_{today.strftime('%Y_%m_%d')}.json"

# Read files
logger.info('Reading files...')
reading_files_start = time.time()

with open(oldFilename, 'r') as f:
    oldData = json.load(f)

with open(newFilename, 'r') as f:
    newData = json.load(f)

logger.debug('Took %d seconds!', time.time() - reading_files_start)
logger.info(f"{oldFilename}: has {len(oldData)} cards")
logger.info(f"{newFilename}: has {len(newData)} cards")


logger.info(f"Starting to diff {oldFilename} and {newFilename}")
# Diff data and keep list of updates
events = DeepDiff(
    newData,
    oldData,
    group_by='id',
    verbose_level=2
)

actions = []

logger.info('Starting to create actions based on diff...')
for event_type in events:
    for event_id in events[event_type]:
        action = None
        if event_type == 'dictionary_item_added':
            action = {'action': 'CREATE',
                      'payload': events[event_type][event_id]}
        elif event_type == 'dictionary_item_removed':
            action = {'action': 'DELETE', 'id': event_id.split(
                "['")[1].replace("']", "")}
        elif event_type == 'values_changed':
            [_, key, name] = event_id.split("['")
            action = {'action': 'UPDATE',
                      'payload': {
                          'id': key.replace("']", ""),
                          'key': name.replace("']", ""),
                          'update': events[event_type][event_id]}
                      }

        if action is None:
            logger.critical('No case made for event type: %s',
                            event_type, event_id, events[event_type])
            pass

        logger.debug('Action created: %s', action)
        actions.append(action)
logger.info('%d actions created!', len(actions))

# Save newest data dump

end = time.time()
length = end - start
logger.info(f"It took {length} seconds!")
