import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.algorithms import (
    LRUCache,
    MinStack,
    RingBuffer,
    binary_search,
    binary_search_with_steps,
    lower_bound,
    merge_intervals,
    two_sum,
)


class AlgorithmTest(unittest.TestCase):
    def test_binary_search_boundaries(self) -> None:
        items = [1, 3, 5, 7]
        self.assertEqual(binary_search([], 1), -1)
        self.assertEqual(binary_search([5], 5), 0)
        self.assertEqual(binary_search(items, 1), 0)
        self.assertEqual(binary_search(items, 7), 3)
        self.assertEqual(binary_search(items, 4), -1)

    def test_binary_search_steps(self) -> None:
        items = list(range(1024))
        index, steps = binary_search_with_steps(items, 1023)
        self.assertEqual(index, 1023)
        self.assertLessEqual(steps, 11)

    def test_lower_bound_duplicates(self) -> None:
        items = [1, 2, 2, 2, 3]
        self.assertEqual(lower_bound(items, 2), 1)
        self.assertEqual(lower_bound(items, 4), 5)
        self.assertEqual(lower_bound([], 1), 0)

    def test_two_sum(self) -> None:
        self.assertEqual(two_sum([2, 7, 11, 15], 9), (0, 1))
        self.assertIsNone(two_sum([1, 2], 10))
        self.assertEqual(two_sum([3, 3], 6), (0, 1))

    def test_merge_intervals(self) -> None:
        self.assertEqual(merge_intervals([]), [])
        self.assertEqual(merge_intervals([(1, 3), (2, 6), (8, 10)]), [(1, 6), (8, 10)])
        self.assertEqual(merge_intervals([(1, 4), (4, 5)]), [(1, 5)])
        self.assertEqual(merge_intervals([(1, 10), (2, 3)]), [(1, 10)])

    def test_min_stack(self) -> None:
        stack = MinStack()
        stack.push(3)
        stack.push(1)
        stack.push(2)
        self.assertEqual(stack.min(), 1)
        self.assertEqual(stack.pop(), 2)
        self.assertEqual(stack.min(), 1)
        self.assertEqual(stack.pop(), 1)
        self.assertEqual(stack.min(), 3)
        with self.assertRaises(IndexError):
            MinStack().pop()

    def test_lru_cache(self) -> None:
        cache = LRUCache(2)
        cache.put(1, 1)
        cache.put(2, 2)
        self.assertEqual(cache.get(1), 1)
        cache.put(3, 3)  # 淘汰 2
        self.assertEqual(cache.get(2), -1)
        self.assertEqual(cache.keys(), [3, 1])
        cache.put(1, 10)
        self.assertEqual(cache.get(1), 10)
        with self.assertRaises(ValueError):
            LRUCache(0)

    def test_ring_buffer(self) -> None:
        ring = RingBuffer(3)
        ring.push(1)
        ring.push(2)
        ring.push(3)
        self.assertEqual(ring.to_list(), [1, 2, 3])
        ring.push(4)
        self.assertEqual(ring.to_list(), [2, 3, 4])
        with self.assertRaises(ValueError):
            RingBuffer(0)


if __name__ == "__main__":
    unittest.main()