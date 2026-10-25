"""快速排序：唯一可信源码（插桩调用与执行代码是同一份）。

策略固定为**首元素枢轴 + Lomuto 分区**，左右两段用显式栈（递归的等价写法）
按确定顺序处理。指标口径（docs/algorithms-design.md §3）：与枢轴比较 +1；
每交换 swaps+1、writes+2。
"""

from __future__ import annotations

from collections.abc import Sequence

from backend.app.trace.recorder import NullRecorder, Tracer

# 未传入 tracer 时使用全空接收器，纯算法调用不产生轨迹开销。
_NULL_RECORDER: Tracer = NullRecorder()


def quick_sort(
    values: Sequence[float],
    direction: str = "asc",
    tracer: Tracer | None = None,
) -> list[float]:
    """快速排序：返回排序后的新列表，传入 tracer 时同步产生真实执行轨迹。"""
    recorder: Tracer = tracer if tracer is not None else _NULL_RECORDER
    arr = list(values)
    n = len(arr)
    descending = direction == "desc"
    finalized: list[int] = []
    stack: list[tuple[int, int, int]] = [(0, n - 1, 0)]
    pass_index = 0
    while stack:
        low, high, depth = stack.pop()
        aux = {
            "pivot_value": arr[low],
            "pivot_index": low,
            "low": low,
            "high": high,
            "left_ptr": low,
            "right_ptr": low + 1,
            "partition_index": low,
            "phase": "compare",
        }
        recorder.emit_mark_sorted(
            pass_index=pass_index, aux=aux, site=0, finalized=finalized
        )
        pass_index += 1
        if low >= high:
            continue
        pivot_value = arr[low]
        pivot_index = low
        boundary = low
        for j in range(low + 1, high + 1):
            aux["left_ptr"] = boundary
            aux["right_ptr"] = j
            recorder.emit_compare(
                i=pivot_index,
                j=j,
                aux=aux,
                active=(pivot_index, j),
                finalized=finalized,
                left_value=pivot_value,
                right_value=arr[j],
            )
            # 升序：把比枢轴小的放左边；降序：把比枢轴大的放左边。
            if (arr[j] > pivot_value) if descending else (arr[j] < pivot_value):
                aux["phase"] = "partition"
                recorder.emit_partition(
                    aux=aux, site=0, active=(boundary, j), finalized=finalized
                )
                boundary += 1
                if boundary != j:
                    arr[boundary], arr[j] = arr[j], arr[boundary]
                    aux["partition_index"] = boundary
                    recorder.emit_swap(
                        i=boundary, j=j, aux=aux, site=0, finalized=finalized
                    )
        if boundary != low:
            arr[low], arr[boundary] = arr[boundary], arr[low]
            aux["phase"] = "placed"
            aux["partition_index"] = boundary
            recorder.emit_swap(i=low, j=boundary, aux=aux, site=1, finalized=finalized)
        finalized.append(boundary)
        if boundary + 1 < high:
            stack.append((boundary + 1, high, depth + 1))
        if low + 1 < boundary:
            stack.append((low, boundary - 1, depth + 1))
    done_pass = max(pass_index - 1, 0)
    done_final = tuple(range(n))
    done_aux = {
        "pivot_value": 0.0,
        "pivot_index": 0,
        "low": 0,
        "high": n - 1,
        "left_ptr": 0,
        "right_ptr": 0,
        "partition_index": 0,
        "phase": "placed",
    }
    recorder.emit_done(pass_index=done_pass, finalized=done_final, aux=done_aux)
    return arr
