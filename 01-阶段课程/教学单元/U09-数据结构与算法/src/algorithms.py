"""U09：常见数据结构与算法的可测试实现（Python 标准库）。"""

from __future__ import annotations


def binary_search(items: list[int], target: int) -> int:
    low, high = 0, len(items) - 1
    while low <= high:
        mid = (low + high) // 2
        if items[mid] == target:
            return mid
        if items[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1


def binary_search_with_steps(items: list[int], target: int) -> tuple[int, int]:
    low, high, steps = 0, len(items) - 1, 0
    while low <= high:
        steps += 1
        mid = (low + high) // 2
        if items[mid] == target:
            return mid, steps
        if items[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1, steps


def lower_bound(items: list[int], target: int) -> int:
    low, high = 0, len(items)
    while low < high:
        mid = (low + high) // 2
        if items[mid] < target:
            low = mid + 1
        else:
            high = mid
    return low


def two_sum(items: list[int], target: int) -> tuple[int, int] | None:
    seen: dict[int, int] = {}
    for index, value in enumerate(items):
        need = target - value
        if need in seen:
            return seen[need], index
        seen[value] = index
    return None


def merge_intervals(intervals: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if not intervals:
        return []
    ordered = sorted(intervals)
    merged = [ordered[0]]
    for start, end in ordered[1:]:
        last_start, last_end = merged[-1]
        if start <= last_end:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return merged


class MinStack:
    def __init__(self) -> None:
        self._items: list[int] = []
        self._mins: list[int] = []

    def push(self, value: int) -> None:
        self._items.append(value)
        self._mins.append(value if not self._mins else min(value, self._mins[-1]))

    def pop(self) -> int:
        if not self._items:
            raise IndexError("pop from empty stack")
        self._mins.pop()
        return self._items.pop()

    def top(self) -> int:
        if not self._items:
            raise IndexError("top from empty stack")
        return self._items[-1]

    def min(self) -> int:
        if not self._mins:
            raise IndexError("min from empty stack")
        return self._mins[-1]


class _Node:
    __slots__ = ("key", "value", "prev", "next")

    def __init__(self, key: int = 0, value: int = 0) -> None:
        self.key = key
        self.value = value
        self.prev: _Node | None = None
        self.next: _Node | None = None


class LRUCache:
    def __init__(self, capacity: int) -> None:
        if capacity <= 0:
            raise ValueError("capacity must be > 0")
        self.capacity = capacity
        self._map: dict[int, _Node] = {}
        self._head = _Node()
        self._tail = _Node()
        self._head.next = self._tail
        self._tail.prev = self._head

    def _remove(self, node: _Node) -> None:
        assert node.prev is not None and node.next is not None
        node.prev.next = node.next
        node.next.prev = node.prev

    def _add_front(self, node: _Node) -> None:
        node.next = self._head.next
        node.prev = self._head
        assert self._head.next is not None
        self._head.next.prev = node
        self._head.next = node

    def get(self, key: int) -> int:
        node = self._map.get(key)
        if node is None:
            return -1
        self._remove(node)
        self._add_front(node)
        return node.value

    def put(self, key: int, value: int) -> None:
        node = self._map.get(key)
        if node is not None:
            node.value = value
            self._remove(node)
            self._add_front(node)
            return
        if len(self._map) >= self.capacity:
            assert self._tail.prev is not None
            oldest = self._tail.prev
            self._remove(oldest)
            del self._map[oldest.key]
        node = _Node(key, value)
        self._map[key] = node
        self._add_front(node)

    def keys(self) -> list[int]:
        result = []
        cur = self._head.next
        while cur is not self._tail:
            assert cur is not None
            result.append(cur.key)
            cur = cur.next
        return result


class RingBuffer:
    def __init__(self, capacity: int) -> None:
        if capacity <= 0:
            raise ValueError("capacity must be > 0")
        self.capacity = capacity
        self._data: list[int | None] = [None] * capacity
        self._head = 0
        self._count = 0

    def push(self, value: int) -> None:
        index = (self._head + self._count) % self.capacity
        if self._count < self.capacity:
            self._count += 1
        else:
            self._head = (self._head + 1) % self.capacity
        self._data[index] = value

    def to_list(self) -> list[int]:
        return [int(self._data[(self._head + i) % self.capacity]) for i in range(self._count)]