"""冒泡排序：唯一可信源码。

学生看到的代码就是这里被真实执行的代码：轨迹插桩 ``recorder.emit_*`` 直接写在
函数体里，展示时按行号标记为 trace 行，不存在第二份“教学版”源码。
"""

from __future__ import annotations

from collections.abc import Sequence

from backend.app.trace.recorder import NullRecorder, Tracer

# 未传入 tracer 时使用全空接收器：纯算法调用不产生任何轨迹数据结构。
_NULL_RECORDER: Tracer = NullRecorder()


def bubble_sort(
    values: Sequence[float],
    direction: str = "asc",
    early_exit: bool = True,
    tracer: Tracer | None = None,
) -> list[float]:
    """冒泡排序：返回排序后的新列表，传入 tracer 时同步产生真实执行轨迹。"""
    recorder: Tracer = tracer if tracer is not None else _NULL_RECORDER
    arr = list(values)
    n = len(arr)
    descending = direction == "desc"
    passes = 0
    for i in range(n - 1):
        # 进入新一轮：上一轮冒泡到末尾的元素已经确定最终位置。
        recorder.emit_mark_sorted(pass_index=i)
        passes += 1
        swapped = False
        for j in range(n - 1 - i):
            # 先记录“即将比较”，此时数组还没有任何变化。
            recorder.emit_compare(i=j, j=j + 1, pass_index=i)
            # 升序：左 > 右 才交换；降序：左 < 右 才交换。
            if (arr[j] < arr[j + 1]) if descending else (arr[j] > arr[j + 1]):
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                # 交换赋值之后记录，才能拿到真实的前后状态。
                recorder.emit_swap(i=j, j=j + 1, pass_index=i)
                swapped = True
        if early_exit and not swapped:
            break
    # 只有“还有轮次没跑就退出”才算提前结束；最后一轮自然退出不算。
    early_stop = early_exit and passes < n - 1
    recorder.emit_done(pass_index=passes - 1, triggered=early_stop, finalized=tuple(range(n)))
    return arr
