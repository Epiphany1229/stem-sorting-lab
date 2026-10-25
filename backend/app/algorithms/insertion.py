"""插入排序：唯一可信源码（插桩调用与执行代码是同一份）。

像整理手牌一样，把当前 key 插到左侧已排序区的正确位置：比 key 大的元素右移。
指标口径（docs/algorithms-design.md §3）：比较 +1；swaps 恒为 0；每次右移与最终
插入各计 writes+1。
"""

from __future__ import annotations

from collections.abc import Sequence

from backend.app.trace.recorder import NullRecorder, Tracer

# 未传入 tracer 时使用全空接收器，纯算法调用不产生轨迹开销。
_NULL_RECORDER: Tracer = NullRecorder()


def insertion_sort(
    values: Sequence[float],
    direction: str = "asc",
    tracer: Tracer | None = None,
) -> list[float]:
    """插入排序：返回排序后的新列表，传入 tracer 时同步产生真实执行轨迹。"""
    recorder: Tracer = tracer if tracer is not None else _NULL_RECORDER
    arr = list(values)
    n = len(arr)
    descending = direction == "desc"
    for i in range(1, n):
        finalized = list(range(i))
        key = arr[i]
        hole = i
        aux = {
            "pass_index": i - 1,
            "key_value": key,
            "key_index": i,
            "hole_index": hole,
            "sorted_to": i,
            "shifting": False,
        }
        recorder.emit_mark_sorted(pass_index=i - 1, aux=aux, finalized=finalized)
        while hole > 0:
            aux["hole_index"] = hole
            aux["shifting"] = True
            recorder.emit_compare(
                i=hole - 1,
                j=hole,
                aux=aux,
                active=(hole - 1, hole),
                finalized=finalized,
                left_value=arr[hole - 1],
                right_value=key,
            )
            # 升序：左侧元素更大就要右移；降序：左侧元素更小就要右移。
            if (arr[hole - 1] < key) if descending else (arr[hole - 1] > key):
                aux["hole_index"] = hole - 1
                arr[hole] = arr[hole - 1]
                recorder.emit_write_shift(
                    source=hole - 1, target=hole, aux=aux, site=0, finalized=finalized
                )
                hole -= 1
            else:
                break
        if hole != i:
            aux["hole_index"] = hole
            aux["shifting"] = False
            aux["sorted_to"] = i + 1
            arr[hole] = key
            recorder.emit_write_place(index=hole, aux=aux, site=1, finalized=list(range(i + 1)))
    done_pass = max(n - 2, 0)
    done_final = tuple(range(n))
    done_aux = {
        "pass_index": done_pass,
        "key_value": 0.0,
        "key_index": 0,
        "hole_index": 0,
        "sorted_to": n,
        "shifting": False,
    }
    recorder.emit_done(pass_index=done_pass, finalized=done_final, aux=done_aux)
    return arr
