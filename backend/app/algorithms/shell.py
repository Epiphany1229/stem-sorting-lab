"""希尔排序：唯一可信源码（插桩调用与执行代码是同一份）。

先按大步长 gap 把数组分组做插入排序，再逐步缩小 gap（n//2, n//4, …, 1）。
指标口径（docs/algorithms-design.md §3）：比较 +1；swaps 恒为 0；
组内平移与最终插入各计 writes+1。
"""

from __future__ import annotations

from collections.abc import Sequence

from backend.app.trace.recorder import NullRecorder, Tracer

# 未传入 tracer 时使用全空接收器，纯算法调用不产生轨迹开销。
_NULL_RECORDER: Tracer = NullRecorder()


def shell_sort(
    values: Sequence[float],
    direction: str = "asc",
    tracer: Tracer | None = None,
) -> list[float]:
    """希尔排序：返回排序后的新列表，传入 tracer 时同步产生真实执行轨迹。"""
    recorder: Tracer = tracer if tracer is not None else _NULL_RECORDER
    arr = list(values)
    n = len(arr)
    descending = direction == "desc"
    gap = n // 2
    gap_index = 0
    while gap > 0:
        groups = [list(range(start, n, gap)) for start in range(gap)]
        aux = {
            "gap": gap,
            "gap_index": gap_index,
            "groups": groups,
            "group_index": 0,
            "key_value": arr[0],
            "hole_index": 0,
        }
        recorder.emit_mark_sorted(pass_index=gap_index, aux=aux, finalized=[])
        for group_index, group in enumerate(groups):
            aux["group_index"] = group_index
            for position in range(1, len(group)):
                i = group[position]
                key = arr[i]
                hole = i
                aux["key_value"] = key
                aux["hole_index"] = hole
                while hole - gap >= 0:
                    aux["hole_index"] = hole
                    recorder.emit_compare(
                        i=hole - gap,
                        j=hole,
                        aux=aux,
                        active=(hole - gap, hole),
                        finalized=[],
                        left_value=arr[hole - gap],
                        right_value=key,
                    )
                    # 升序：组内左侧元素更大就要右移；降序：左侧元素更小就要右移。
                    if (
                        (arr[hole - gap] < key)
                        if descending
                        else (arr[hole - gap] > key)
                    ):
                        aux["hole_index"] = hole - gap
                        arr[hole] = arr[hole - gap]
                        recorder.emit_write_shift(
                            source=hole - gap, target=hole, aux=aux, site=0, finalized=[]
                        )
                        hole -= gap
                    else:
                        break
                if hole != i:
                    aux["hole_index"] = hole
                    arr[hole] = key
                    recorder.emit_write_place(
                        index=hole, aux=aux, site=1, finalized=[]
                    )
        gap //= 2
        gap_index += 1
    recorder.emit_done(
        pass_index=max(gap_index - 1, 0),
        triggered=False,
        finalized=tuple(range(n)),
        aux={
            "gap": 1,
            "gap_index": max(gap_index - 1, 0),
            "groups": [list(range(n))],
            "group_index": 0,
            "key_value": 0.0,
            "hole_index": 0,
        },
    )
    return arr
