from datetime import datetime, timedelta
import json
import time
from deepdiff import DeepDiff

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
print(oldFilename)
print(newFilename)

changed_cards = []
removed_cards = []


# Diff data and keep list of updates
with open(oldFilename, 'r') as f:
    oldData = json.load(f)

with open(newFilename, 'r') as f:
    newData = json.load(f)

print(f"oldData: {len(oldData)} cards")
print(f"newData: {len(newData)} cards")

diff = DeepDiff(newData, oldData)

print(diff)

# Save newest data dump

end = time.time()
length = end - start
print(f"It took {length} seconds!")
