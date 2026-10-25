"""算法注册表：算法 id → 模块/函数/行映射/元数据。

阶段 5A 注册 7 个可用算法（含阶段 2 的冒泡排序），3 个非比较类算法标为 planned。
行映射在导入期建立：任何插桩漂移都会立即抛 ``LineMapError``，阻止服务启动。
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from types import ModuleType

from backend.app.algorithms import (
    bubble,
    heap,
    insertion,
    merge,
    quick,
    selection,
    shell,
)
from backend.app.schemas.algorithm_trace import (
    AlgorithmId,
    AlgorithmMetadata,
    AvailableAlgorithmId,
    BilingualText,
)
from backend.app.trace.line_map import AlgorithmLineMap, build_line_map


def _bi(zh_hant: str, en: str) -> BilingualText:
    """构造双语元数据（字面量在注册表集中维护，避免散落）。"""
    return BilingualText(zh_hant=zh_hant, en=en)


@dataclass(frozen=True)
class AlgorithmSpec:
    """一个可用算法的运行规格。"""

    algorithm_id: AvailableAlgorithmId
    module: ModuleType
    function: Callable[..., list[float]]
    line_map: AlgorithmLineMap
    metadata: AlgorithmMetadata
    # 每个事件必须携带的 aux 固定字段（设计文档 §4）；冒泡的 comparison 仅 compare 事件提供
    aux_fields: tuple[str, ...]


_BUBBLE_METADATA = AlgorithmMetadata(
    id="bubble",
    name=_bi("冒泡排序", "Bubble sort"),
    tagline=_bi(
        "相鄰兩兩比較，數值大的往右冒",
        "Compare adjacent pairs and let larger values bubble right",
    ),
    status="available",
    time_complexity=_bi("O(n²)（含提前結束優化）", "O(n²) with early exit"),
    space_complexity=_bi("O(1)", "O(1)"),
    stable=True,
    use_cases=_bi(
        "理解比較與交換的入門演算法",
        "Introductory algorithm for comparison and swapping",
    ),
    default_values=[5, 3, 8, 1, 9, 2],
    supports_early_exit=True,
)

_SELECTION_METADATA = AlgorithmMetadata(
    id="selection",
    name=_bi("選擇排序", "Selection sort"),
    tagline=_bi(
        "每輪掃描剩餘部分，把最小值放到前面",
        "Scan the remaining part each pass and move the minimum to the front",
    ),
    status="available",
    time_complexity=_bi("O(n²)", "O(n²)"),
    space_complexity=_bi("O(1)", "O(1)"),
    stable=False,
    use_cases=_bi("資料量小、希望交換次數少時", "Small inputs where few swaps matter"),
    default_values=[5, 3, 8, 1, 9, 2],
    supports_early_exit=False,
)

_INSERTION_METADATA = AlgorithmMetadata(
    id="insertion",
    name=_bi("插入排序", "Insertion sort"),
    tagline=_bi(
        "像整理手牌，把新的牌插到已排序區",
        "Like sorting a hand of cards: insert each new card into the sorted part",
    ),
    status="available",
    time_complexity=_bi("O(n²)", "O(n²)"),
    space_complexity=_bi("O(1)", "O(1)"),
    stable=True,
    use_cases=_bi("幾乎已經有序的資料", "Data that is already nearly sorted"),
    default_values=[5, 3, 8, 1, 9, 2],
    supports_early_exit=False,
)

_SHELL_METADATA = AlgorithmMetadata(
    id="shell",
    name=_bi("希爾排序", "Shell sort"),
    tagline=_bi(
        "先按大步長分組插入，再逐步縮小 gap",
        "Insertion sort with large gaps first, then shrink the gap",
    ),
    status="available",
    time_complexity=_bi(
        "O(n log n)～O(n²)（取決於 gap 序列）",
        "O(n log n) to O(n²) depending on the gap sequence",
    ),
    space_complexity=_bi("O(1)", "O(1)"),
    stable=False,
    use_cases=_bi(
        "中等規模、希望比插入排序快",
        "Medium inputs where a faster insertion sort is useful",
    ),
    default_values=[5, 3, 8, 1, 9, 2],
    supports_early_exit=False,
)

_MERGE_METADATA = AlgorithmMetadata(
    id="merge",
    name=_bi("歸併排序", "Merge sort"),
    tagline=_bi(
        "遞迴對半拆分，再把兩個有序半區合併",
        "Split in half recursively, then merge the two sorted halves",
    ),
    status="available",
    time_complexity=_bi("O(n log n)", "O(n log n)"),
    space_complexity=_bi("O(n)", "O(n)"),
    stable=True,
    use_cases=_bi("需要穩定排序、且希望效能可預期", "Stable sorting with predictable performance"),
    default_values=[5, 3, 8, 1, 9, 2],
    supports_early_exit=False,
)

_QUICK_METADATA = AlgorithmMetadata(
    id="quick",
    name=_bi("快速排序", "Quick sort"),
    tagline=_bi(
        "選首元素作樞軸分區，左邊小、右邊大，再處理兩邊",
        "Use the first element as pivot, partition, then handle both sides",
    ),
    status="available",
    time_complexity=_bi(
        "平均 O(n log n)、最壞 O(n²)（首元素樞軸）",
        "Average O(n log n), worst O(n²) with a first-element pivot",
    ),
    space_complexity=_bi("O(log n) 遞迴棧", "O(log n) recursion stack"),
    stable=False,
    use_cases=_bi("一般隨機資料的快速排序", "Fast general-purpose sorting on random data"),
    default_values=[5, 3, 8, 1, 9, 2],
    supports_early_exit=False,
)

_HEAP_METADATA = AlgorithmMetadata(
    id="heap",
    name=_bi("堆積排序", "Heap sort"),
    tagline=_bi(
        "建堆後反覆把堆頂換到末尾，再讓新的堆頂下沉",
        "Build a heap, repeatedly move the root to the end and sift the new root down",
    ),
    status="available",
    time_complexity=_bi("O(n log n)", "O(n log n)"),
    space_complexity=_bi("O(1)", "O(1)"),
    stable=False,
    use_cases=_bi(
        "需要原地排序、且最壞情況仍是 O(n log n)",
        "In-place sorting with O(n log n) worst-case performance",
    ),
    default_values=[5, 3, 8, 1, 9, 2],
    supports_early_exit=False,
)


def _make_spec(
    *,
    algorithm_id: AvailableAlgorithmId,
    module: ModuleType,
    function: Callable[..., list[float]],
    metadata: AlgorithmMetadata,
    aux_fields: tuple[str, ...],
) -> AlgorithmSpec:
    return AlgorithmSpec(
        algorithm_id=algorithm_id,
        module=module,
        function=function,
        line_map=build_line_map(module, function),
        metadata=metadata,
        aux_fields=aux_fields,
    )


# 可用算法（顺序即 GET /api/algorithms 的展示顺序）。
ALGORITHMS: dict[str, AlgorithmSpec] = {
    spec.algorithm_id: spec
    for spec in (
        _make_spec(
            algorithm_id="bubble",
            module=bubble,
            function=bubble.bubble_sort,
            metadata=_BUBBLE_METADATA,
            aux_fields=("pass_index", "early_exit_enabled", "swapped_in_pass"),
        ),
        _make_spec(
            algorithm_id="selection",
            module=selection,
            function=selection.selection_sort,
            metadata=_SELECTION_METADATA,
            aux_fields=(
                "pass_index",
                "min_index",
                "scan_from",
                "scan_to",
                "finalized_before",
            ),
        ),
        _make_spec(
            algorithm_id="insertion",
            module=insertion,
            function=insertion.insertion_sort,
            metadata=_INSERTION_METADATA,
            aux_fields=(
                "pass_index",
                "key_value",
                "key_index",
                "hole_index",
                "sorted_to",
                "shifting",
            ),
        ),
        _make_spec(
            algorithm_id="shell",
            module=shell,
            function=shell.shell_sort,
            metadata=_SHELL_METADATA,
            aux_fields=(
                "gap",
                "gap_index",
                "groups",
                "group_index",
                "key_value",
                "hole_index",
            ),
        ),
        _make_spec(
            algorithm_id="merge",
            module=merge,
            function=merge.merge_sort,
            metadata=_MERGE_METADATA,
            aux_fields=(
                "left",
                "mid",
                "right",
                "depth",
                "left_ptr",
                "right_ptr",
                "buffer",
                "buffer_index",
                "writing_back",
            ),
        ),
        _make_spec(
            algorithm_id="quick",
            module=quick,
            function=quick.quick_sort,
            metadata=_QUICK_METADATA,
            aux_fields=(
                "pivot_value",
                "pivot_index",
                "low",
                "high",
                "left_ptr",
                "right_ptr",
                "partition_index",
                "phase",
            ),
        ),
        _make_spec(
            algorithm_id="heap",
            module=heap,
            function=heap.heap_sort,
            metadata=_HEAP_METADATA,
            aux_fields=(
                "heap_size",
                "node_index",
                "parent_index",
                "left_child",
                "right_child",
                "phase",
            ),
        ),
    )
}

# 尚未实现的非比较类算法：只在算法中心列出，轨迹端点返回 404。
PLANNED_ALGORITHMS: tuple[AlgorithmMetadata, ...] = (
    AlgorithmMetadata(
        id="counting",
        name=_bi("計數排序", "Counting sort"),
        tagline=_bi(
            "統計每個值出現的次數，再按次序輸出",
            "Count how often each value occurs, then output them in order",
        ),
        status="planned",
        time_complexity=_bi("O(n + k)", "O(n + k)"),
        space_complexity=_bi("O(k)", "O(k)"),
        stable=True,
        use_cases=_bi("整數且數值範圍很小的資料", "Integers with a small value range"),
        default_values=[4, 2, 2, 8, 3, 3, 1],
        supports_early_exit=False,
    ),
    AlgorithmMetadata(
        id="bucket",
        name=_bi("桶排序", "Bucket sort"),
        tagline=_bi(
            "按數值區間分到不同桶，桶內排序後再拼接",
            "Distribute values into buckets by range, sort inside each bucket, then concatenate",
        ),
        status="planned",
        time_complexity=_bi("平均 O(n + k)", "Average O(n + k)"),
        space_complexity=_bi("O(n + k)", "O(n + k)"),
        stable=None,
        use_cases=_bi("分布均勻的資料", "Uniformly distributed data"),
        default_values=[30.2, 29.6, 30.1, 28.0, 31.5],
        supports_early_exit=False,
    ),
    AlgorithmMetadata(
        id="radix",
        name=_bi("基數排序", "Radix sort"),
        tagline=_bi(
            "按個位、十位、百位逐位穩定分配再收集",
            "Stable distribution and collection by each digit (ones, tens, hundreds)",
        ),
        status="planned",
        time_complexity=_bi("O(d(n + b))", "O(d(n + b))"),
        space_complexity=_bi("O(n + b)", "O(n + b)"),
        stable=True,
        use_cases=_bi("整數或固定長度的資料", "Integers or fixed-length keys"),
        default_values=[170, 45, 75, 90, 802, 24, 2, 66],
        supports_early_exit=False,
    ),
)

# 算法中心展示顺序：7 个可用 + 3 个 planned。
ALGORITHM_ORDER: tuple[AlgorithmId, ...] = (
    "bubble",
    "selection",
    "insertion",
    "shell",
    "merge",
    "quick",
    "heap",
    "counting",
    "bucket",
    "radix",
)
