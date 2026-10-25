"""选择排序：唯一可信源码（插桩调用与执行代码是同一份）。

每轮扫描剩余部分，找出最小/最大元素的候选下标，再与轮首位置交换。
指标口径（docs/algorithms-design.md §3）：比较 +1；交换 swaps+1、writes+2。
"""

from __future__ import annotations

from collections.abc import Sequence

from backend.app.trace.recorder import NullRecorder, Tracer

# 未传入 tracer 时使用全空接收器，纯算法调用不产生轨迹开销。
_NULL_RECORDER: Tracer = NullRecorder()


def selection_sort(
    values: Sequence[float],
    direction: str = "asc",
    tracer: Tracer | None = None,
) -> list[float]:
    """选择排序：返回排序后的新列表，传入 tracer 时同步产生真实执行轨迹。"""
    recorder: Tracer = tracer if tracer is not None else _NULL_RECORDER
    arr = list(values)
    n = len(arr)
    descending = direction == "desc"
    for i in range(n - 1):
        finalized = list(range(i))
        aux = {
            "pass_index": i,
            "min_index": i,
            "scan_from": i + 1,
            "scan_to": n - 1,
            "finalized_before": finalized,
        }
        recorder.emit_mark_sorted(pass_index=i, aux=aux, finalized=finalized)
        min_index = i
        for j in range(i + 1, n):
            aux["min_index"] = min_index
            recorder.emit_compare(
                i=min_index,
                j=j,
                aux=aux,
                active=(min_index, j),
                finalized=finalized,
                left_value=arr[min_index],
                right_value=arr[j],
            )
            # 升序找更小的元素，降序找更大的元素；相等时保持原来的先后顺序。
            if (arr[j] > arr[min_index]) if descending else (arr[j] < arr[min_index]):
                recorder.emit_select(
                    aux=aux,
                    active=(min_index, j),
                    compared=(min_index, j),
                    finalized=finalized,
                )
                min_index = j
        if min_index != i:
            arr[i], arr[min_index] = arr[min_index], arr[i]
            aux["min_index"] = i
            recorder.emit_swap(i=i, j=min_index, aux=aux, finalized=finalized)
    recorder.emit_done(
        pass_index=max(n - 2, 0),
        triggered=False,
        finalized=tuple(range(n)),
        aux={
            "pass_index": max(n - 2, 0),
            "min_index": 0,
            "scan_from": n,
            "scan_to": n - 1,
            "finalized_before": list(range(n)),
        },
    )
    return arr
