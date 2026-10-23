/**
 * 重新抓取：受后端冷却/预算/熔断约束；按钮显示冷却剩余时间，失败原因双语展示。
 * 前端不做任何"绕过冷却"的尝试，也不自动重试。
 */
import { useEffect, useState } from "react";

import { BilingualText } from "../../i18n/BilingualText";
import { formatTranslation } from "../../i18n/dictionary";
import { useWeatherRefresh, weatherErrorKey } from "./api";
import { formatTimestamp, secondsUntil, weatherReasonKey } from "./transform";

export interface RefreshControlProps {
  readonly onRefreshed: () => void;
}

export function RefreshControl({ onRefreshed }: RefreshControlProps) {
  const mutation = useWeatherRefresh();
  const [cooldownIso, setCooldownIso] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!cooldownIso) {
      return;
    }
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [cooldownIso]);

  const remainingSeconds = cooldownIso ? secondsUntil(cooldownIso, nowMs) : 0;
  const result = mutation.data;
  const cooldownText = cooldownIso
    ? formatTranslation("weather.refresh.cooldown", {
        seconds: remainingSeconds,
        time: formatTimestamp(cooldownIso),
      })
    : null;
  const acceptedText = result
    ? formatTranslation("weather.refresh.accepted", {
        requests: result.requests_made,
        rows: result.rows_upserted,
      })
    : null;
  const budgetText = result
    ? formatTranslation("weather.refresh.remainingBudget", { budget: result.remaining_budget })
    : null;

  const handleRefresh = () => {
    mutation.mutate(undefined, {
      onSuccess: (data) => {
        setCooldownIso(data.next_allowed_at);
        if (data.accepted) {
          onRefreshed();
        }
      },
    });
  };

  return (
    <section className="weather-panel" aria-labelledby="weather-refresh-heading" data-testid="refresh-control">
      <h2 id="weather-refresh-heading">
        <BilingualText as="span" size="subtitle" tkey="weather.refresh.title" />
      </h2>

      <div className="weather-refresh">
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleRefresh}
          disabled={mutation.isPending || remainingSeconds > 0}
        >
          <BilingualText
            as="span"
            size="sm"
            tone="onPrimary"
            tkey={mutation.isPending ? "weather.refresh.pending" : "weather.refresh.button"}
          />
        </button>

        <p className="weather-controls__hint">
          <BilingualText size="xs" tkey="weather.refresh.hint" />
        </p>

        {remainingSeconds > 0 && cooldownText ? (
          <p className="weather-refresh__cooldown" data-testid="refresh-cooldown" role="status">
            <BilingualText
              size="xs"
              zh={cooldownText["zh-Hant"]}
              en={cooldownText.en}
            />
          </p>
        ) : null}

        {result ? (
          <div className="weather-refresh__result" data-testid="refresh-result" role="status">
            {result.accepted && acceptedText ? (
              <p className="weather-refresh__accepted">
                <BilingualText size="xs" zh={acceptedText["zh-Hant"]} en={acceptedText.en} />
              </p>
            ) : (
              <>
                <p>
                  <BilingualText size="xs" tkey="weather.refresh.rejected" />
                </p>
                {result.reason ? (
                  <p>
                    <BilingualText size="xs" tkey={weatherReasonKey(result.reason)} />
                    {" ("}
                    <code>{result.reason}</code>
                    {")"}
                  </p>
                ) : null}
              </>
            )}
            {budgetText ? (
              <p>
                <BilingualText size="xs" zh={budgetText["zh-Hant"]} en={budgetText.en} />
              </p>
            ) : null}
          </div>
        ) : null}

        {mutation.isError ? (
          <div role="alert" className="weather-alert" data-testid="refresh-error">
            <p>
              <BilingualText size="xs" tkey="weather.refresh.failed" />
            </p>
            <p>
              <BilingualText size="xs" tkey={weatherErrorKey(mutation.error)} />
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
