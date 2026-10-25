import { useState } from "react";

import { BilingualText } from "../i18n/BilingualText";
import { formatTranslation, type TranslationKey } from "../i18n/dictionary";
import { PageHeader } from "../components/PageHeader";
import { generateRandomValues, parseCustomValues } from "../player/inputValues";
import { TracePlayer } from "../player/TracePlayer";
import { traceErrorKey, useTrace } from "../player/useTrace";
import type { Direction } from "../player/types";

/**
 * 冒泡排序入门实验室。
 *
 * 页面只负责「输入参数 + 展示后端轨迹」：随机/自定义数列、方向与 early_exit
 * 都原样提交给后端；动画、代码高亮与步骤解释全部来自 /algorithms/bubble/trace。
 * 阶段 4.7 起比较互动统一在代码面板下方的内联区，不再有引导模式弹窗。
 * 后端不可用时显示明确的错误提示，绝不退回假数据。
 */
export default function LabPage() {
  const [values, setValues] = useState<number[]>(() => generateRandomValues());
  const [direction, setDirection] = useState<Direction>("asc");
  const [earlyExit, setEarlyExit] = useState(true);
  const [customText, setCustomText] = useState("");
  const [inputErrorKey, setInputErrorKey] = useState<TranslationKey | null>(null);

  const traceQuery = useTrace({ values, direction, earlyExit });
  const trace = traceQuery.data;
  const isEmptyTrace = trace !== undefined && trace.events.length === 0;

  const applyRandomValues = () => {
    setInputErrorKey(null);
    setValues(generateRandomValues());
  };

  const applyCustomValues = () => {
    const result = parseCustomValues(customText);
    if (!result.ok) {
      setInputErrorKey(result.reason);
      return;
    }
    setInputErrorKey(null);
    setValues(result.values);
  };

  const currentValues = formatTranslation("lab.currentValues", {
    values: values.join(", "),
  });

  return (
    <div className="page-stack">
      <PageHeader titleKey="lab.title" leadKey="lab.lead" />

      <section aria-labelledby="lab-input-title" className="section-card">
        <h2 id="lab-input-title">
          <BilingualText as="span" size="subtitle" tkey="lab.input.title" />
        </h2>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="flex flex-wrap items-start gap-3">
              <button type="button" className="btn btn--primary" onClick={applyRandomValues}>
                <BilingualText as="span" size="sm" tone="onPrimary" tkey="lab.input.random" />
              </button>
            </div>

            <div>
              <label htmlFor="lab-custom-values">
                <BilingualText as="span" size="sm" tkey="lab.input.customLabel" />
              </label>
              <div className="mt-2 flex flex-wrap items-stretch gap-2">
                <input
                  id="lab-custom-values"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  className="lab-input-field"
                  placeholder="5, 3, 8, 1"
                  value={customText}
                  onChange={(changeEvent) => setCustomText(changeEvent.target.value)}
                  aria-describedby="lab-input-hint"
                />
                <button type="button" className="btn btn--secondary" onClick={applyCustomValues}>
                  <BilingualText as="span" size="sm" tkey="lab.input.apply" />
                </button>
              </div>
              <p id="lab-input-hint" className="mt-2 text-sm">
                <BilingualText size="xs" tkey="lab.input.hint" />
              </p>
              {inputErrorKey ? (
                <p role="alert" className="mt-2 rounded-chip bg-swap-soft p-2 text-sm">
                  <BilingualText size="xs" tkey={inputErrorKey} />
                </p>
              ) : null}
              <p className="mt-2" data-testid="current-values">
                <BilingualText size="xs" zh={currentValues["zh-Hant"]} en={currentValues.en} />
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <fieldset>
              <legend>
                <BilingualText as="span" size="sm" tkey="lab.direction.title" />
              </legend>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
                {(["asc", "desc"] as const).map((option) => (
                  <label key={option} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="lab-direction"
                      value={option}
                      checked={direction === option}
                      onChange={() => setDirection(option)}
                    />
                    <BilingualText
                      as="span"
                      size="sm"
                      tkey={option === "asc" ? "lab.direction.asc" : "lab.direction.desc"}
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={earlyExit}
                  onChange={(changeEvent) => setEarlyExit(changeEvent.target.checked)}
                />
                <BilingualText as="span" size="sm" tkey="lab.earlyExit" />
              </label>
              <p className="mt-1 text-sm">
                <BilingualText size="xs" tkey="lab.earlyExit.hint" />
              </p>
            </div>
          </div>
        </div>
      </section>

      <p className="section-lead">
        <BilingualText size="xs" tkey="player.sourceNote" />
      </p>

      {traceQuery.isPending ? (
        <section
          role="status"
          className="section-card"
          data-testid="trace-loading"
        >
          <BilingualText tkey="trace.loading" />
        </section>
      ) : null}

      {traceQuery.isError ? (
        <section
          role="alert"
          aria-labelledby="trace-error-title"
          className="section-card border-l-4 border-l-swap bg-swap-soft/40"
          data-testid="trace-error"
        >
          <h2 id="trace-error-title">
            <BilingualText as="span" size="subtitle" tkey="trace.error.title" />
          </h2>
          <div className="mt-2 max-w-3xl">
            <BilingualText tkey={traceErrorKey(traceQuery.error)} />
          </div>
          <button
            type="button"
            className="btn btn--secondary mt-4"
            onClick={() => {
              void traceQuery.refetch();
            }}
          >
            <BilingualText as="span" size="sm" tkey="trace.retry" />
          </button>
        </section>
      ) : null}

      {isEmptyTrace ? (
        <section role="alert" className="section-card">
          <BilingualText tkey="trace.empty" />
        </section>
      ) : null}

      {trace && !isEmptyTrace ? <TracePlayer trace={trace} inlinePrompt /> : null}
    </div>
  );
}
