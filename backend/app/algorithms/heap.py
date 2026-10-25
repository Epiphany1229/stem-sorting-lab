"""堆排序：唯一可信源码（插桩调用与执行代码是同一份）。

二叉堆数组表示：先原地建堆，再反复把堆顶交换到末尾，并对新的堆顶执行下沉。
指标口径（docs/algorithms-design.md §3）：父子比较 +1；交换 swaps+1、writes+2。
"""

from __future__ import annotations

from collections.abc import Sequence

from backend.app.trace.recorder import NullRecorder, Tracer

# 未传入 tracer 时使用全空接收器，纯算法调用不产生轨迹开销。
_NULL_RECORDER: Tracer = NullRecorder()


def heap_sort(
    values: Sequence[float],
    direction: str = "asc",
    tracer: Tracer | None = None,
) -> list[float]:
    """堆排序：返回排序后的新列表，传入 tracer 时同步产生真实执行轨迹。"""
    recorder: Tracer = tracer if tracer is not None else _NULL_RECORDER
    arr = list(values)
    n = len(arr)
    descending = direction == "desc"
    finalized: list[int] = []

    def sift_down(root: int, size: int, phase: str) -> None:
        """把 root 位置的下沉到合适位置；升序建最大堆，降序建最小堆。"""
        current = root
        while True:
            left_child = 2 * current + 1
            right_child = left_child + 1
            parent_index = (current - 1) // 2 if current > 0 else -1
            aux = {
                "heap_size": size,
                "node_index": current,
                "parent_index": parent_index,
                "left_child": left_child,
                "right_child": right_child,
                "phase": phase,
            }
            best = current
            if left_child < size:
                recorder.emit_compare(
                    i=current,
                    j=left_child,
                    aux=aux,
                    active=(current, left_child),
                    finalized=finalized,
                    left_value=arr[current],
                    right_value=arr[left_child],
                )
                # 升序堆要找更大的孩子，降序堆要找更小的孩子。
                if (
                    (arr[left_child] < arr[best])
                    if descending
                    else (arr[left_child] > arr[best])
                ):
                    best = left_child
            if right_child < size:
                recorder.emit_compare(
                    i=best,
                    j=right_child,
                    aux=aux,
                    active=(best, right_child),
                    finalized=finalized,
                    left_value=arr[best],
                    right_value=arr[right_child],
                )
                if (
                    (arr[right_child] < arr[best])
                    if descending
                    else (arr[right_child] > arr[best])
                ):
                    best = right_child
            if best == current:
                break
            arr[current], arr[best] = arr[best], arr[current]
            aux["node_index"] = current
            aux["parent_index"] = parent_index
            recorder.emit_swap(i=current, j=best, aux=aux, site=0, finalized=finalized)
            current = best

    # 建堆：从最后一个非叶子结点向前依次下沉。
    for start in range(n // 2 - 1, -1, -1):
        sift_down(start, n, "build")
    # 逐次取堆顶放到末尾，并缩小堆后继续下沉。
    for end in range(n - 1, 0, -1):
        aux = {
            "heap_size": end + 1,
            "node_index": 0,
            "parent_index": -1,
            "left_child": 1 if end >= 2 else -1,
            "right_child": 2 if end >= 3 else -1,
            "phase": "extract",
        }
        recorder.emit_mark_sorted(
            pass_index=n - 1 - end, aux=aux, site=0, finalized=finalized
        )
        arr[0], arr[end] = arr[end], arr[0]
        aux["node_index"] = 0
        recorder.emit_swap(i=0, j=end, aux=aux, site=1, finalized=finalized)
        finalized.append(end)
        sift_down(0, end, "sift_down")
    done_pass = max(n - 2, 0)
    done_final = tuple(range(n))
    done_aux = {
        "heap_size": n,
        "node_index": 0,
        "parent_index": -1,
        "left_child": 1 if n >= 2 else -1,
        "right_child": 2 if n >= 3 else -1,
        "phase": "extract",
    }
    recorder.emit_done(pass_index=done_pass, finalized=done_final, aux=done_aux)
    return arr
