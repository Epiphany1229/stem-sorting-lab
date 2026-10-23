/**
 * Python 代码面板：用 prism-react-renderer 渲染后端返回的 code.lines。
 *
 * - 高亮只由当前事件的 code_line_ids（行组）驱动，前端不判断「现在执行到哪一行」；
 * - 插桩行（kind: "trace"）默认降淡，可切换突出显示；行号始终来自 line.lineno，
 *   不会因为折叠/降淡而漂移；
 * - 自动滚动只发生在代码容器内部，不影响整页滚动。
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Highlight, themes } from "prism-react-renderer";

import { cn } from "../lib/utils";
import { BilingualText } from "../i18n/BilingualText";
import { formatTranslation, zh } from "../i18n/dictionary";
import type { CodeBlock } from "./types";

interface CodePanelProps {
  readonly code: CodeBlock;
  readonly highlightedLineIds: readonly string[];
  readonly reducedMotion?: boolean;
}

export function CodePanel({ code, highlightedLineIds, reducedMotion = false }: CodePanelProps) {
  const [showTraceLines, setShowTraceLines] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const highlighted = useMemo(() => new Set(highlightedLineIds), [highlightedLineIds]);
  const highlightKey = highlightedLineIds.join("|");
  // 行号来自后端源码的真实行号；这里只用 text 拼出源码，行 id 与行号一一对应。
  const sourceText = useMemo(() => code.lines.map((line) => line.text).join("\n"), [code.lines]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    const target = container.querySelector<HTMLElement>('[data-highlighted="true"]');
    if (!target) {
      return;
    }
    const targetTop = target.offsetTop;
    const targetHeight = target.offsetHeight;
    const visibleTop = container.scrollTop;
    const visibleBottom = container.scrollTop + container.clientHeight;
    // 只在目标行离开可视区时滚动容器本身，绝不调用 scrollIntoView 滚动整页。
    if (targetTop < visibleTop || targetTop + targetHeight > visibleBottom) {
      container.scrollTop = Math.max(0, targetTop - (container.clientHeight - targetHeight) / 2);
    }
  }, [highlightKey, showTraceLines]);

  return (
    <section aria-labelledby={titleId} data-reduced-motion={reducedMotion ? "true" : "false"}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId}>
          <BilingualText as="span" size="subtitle" tkey="player.code.title" />
        </h2>
        <button
          type="button"
          className="btn btn--secondary"
          aria-pressed={showTraceLines}
          onClick={() => setShowTraceLines((current) => !current)}
        >
          <BilingualText
            as="span"
            size="sm"
            tkey={showTraceLines ? "code.trace.hide" : "code.trace.show"}
          />
        </button>
      </div>

      <div className="code-panel__scroll" ref={scrollRef} data-testid="code-scroll">
        <Highlight theme={themes.github} code={sourceText} language="python">
          {({ tokens, getTokenProps }) => (
            <pre className="code-panel__pre" aria-label={zh("player.code.title")}>
              <code className="code-panel__code">
                {code.lines.map((line, index) => {
                  const isHighlighted = highlighted.has(line.line_id);
                  const isTrace = line.kind === "trace";
                  const isDimmed = isTrace && !showTraceLines && !isHighlighted;
                  const tokenLine = tokens[index] ?? [];

                  return (
                    <span
                      key={line.line_id}
                      className={cn(
                        "code-panel__line",
                        isTrace && "code-panel__line--trace",
                        isDimmed && "code-panel__line--dimmed",
                        isHighlighted && "code-panel__line--highlighted",
                      )}
                      data-line-id={line.line_id}
                      data-line-no={line.lineno}
                      data-trace={isTrace ? "true" : "false"}
                      data-dimmed={isDimmed ? "true" : "false"}
                      data-highlighted={isHighlighted ? "true" : "false"}
                      aria-current={isHighlighted ? "step" : undefined}
                    >
                      <span className="code-panel__lineno" aria-hidden="true">
                        {line.lineno}
                      </span>
                      <span className="code-panel__source">
                        {tokenLine.length > 0
                          ? tokenLine.map((token, tokenIndex) => {
                              const tokenProps = getTokenProps({ token });
                              return (
                                <span
                                  key={`${line.line_id}-${tokenIndex}`}
                                  className={tokenProps.className}
                                  style={tokenProps.style}
                                >
                                  {token.content}
                                </span>
                              );
                            })
                          : line.text}
                      </span>
                    </span>
                  );
                })}
              </code>
            </pre>
          )}
        </Highlight>
      </div>

      <p className="mt-2 text-sm text-ink-muted">
        <BilingualText size="xs" tkey="code.trace.note" />
      </p>
      <p className="sr-only" data-testid="code-highlight-summary">
        {highlightedLineIds.length > 0
          ? formatTranslation("player.code.highlightSummary", {
              lines: highlightedLineIds.join("、"),
            })["zh-Hant"]
          : ""}
      </p>
    </section>
  );
}
