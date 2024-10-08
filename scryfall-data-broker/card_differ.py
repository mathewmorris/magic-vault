from datetime import datetime, timedelta
import json
import time
from deepdiff import DeepDiff
import logging
import logging.config

logging.config.fileConfig('logger.conf')

logger = logging.getLogger('card_differ')

# TODO:
##################################################################
# Card Differ: Diff the last bulk dump vs new one then store new
##################################################################

start = time.time()

# Grab last data dump from...
today = datetime.today()
yesterday = today - timedelta(days=1)
oldFilename = f"default_cards_{yesterday.strftime('%Y_%m_%d')}.json"
newFilename = f"default_cards_{today.strftime('%Y_%m_%d')}.json"
logger.info(f"Starting to diff {oldFilename} and {newFilename}")

changed_cards = []
removed_cards = []


# Diff data and keep list of updates
with open(oldFilename, 'r') as f:
    oldData = json.load(f)

with open(newFilename, 'r') as f:
    newData = json.load(f)

logger.info(f"oldData: {len(oldData)} cards")
logger.info(f"newData: {len(newData)} cards")

diff = DeepDiff(
    newData,
    oldData,
    group_by='id',
    # verbose_level=2
)

logger.info(f"Differences:\n{diff}")

changes = {}
for i in diff.keys():
    changes[i] = len(diff[i])

logger.info(f"Changes Counts:\n{changes}")

# Save newest data dump

end = time.time()
length = end - start
print(f"It took {length} seconds!")
