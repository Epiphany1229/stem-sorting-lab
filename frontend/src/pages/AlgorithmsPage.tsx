import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { BilingualText } from "../i18n/BilingualText";
import { algorithms } from "../data/algorithms";

/** 十种排序算法学习中心：列出全部 10 种，逐一标注状态，不隐藏未完成项。 */
export default function AlgorithmsPage() {
  return (
    <div className="page-stack">
      <PageHeader
        titleKey="algorithms.title"
        status="inDevelopment"
        leadKey="algorithms.lead"
      />

      <section className="rounded-card border border-border bg-primary-soft/60 p-5 sm:p-6">
        <BilingualText tkey="algorithms.note" size="sm" />
      </section>

      <section aria-labelledby="algorithm-list-title" className="space-y-4">
        <h2 id="algorithm-list-title">
          <BilingualText as="span" size="subtitle" tkey="algorithms.list.title" />
        </h2>
        <ul className="grid gap-4 md:grid-cols-2">
          {algorithms.map((algorithm, index) => (
            <li
              key={algorithm.id}
              id={`algorithm-${algorithm.id}`}
              className="rounded-card border border-border bg-surface p-5 shadow-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-1 font-mono text-xs text-ink-muted">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <BilingualText as="h3" size="subtitle" tkey={algorithm.nameKey} />
                    <p className="mt-1">
                      <BilingualText tkey={algorithm.descKey} size="sm" />
                    </p>
                  </div>
                </div>
                <StatusBadge status={algorithm.status} />
              </div>
              {algorithm.noteKey ? (
                <p className="mt-3 border-t border-border pt-3">
                  <BilingualText tkey={algorithm.noteKey} size="xs" />
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
