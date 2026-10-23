/**
 * DSH 沙箱兼容补丁（阶段 1 构建工具链需要，功能代码不依赖它）。
 *
 * 背景：当前沙箱禁止通过管道 stdio 派生子进程，任何 child_process.exec 都会
 * 同步抛出 EPERM。Vite 在 Windows 上首次解析路径时，会执行一次 `net use`
 * 来探测网络驱动器（只是优化，不影响真实路径解析）。这里把该探测降级为
 * “失败回调”，让构建继续；其余命令仍走原始实现。
 *
 * 用法：node --require ./scripts/sandbox-guard.cjs node_modules/vite/bin/vite.js build
 */
const childProcess = require("node:child_process");

const originalExec = childProcess.exec;

childProcess.exec = function execWithSandboxFallback(command, options, callback) {
  try {
    return originalExec.call(this, command, options, callback);
  } catch (error) {
    const onDone = typeof options === "function" ? options : callback;

    if (typeof onDone === "function") {
      process.nextTick(() => onDone(error));
    }

    // 返回一个最小可用的 ChildProcess 形状，避免调用方立刻访问属性时崩溃。
    return { on() {}, once() {}, kill() {}, stdout: null, stderr: null, pid: undefined };
  }
};
