"""归并排序：唯一可信源码（插桩调用与执行代码是同一份）。

递归对半拆分，再把两个有序半区合并到辅助缓冲区，最后回拷到主数组。
指标口径（docs/algorithms-design.md §3）：左右头比较 +1；swaps 恒为 0；
写入辅助数组 +1、回拷 +1（均计入 writes）。
"""

from __future__ import annotations

from collections.abc import Sequence

from backend.app.trace.recorder import NullRecorder, Tracer

# 未传入 tracer 时使用全空接收器，纯算法调用不产生轨迹开销。
_NULL_RECORDER: Tracer = NullRecorder()


def merge_sort(
    values: Sequence[float],
    direction: str = "asc",
    tracer: Tracer | None = None,
) -> list[float]:
    """归并排序：返回排序后的新列表，传入 tracer 时同步产生真实执行轨迹。"""
    recorder: Tracer = tracer if tracer is not None else _NULL_RECORDER
    arr = list(values)
    n = len(arr)
    descending = direction == "desc"
    buffer_values: list[float] = [0.0] * n
    buffer_ids: list[str] = [""] * n

    def merge_range(left: int, right: int, depth: int) -> None:
        """递归拆分 [left, right]，再把两半合并回主数组。"""
        if left >= right:
            return
        mid = (left + right) // 2
        merge_range(left, mid, depth + 1)
        merge_range(mid + 1, right, depth + 1)
        left_ptr = left
        right_ptr = mid + 1
        buffer_index = 0
        aux = {
            "left": left,
            "mid": mid,
            "right": right,
            "depth": depth,
            "left_ptr": left_ptr,
            "right_ptr": right_ptr,
            "buffer": [],
            "buffer_index": 0,
            "writing_back": False,
        }
        merged = False
        while left_ptr <= mid or right_ptr <= right:
            if not merged:
                recorder.emit_merge(aux=aux, active=(left, right), finalized=[])
                merged = True
            take_left = True
            if left_ptr <= mid and right_ptr <= right:
                recorder.emit_compare(
                    i=left_ptr,
                    j=right_ptr,
                    aux=aux,
                    active=(left_ptr, right_ptr),
                    finalized=[],
                    left_value=arr[left_ptr],
                    right_value=arr[right_ptr],
                )
                # 升序：右侧更小就先取右侧；降序：右侧更大就先取右侧。
                # 相等时取左侧，保证归并排序的稳定性。
                if (
                    (arr[right_ptr] > arr[left_ptr])
                    if descending
                    else (arr[right_ptr] < arr[left_ptr])
                ):
                    take_left = False
            if take_left and left_ptr <= mid:
                next_value = arr[left_ptr]
                next_id = recorder.item_id_at(left_ptr)
                left_ptr += 1
            else:
                next_value = arr[right_ptr]
                next_id = recorder.item_id_at(right_ptr)
                right_ptr += 1
            aux["left_ptr"] = left_ptr
            aux["right_ptr"] = right_ptr
            aux["buffer_index"] = buffer_index
            buffer_slice = buffer_ids[:buffer_index] + [next_id]
            buffer_values[buffer_index] = next_value
            buffer_ids[buffer_index] = next_id
            recorder.emit_write_buffer(
                aux=aux, buffer=buffer_slice, site=0, finalized=[]
            )
            buffer_index += 1
        aux["writing_back"] = True
        aux["buffer"] = buffer_ids[:buffer_index]
        for offset in range(buffer_index):
            aux["buffer_index"] = offset
            arr[left + offset] = buffer_values[offset]
            recorder.emit_write_assign(
                index=left + offset,
                item_id=buffer_ids[offset],
                aux=aux,
                site=1,
                finalized=[],
            )

    if n >= 2:
        merge_range(0, n - 1, 0)
    done_final = tuple(range(n))
    done_aux = {
        "left": 0,
        "mid": n // 2,
        "right": n - 1,
        "depth": 0,
        "left_ptr": 0,
        "right_ptr": 0,
        "buffer": [],
        "buffer_index": 0,
        "writing_back": False,
    }
    recorder.emit_done(pass_index=0, finalized=done_final, aux=done_aux)
    return arr
