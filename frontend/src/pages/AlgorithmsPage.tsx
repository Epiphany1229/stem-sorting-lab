/**
 * 十种排序算法学习中心（阶段 5A）。
 *
 * 列表来自 GET /api/algorithms：10 项全部显示，可用项可进入学习页，
 * 开发中项保持可见但不可点击。加载失败时显示明确的双语错误与重试，
 * 不用本地静态数据冒充后端元数据。
 */
import { Link } from "react-router-dom";

import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { BilingualText } from "../i18n/BilingualText";
import { useAlgorithmList } from "../features/algorithms/api";
import { algorithmTextOf } from "../features/algorithms/i18n";
import type { AlgorithmMetadata } from "../features/algorithms/types";
import "../features/algorithms/algorithms.css";

function AlgorithmCard({
  metadata,
  index,
}: {
  readonly metadata: AlgorithmMetadata;
  readonly index: number;
}) {
  const available = metadata.status === "available";
  const availableLabel = algorithmTextOf("list.available");
  const plannedLabel = algorithmTextOf("list.planned");

  const body = (
    <>
      <div className="algo-card__head">
        <span aria-hidden="true" className="algo-card__index">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="algo-card__text">
          <h3 className="algo-card__name">
            <BilingualText
              as="span"
              size="subtitle"
              zh={metadata.name["zh-Hant"]}
              en={metadata.name.en}
            />
          </h3>
          <p className="algo-card__tagline">
            <BilingualText size="sm" zh={metadata.tagline["zh-Hant"]} en={metadata.tagline.en} />
          </p>
        </div>
        <StatusBadge status={available ? "available" : "inDevelopment"} />
      </div>
      <p className="algo-card__cta">
        {available ? (
          <BilingualText size="sm" zh={availableLabel["zh-Hant"]} en={availableLabel.en} />
        ) : (
          <BilingualText size="sm" zh={plannedLabel["zh-Hant"]} en={plannedLabel.en} />
        )}
      </p>
    </>
  );

  return (
    <li
      id={`algorithm-${metadata.id}`}
      className="algo-card-item"
      data-testid={`algorithm-item-${metadata.id}`}
      data-status={metadata.status}
    >
      {available ? (
        <Link
          to={`/algorithms/${metadata.id}`}
          className="algo-card algo-card--available"
          data-testid={`algorithm-link-${metadata.id}`}
        >
          {body}
        </Link>
      ) : (
        <div className="algo-card algo-card--planned" aria-disabled="true">
          {body}
        </div>
      )}
    </li>
  );
}

export default function AlgorithmsPage() {
  const listQuery = useAlgorithmList();
  const note = algorithmTextOf("list.note");
  const legend = algorithmTextOf("list.legend");
  const loading = algorithmTextOf("list.loading");
  const errorText = algorithmTextOf("list.error");
  const retry = algorithmTextOf("list.retry");

  return (
    <div className="page-stack">
      <PageHeader
        titleKey="algorithms.title"
        status="available"
        leadKey="algorithms.lead"
      />

      <section className="algo-intro" data-testid="algorithms-intro">
        <p>
          <BilingualText size="sm" zh={note["zh-Hant"]} en={note.en} />
        </p>
        <p className="algo-intro__legend">
          <BilingualText size="xs" zh={legend["zh-Hant"]} en={legend.en} />
        </p>
      </section>

      {listQuery.isPending ? (
        <section role="status" className="section-card" data-testid="algorithms-loading">
          <BilingualText size="sm" zh={loading["zh-Hant"]} en={loading.en} />
        </section>
      ) : listQuery.isError ? (
        <section role="alert" className="section-card" data-testid="algorithms-error">
          <h2>
            <BilingualText size="subtitle" zh={errorText["zh-Hant"]} en={errorText.en} />
          </h2>
          <button
            type="button"
            className="btn btn--secondary mt-4"
            onClick={() => {
              void listQuery.refetch();
            }}
          >
            <BilingualText as="span" size="sm" zh={retry["zh-Hant"]} en={retry.en} />
          </button>
        </section>
      ) : (
        <section aria-labelledby="algorithm-list-title" className="space-y-4">
          <h2 id="algorithm-list-title">
            <BilingualText as="span" size="subtitle" tkey="algorithms.list.title" />
          </h2>
          <ul className="algo-list" data-testid="algorithm-list">
            {listQuery.data.algorithms.map((metadata, index) => (
              <AlgorithmCard key={metadata.id} metadata={metadata} index={index} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
