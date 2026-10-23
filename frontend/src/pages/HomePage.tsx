import { Link } from "react-router-dom";

import { BackLink } from "../components/BackLink";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { StatusBadge } from "../components/StatusBadge";
import { BilingualText } from "../i18n/BilingualText";
import type { TranslationKey } from "../i18n/dictionary";
import { directoryItems } from "../navigation";

interface PathStep {
  key: TranslationKey;
  to?: string;
}

/** 首页展示的推荐学习路径：认识比较与交换 → 学习冒泡排序 → ... */
const pathSteps: readonly PathStep[] = [
  { key: "home.path.step1" },
  { key: "home.path.step2", to: "/lab" },
  { key: "home.path.step3", to: "/weather" },
  { key: "home.path.step4", to: "/weather-sort" },
  { key: "home.path.step5", to: "/algorithms" },
];

/** 首页与学习目录：主视觉 + 学习路径 + 七页导航入口 + 本阶段范围说明。 */
export default function HomePage() {
  return (
    <div className="page-stack page-stack--loose">
      <section
        aria-labelledby="home-title"
        className="relative overflow-hidden rounded-panel border border-border bg-surface-raised shadow-raised"
      >
        {/* 装饰性背景，不承载信息，对屏幕阅读器隐藏 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft via-surface to-compare-soft"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full border border-primary/15 bg-primary/5"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-28 -left-12 h-60 w-60 rounded-full border border-compare/20 bg-compare/5"
        />

        <div className="relative grid gap-8 p-5 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
          <div className="space-y-5">
            <Breadcrumbs currentKey="home.title" />
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <BilingualText as="h1" size="title" tkey="home.title" id="home-title" />
              <StatusBadge status="available" />
            </div>
            <p className="max-w-xl">
              <BilingualText tkey="site.tagline" />
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/lab" className="btn btn--primary">
                <BilingualText tkey="home.cta.start" size="sm" tone="onPrimary" />
              </Link>
              <Link to="/algorithms" className="btn btn--secondary">
                <BilingualText tkey="home.cta.algorithms" size="sm" />
              </Link>
            </div>
            <BackLink href="#top" labelKey="back.toTop" />
          </div>

          <div className="rounded-card border border-border bg-surface/85 p-5 backdrop-blur-sm">
            <BilingualText as="h2" size="subtitle" tkey="home.path.title" />
            <p className="mt-2">
              <BilingualText tkey="home.path.lead" size="sm" />
            </p>
            <ol className="mt-4 space-y-2">
              {pathSteps.map((step, index) => {
                const label = <BilingualText tkey={step.key} size="sm" />;
                return (
                  <li key={step.key} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-primary/40 bg-surface font-mono text-xs text-primary-strong"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {step.to ? (
                      <Link to={step.to} className="rounded-chip underline-offset-4 hover:underline">
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </section>

      <section aria-labelledby="home-directory-title" className="space-y-4">
        <div>
          <BilingualText as="h2" size="title" tkey="home.directory.title" id="home-directory-title" />
        </div>
        <p className="max-w-3xl">
          <BilingualText tkey="home.directory.lead" />
        </p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {directoryItems.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                className="group flex h-full flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-raised"
              >
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                  <BilingualText as="h3" size="subtitle" tkey={item.titleKey} />
                  <StatusBadge status={item.status} />
                </div>
                {item.descriptionKey ? (
                  <p>
                    <BilingualText tkey={item.descriptionKey} size="sm" />
                  </p>
                ) : null}
                <span className="mt-auto inline-flex items-center gap-2 pt-2">
                  <BilingualText tkey="home.card.view" size="xs" />
                  <span aria-hidden="true" className="transition group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="home-scope-title"
        className="rounded-card border border-border bg-surface p-5 shadow-card sm:p-6"
      >
        <BilingualText as="h2" size="subtitle" tkey="home.scope.title" id="home-scope-title" />
        <p className="mt-2 max-w-3xl">
          <BilingualText tkey="home.scope.body" />
        </p>
      </section>
    </div>
  );
}
