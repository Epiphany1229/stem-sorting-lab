/**
 * 算法事实面板：时间/空间复杂度、稳定性、适用条件。
 * 所有内容来自 GET /api/algorithms 的元数据，保证与后端实现一致。
 */
import { BilingualText } from "../../i18n/BilingualText";
import { algorithmTextOf, formatAlgorithmText } from "./i18n";
import type { AlgorithmMetadata } from "./types";

export interface AlgorithmMetaPanelProps {
  readonly metadata: AlgorithmMetadata;
}

export function AlgorithmMetaPanel({ metadata }: AlgorithmMetaPanelProps) {
  const title = algorithmTextOf("detail.metaTitle");
  const stableLabel =
    metadata.stable === null
      ? algorithmTextOf("meta.stableUnknown")
      : metadata.stable
        ? algorithmTextOf("meta.stableYes")
        : algorithmTextOf("meta.stableNo");
  const defaultText = formatAlgorithmText("detail.defaultValues", {
    values: metadata.default_values.join(", "),
  });

  return (
    <section className="algo-meta section-card" aria-labelledby="algorithm-meta-title" data-testid="algorithm-meta">
      <h2 id="algorithm-meta-title">
        <BilingualText as="span" size="subtitle" zh={title["zh-Hant"]} en={title.en} />
      </h2>
      <dl className="algo-meta__grid">
        <div data-testid="meta-time">
          <dt>
            <BilingualText
              size="xs"
              zh={algorithmTextOf("meta.time")["zh-Hant"]}
              en={algorithmTextOf("meta.time").en}
            />
          </dt>
          <dd>
            <BilingualText
              size="sm"
              zh={metadata.time_complexity["zh-Hant"]}
              en={metadata.time_complexity.en}
            />
          </dd>
        </div>
        <div data-testid="meta-space">
          <dt>
            <BilingualText
              size="xs"
              zh={algorithmTextOf("meta.space")["zh-Hant"]}
              en={algorithmTextOf("meta.space").en}
            />
          </dt>
          <dd>
            <BilingualText
              size="sm"
              zh={metadata.space_complexity["zh-Hant"]}
              en={metadata.space_complexity.en}
            />
          </dd>
        </div>
        <div data-testid="meta-stable">
          <dt>
            <BilingualText
              size="xs"
              zh={algorithmTextOf("meta.stable")["zh-Hant"]}
              en={algorithmTextOf("meta.stable").en}
            />
          </dt>
          <dd>
            <BilingualText size="sm" zh={stableLabel["zh-Hant"]} en={stableLabel.en} />
          </dd>
        </div>
        <div data-testid="meta-use-cases">
          <dt>
            <BilingualText
              size="xs"
              zh={algorithmTextOf("meta.useCases")["zh-Hant"]}
              en={algorithmTextOf("meta.useCases").en}
            />
          </dt>
          <dd>
            <BilingualText
              size="sm"
              zh={metadata.use_cases["zh-Hant"]}
              en={metadata.use_cases.en}
            />
          </dd>
        </div>
      </dl>
      {metadata.default_values.length > 0 ? (
        <p className="algo-meta__defaults" data-testid="meta-defaults">
          <BilingualText size="xs" zh={defaultText["zh-Hant"]} en={defaultText.en} />
        </p>
      ) : null}
    </section>
  );
}
