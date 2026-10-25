/**
 * 算法学习页 /algorithms/:id（阶段 5A）。
 *
 * - 元数据（一句话解释、复杂度、稳定性、适用条件）来自 GET /api/algorithms；
 * - 轨迹来自 POST /api/algorithms/{id}/trace，前端不做任何排序推导；
 * - 播放器、Python 高亮、内联比较区直接复用阶段 2 的 TracePlayer；
 * - 六种比较类算法在播放器柱图卡片内额外渲染专属辅助视觉（renderAux）。
 */
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { BilingualText } from "../i18n/BilingualText";
import { StatusBadge } from "../components/StatusBadge";
import { TracePlayer } from "../player/TracePlayer";
import type { PlayerPassMetricOverride } from "../player/TracePlayer";
import { traceErrorKey } from "../player/useTrace";
import type { Direction, TraceEvent, TraceState } from "../player/types";
import NotFoundPage from "./NotFoundPage";
import { AlgorithmControls } from "../features/algorithms/AlgorithmControls";
import { AlgorithmMetaPanel } from "../features/algorithms/AlgorithmMetaPanel";
import { toPlayerTrace, useAlgorithmList, useAlgorithmTrace } from "../features/algorithms/api";
import { AuxPanel, hasAuxVisual } from "../features/algorithms/auxiliary/AuxPanel";
import {
  algorithmTextOf,
  practiceByAlgorithm,
  zhAlgorithmText,
} from "../features/algorithms/i18n";
import {
  defaultValuesFrom,
  FALLBACK_VALUES,
} from "../features/algorithms/inputValues";
import type {
  AlgorithmMetadata,
  AlgorithmTraceEvent,
  ImplementedAlgorithmId,
} from "../features/algorithms/types";
import "../features/algorithms/algorithms.css";

/* ---------- 页头 ---------- */

function DetailHeader({ metadata }: { readonly metadata: AlgorithmMetadata }) {
  const name = metadata.name;
  return (
    <header className="page-stack">
      <nav aria-label={zhAlgorithmText("detail.breadcrumbLabel")}>
        <ol className="algo-breadcrumbs">
          <li>
            <Link to="/">{algorithmTextOf("detail.home")["zh-Hant"]}</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link to="/algorithms">{algorithmTextOf("detail.center")["zh-Hant"]}</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <span aria-current="page">{name["zh-Hant"]}</span>
          </li>
        </ol>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <h1 className="algo-detail__title">
          <BilingualText as="span" size="title" zh={name["zh-Hant"]} en={name.en} />
        </h1>
        <StatusBadge status={metadata.status === "available" ? "available" : "inDevelopment"} />
      </div>

      <p className="max-w-3xl">
        <BilingualText size="body" zh={metadata.tagline["zh-Hant"]} en={metadata.tagline.en} />
      </p>

      <Link to="/algorithms" className="algo-back-link">
        <span aria-hidden="true">←</span>
        <BilingualText
          as="span"
          size="sm"
          zh={algorithmTextOf("detail.back")["zh-Hant"]}
          en={algorithmTextOf("detail.back").en}
        />
      </Link>
    </header>
  );
}

/* ---------- 页外状态（加载/错误） ---------- */

function DetailStatePage({ error }: { readonly error: boolean }) {
  const key = error ? "detail.error" : "detail.loading";
  const text = algorithmTextOf(key);
  return (
    <div className="page-stack">
      <h1 className="algo-detail__title">
        <BilingualText as="span" size="title" zh={text["zh-Hant"]} en={text.en} />
      </h1>
      <Link to="/algorithms" className="algo-back-link">
        <span aria-hidden="true">←</span>
        <BilingualText
          as="span"
          size="sm"
          zh={algorithmTextOf("detail.back")["zh-Hant"]}
          en={algorithmTextOf("detail.back").en}
        />
      </Link>
    </div>
  );
}

/* ---------- 小练习 ---------- */

function AlgorithmPractice({ algorithmId }: { readonly algorithmId: ImplementedAlgorithmId }) {
  const practice = practiceByAlgorithm[algorithmId];
  const title = algorithmTextOf("detail.practiceTitle");
  const prompt = algorithmTextOf("detail.practicePrompt");
  const reveal = algorithmTextOf("detail.practiceReveal");
  return (
    <section className="section-card algo-practice" aria-labelledby="algorithm-practice-title" data-testid="algorithm-practice">
      <h2 id="algorithm-practice-title">
        <BilingualText as="span" size="subtitle" zh={title["zh-Hant"]} en={title.en} />
      </h2>
      <p className="algo-practice__prompt">
        <BilingualText size="sm" zh={prompt["zh-Hant"]} en={prompt.en} />
      </p>
      <p className="algo-practice__question" data-testid="practice-question">
        <BilingualText
          size="body"
          zh={practice.question["zh-Hant"]}
          en={practice.question.en}
        />
      </p>
      <details className="algo-practice__details" data-testid="practice-details">
        <summary>
          <BilingualText size="sm" zh={reveal["zh-Hant"]} en={reveal.en} />
        </summary>
        <div className="algo-practice__answer" data-testid="practice-answer">
          <BilingualText
            size="sm"
            zh={practice.answer["zh-Hant"]}
            en={practice.answer.en}
          />
        </div>
      </details>
    </section>
  );
}

/* ---------- 学习视图（已实现算法） ---------- */

function AlgorithmLearningView({ metadata }: { readonly metadata: AlgorithmMetadata }) {
  const algorithmId = metadata.id as ImplementedAlgorithmId;
  const initialValues = defaultValuesFrom(metadata.default_values);
  const [values, setValues] = useState<number[]>(
    initialValues.length > 0 ? initialValues : [...FALLBACK_VALUES],
  );
  const [direction, setDirection] = useState<Direction>("asc");
  const [earlyExit, setEarlyExit] = useState(true);

  const options = useMemo<Readonly<Record<string, unknown>>>(
    () => (metadata.supports_early_exit ? { early_exit: earlyExit } : {}),
    [metadata.supports_early_exit, earlyExit],
  );

  const traceQuery = useAlgorithmTrace(algorithmId, { values, direction, options }, true);
  const traceData = traceQuery.data;
  // 播放器按 trace 对象身份重置；这里 memo 化，避免每次渲染都重置播放进度。
  const playerTrace = useMemo(
    () => (traceData ? toPlayerTrace(traceData) : null),
    [traceData],
  );

  const sourceNote = algorithmTextOf("detail.sourceNote");
  const notReady = algorithmTextOf("trace.notReady");
  const errorTitle = algorithmTextOf("detail.error");
  const retry = algorithmTextOf("detail.retry");

  const renderAux = useMemo(
    () =>
      ({ event, state }: { event: TraceEvent | null; state: TraceState }) => {
        if (!hasAuxVisual(algorithmId) || !traceData) {
          return null;
        }
        return (
          <AuxPanel
            algorithm={algorithmId}
            event={event as unknown as AlgorithmTraceEvent | null}
            state={state}
            items={traceData.items}
          />
        );
      },
    [algorithmId, traceData],
  );

  // 契約補充：归并没有 mark_sorted（passes=0），「輪次」改用 merge 事件累计条数；
  // 其他算法优先显示当前 pass_index+1，没有该字段时回退到后端 summary.passes。
  const passMetric = useMemo<PlayerPassMetricOverride>(() => {
    if (algorithmId === "merge") {
      return {
        label: algorithmTextOf("merge.steps"),
        compute: (event) => {
          if (!event || !traceData) {
            return null;
          }
          return traceData.events.filter(
            (candidate) => candidate.event_type === "merge" && candidate.step_id <= event.step_id,
          ).length;
        },
      };
    }
    return {
      label: algorithmTextOf("aux.pass"),
      compute: (event) => {
        const passIndex = event?.auxiliary_state.pass_index;
        if (typeof passIndex === "number") {
          return passIndex + 1;
        }
        return traceData?.summary.passes ?? null;
      },
    };
  }, [algorithmId, traceData]);

  return (
    <div className="page-stack">
      <DetailHeader metadata={metadata} />

      <p className="algo-source-note">
        <BilingualText size="xs" zh={sourceNote["zh-Hant"]} en={sourceNote.en} />
      </p>

      <AlgorithmMetaPanel metadata={metadata} />

      <AlgorithmControls
        metadata={metadata}
        values={values}
        direction={direction}
        earlyExit={earlyExit}
        allowDecimal={algorithmId !== "bubble"}
        onValuesChange={setValues}
        onDirectionChange={setDirection}
        onEarlyExitChange={setEarlyExit}
      />

      {traceQuery.isPending ? (
        <section role="status" className="section-card" data-testid="algorithm-trace-loading">
          <BilingualText
            size="sm"
            zh={algorithmTextOf("detail.loading")["zh-Hant"]}
            en={algorithmTextOf("detail.loading").en}
          />
        </section>
      ) : traceQuery.isError ? (
        <section role="alert" className="section-card" data-testid="algorithm-trace-error">
          <h2>
            <BilingualText size="subtitle" zh={errorTitle["zh-Hant"]} en={errorTitle.en} />
          </h2>
          <p className="mt-2">
            <BilingualText tkey={traceErrorKey(traceQuery.error)} />
          </p>
          <button
            type="button"
            className="btn btn--secondary mt-4"
            onClick={() => {
              void traceQuery.refetch();
            }}
          >
            <BilingualText as="span" size="sm" zh={retry["zh-Hant"]} en={retry.en} />
          </button>
        </section>
      ) : playerTrace ? (
        <TracePlayer trace={playerTrace} inlinePrompt renderAux={renderAux} passMetric={passMetric} />
      ) : (
        <section className="section-card">
          <BilingualText size="sm" zh={notReady["zh-Hant"]} en={notReady.en} />
        </section>
      )}

      <AlgorithmPractice algorithmId={algorithmId} />
    </div>
  );
}

/* ---------- 路由页面 ---------- */

export default function AlgorithmDetailPage() {
  const { id } = useParams();
  const listQuery = useAlgorithmList();

  if (listQuery.isPending) {
    return <DetailStatePage error={false} />;
  }

  if (listQuery.isError) {
    return (
      <div className="page-stack">
        <DetailStatePage error />
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            void listQuery.refetch();
          }}
        >
          <BilingualText
            as="span"
            size="sm"
            zh={algorithmTextOf("detail.retry")["zh-Hant"]}
            en={algorithmTextOf("detail.retry").en}
          />
        </button>
      </div>
    );
  }

  // 产品收敛后目录只有 7 种比较类排序；任何其他 id（含 counting/bucket/radix）
  // 一律走 404，不显示「開發中」占位。
  const metadata = listQuery.data.algorithms.find((algorithm) => algorithm.id === id);
  if (!metadata) {
    return <NotFoundPage />;
  }

  return <AlgorithmLearningView key={metadata.id} metadata={metadata} />;
}
