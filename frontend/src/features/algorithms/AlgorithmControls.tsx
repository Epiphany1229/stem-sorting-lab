/**
 * 算法学习页的输入控件：随机小数列、自定义数列、升降序、提前结束。
 *
 * 所有变化都会成为新的轨迹查询条件，从而让播放器回到 idle；
 * 输入校验只检查数据格式，不推导排序结果。
 */
import { useId, useState } from "react";

import { BilingualText } from "../../i18n/BilingualText";
import type { Direction } from "../../player/types";
import { algorithmTextOf, formatAlgorithmText, type AlgorithmTextKey } from "./i18n";
import { generateRandomValues, parseAlgorithmValues } from "./inputValues";
import type { AlgorithmMetadata } from "./types";

export interface AlgorithmControlsProps {
  readonly metadata: AlgorithmMetadata;
  readonly values: readonly number[];
  readonly direction: Direction;
  readonly earlyExit: boolean;
  readonly onValuesChange: (values: number[]) => void;
  readonly onDirectionChange: (direction: Direction) => void;
  readonly onEarlyExitChange: (earlyExit: boolean) => void;
}

export function AlgorithmControls({
  metadata,
  values,
  direction,
  earlyExit,
  onValuesChange,
  onDirectionChange,
  onEarlyExitChange,
}: AlgorithmControlsProps) {
  const [customText, setCustomText] = useState("");
  const [errorKey, setErrorKey] = useState<AlgorithmTextKey | null>(null);
  const inputId = useId();
  const hintId = useId();

  const applyRandom = () => {
    setErrorKey(null);
    onValuesChange(generateRandomValues(values.length));
  };

  const applyCustom = () => {
    const result = parseAlgorithmValues(customText, { allowDecimal: true });
    if (!result.ok) {
      setErrorKey(result.reason);
      return;
    }
    setErrorKey(null);
    onValuesChange(result.values);
  };

  const currentText = formatAlgorithmText("controls.current", {
    values: values.join(", "),
  });
  const title = algorithmTextOf("controls.title");

  return (
    <section className="algo-controls section-card" aria-labelledby="algorithm-controls-title" data-testid="algorithm-controls">
      <h2 id="algorithm-controls-title">
        <BilingualText as="span" size="subtitle" zh={title["zh-Hant"]} en={title.en} />
      </h2>

      <div className="algo-controls__grid">
        <div className="algo-controls__field">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn--primary" onClick={applyRandom}>
              <BilingualText
                as="span"
                size="sm"
                tone="onPrimary"
                zh={algorithmTextOf("controls.random")["zh-Hant"]}
                en={algorithmTextOf("controls.random").en}
              />
            </button>
            <p className="algo-controls__current" data-testid="current-values">
              <BilingualText size="xs" zh={currentText["zh-Hant"]} en={currentText.en} />
            </p>
          </div>

          <div className="algo-controls__custom">
            <label htmlFor={inputId}>
              <BilingualText
                as="span"
                size="sm"
                zh={algorithmTextOf("controls.custom")["zh-Hant"]}
                en={algorithmTextOf("controls.custom").en}
              />
            </label>
            <div className="algo-controls__custom-row">
              <input
                id={inputId}
                type="text"
                autoComplete="off"
                className="lab-input-field"
                placeholder="5, 3, 8, 1"
                value={customText}
                aria-describedby={hintId}
                aria-invalid={errorKey !== null}
                onChange={(event) => setCustomText(event.target.value)}
              />
              <button type="button" className="btn btn--secondary" onClick={applyCustom}>
                <BilingualText
                  as="span"
                  size="sm"
                  zh={algorithmTextOf("controls.apply")["zh-Hant"]}
                  en={algorithmTextOf("controls.apply").en}
                />
              </button>
            </div>
            <p id={hintId} className="algo-controls__hint">
              <BilingualText
                size="xs"
                zh={algorithmTextOf("controls.customHint")["zh-Hant"]}
                en={algorithmTextOf("controls.customHint").en}
              />
            </p>
            {errorKey ? (
              <p role="alert" className="algo-controls__error" data-testid="values-error">
                <BilingualText
                  size="xs"
                  zh={algorithmTextOf(errorKey)["zh-Hant"]}
                  en={algorithmTextOf(errorKey).en}
                />
              </p>
            ) : null}
          </div>
        </div>

        <div className="algo-controls__field">
          <fieldset>
            <legend>
              <BilingualText as="span" size="sm" tkey="lab.direction.title" />
            </legend>
            <div className="algo-controls__options">
              {(["asc", "desc"] as const).map((option) => (
                <label key={option} className="algo-controls__option">
                  <input
                    type="radio"
                    name="algorithm-direction"
                    value={option}
                    checked={direction === option}
                    onChange={() => onDirectionChange(option)}
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

          {metadata.supports_early_exit ? (
            <div className="algo-controls__early-exit">
              <label className="algo-controls__option">
                <input
                  type="checkbox"
                  checked={earlyExit}
                  onChange={(event) => onEarlyExitChange(event.target.checked)}
                />
                <BilingualText as="span" size="sm" tkey="lab.earlyExit" />
              </label>
              <p className="algo-controls__hint">
                <BilingualText size="xs" tkey="lab.earlyExit.hint" />
              </p>
            </div>
          ) : null}

          <p className="algo-controls__hint" data-testid="reset-hint">
            <BilingualText
              size="xs"
              zh={algorithmTextOf("controls.resetHint")["zh-Hant"]}
              en={algorithmTextOf("controls.resetHint").en}
            />
          </p>
        </div>
      </div>
    </section>
  );
}
