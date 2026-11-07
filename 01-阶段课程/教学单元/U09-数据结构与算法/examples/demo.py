import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.algorithms import LRUCache, binary_search_with_steps, merge_intervals

items = list(range(1024))
index, steps = binary_search_with_steps(items, 1023)
print(f"binary_search: index={index} steps={steps}")
assert index == 1023 and steps <= 11

print(f"merge: {merge_intervals([(1, 3), (2, 6), (8, 10)])}")

cache = LRUCache(2)
cache.put(1, 1)
cache.put(2, 2)
print(f"lru get(1)={cache.get(1)} keys={cache.keys()}")
cache.put(3, 3)
print(f"lru after put(3): get(2)={cache.get(2)} keys={cache.keys()}")
assert cache.get(2) == -1
assert cache.keys() == [3, 1]

print("DEMO PASS")