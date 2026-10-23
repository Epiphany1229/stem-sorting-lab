/**
 * CSV 导入：上传官方 CSV → 调 /api/weather/import → 展示逐行校验报告。
 * 成功/失败都明确提示，绝不静默；导入完成后通知页面切换到 mode=imported 读取。
 */
import { useState } from "react";
import type { FormEvent } from "react";

import { BilingualText } from "../../i18n/BilingualText";
import { formatTranslation, translate } from "../../i18n/dictionary";
import { useWeatherImport, weatherErrorKey } from "./api";
import { DataTable } from "./DataTable";
import type { DataTableColumn, DataTableRow } from "./DataTable";
import type { ImportResponse } from "./types";

export interface CsvImportProps {
  readonly onImported: (result: ImportResponse) => void;
}

export function CsvImport({ onImported }: CsvImportProps) {
  const mutation = useWeatherImport();
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<"weather.import.noFile" | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setLocalError("weather.import.noFile");
      return;
    }
    setLocalError(null);
    mutation.mutate(file, {
      onSuccess: (data) => {
        onImported(data);
      },
    });
  };

  const report = mutation.data;
  const formatLabel = report
    ? report.detected_format === "official_csv"
      ? translate("weather.import.format.official")
      : translate("weather.import.format.canonical")
    : null;
  const detectedText =
    report && formatLabel
      ? {
          zh: formatTranslation("weather.import.detectedFormat", {
            format: formatLabel["zh-Hant"],
          })["zh-Hant"],
          en: formatTranslation("weather.import.detectedFormat", { format: formatLabel.en }).en,
        }
      : null;
  const acceptedText = report
    ? formatTranslation("weather.import.acceptedRows", { count: report.accepted_rows })
    : null;
  const skippedText = report
    ? formatTranslation("weather.import.skippedRows", { count: report.skipped_rows })
    : null;

  const lineLabel = translate("weather.table.line");
  const reasonLabel = translate("weather.table.errorReason");
  const detailLabel = translate("weather.table.errorDetail");
  const errorColumns: DataTableColumn[] = [
    { key: "line", zh: lineLabel["zh-Hant"], en: lineLabel.en, numeric: true },
    { key: "reason", zh: reasonLabel["zh-Hant"], en: reasonLabel.en },
    { key: "detail", zh: detailLabel["zh-Hant"], en: detailLabel.en },
  ];
  const errorRows: DataTableRow[] = (report?.errors ?? []).map((error, index) => ({
    key: `${error.line}-${index}`,
    cells: [String(error.line), error.reason, error.detail ?? "—"],
  }));

  const errorsCountText = report
    ? formatTranslation("weather.import.errorsCount", { count: report.errors.length })
    : null;

  const fileLabel = translate("weather.import.fileLabel");

  return (
    <section className="weather-panel" aria-labelledby="weather-import-heading" data-testid="csv-import">
      <h2 id="weather-import-heading">
        <BilingualText as="span" size="subtitle" tkey="weather.import.title" />
      </h2>
      <p className="weather-panel__desc">
        <BilingualText size="xs" tkey="weather.import.desc" />
      </p>
      <p className="weather-panel__desc">
        <BilingualText size="xs" tkey="weather.import.modeHint" />
      </p>

      <form className="weather-import" onSubmit={handleSubmit}>
        <div className="weather-import__field">
          <label htmlFor="weather-csv-file">
            <BilingualText as="span" size="sm" tkey="weather.import.fileLabel" />
          </label>
          <input
            id="weather-csv-file"
            type="file"
            accept=".csv,text/csv"
            aria-label={fileLabel["zh-Hant"]}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setLocalError(null);
            }}
          />
        </div>
        <button
          type="submit"
          className="btn btn--primary"
          disabled={mutation.isPending}
          data-testid="import-submit"
        >
          <BilingualText
            as="span"
            size="sm"
            tone="onPrimary"
            tkey={mutation.isPending ? "weather.import.pending" : "weather.import.submit"}
          />
        </button>
      </form>

      {localError ? (
        <p role="alert" className="weather-controls__error" data-testid="import-local-error">
          <BilingualText size="xs" tkey={localError} />
        </p>
      ) : null}

      {mutation.isError ? (
        <div role="alert" className="weather-alert" data-testid="import-error">
          <p>
            <BilingualText size="xs" tkey="weather.import.failed" />
          </p>
          <p>
            <BilingualText size="xs" tkey={weatherErrorKey(mutation.error)} />
          </p>
        </div>
      ) : null}

      {report ? (
        <div className="weather-import__report" data-testid="import-report">
          <p className="weather-import__summary">
            {acceptedText ? (
              <BilingualText
                size="xs"
                zh={acceptedText["zh-Hant"]}
                en={acceptedText.en}
              />
            ) : null}
            {skippedText ? (
              <BilingualText size="xs" zh={skippedText["zh-Hant"]} en={skippedText.en} />
            ) : null}
            {detectedText ? (
              <BilingualText size="xs" zh={detectedText.zh} en={detectedText.en} />
            ) : null}
          </p>
          <p className="weather-import__success">
            <BilingualText size="xs" tkey="weather.import.success" />
          </p>

          <div className="weather-panel__block">
            <h3>
              <BilingualText as="span" size="sm" tkey="weather.import.errorsTitle" />
            </h3>
            <p data-testid="import-error-count">
              {errorsCountText ? (
                <BilingualText
                  size="xs"
                  zh={errorsCountText["zh-Hant"]}
                  en={errorsCountText.en}
                />
              ) : null}
            </p>
            <DataTable
              testId="import-errors-table"
              caption={formatTranslation("weather.table.importErrorsCaption", {})}
              columns={errorColumns}
              rows={errorRows}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
