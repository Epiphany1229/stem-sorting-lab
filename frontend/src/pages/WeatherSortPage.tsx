import { DevelopmentNotice } from "../components/DevelopmentNotice";
import { PageHeader } from "../components/PageHeader";
import { PlannedSection } from "../components/PlannedSection";

/** 用排序理解最近一个月的气温（阶段 4 才实现，阶段 1 只有骨架）。 */
export default function WeatherSortPage() {
  return (
    <div className="page-stack">
      <PageHeader titleKey="weatherSort.title" status="inDevelopment" leadKey="weatherSort.lead" />
      <DevelopmentNotice />
      <PlannedSection
        itemKeys={[
          "weatherSort.planned.1",
          "weatherSort.planned.2",
          "weatherSort.planned.3",
          "weatherSort.planned.4",
          "weatherSort.planned.5",
        ]}
      />
    </div>
  );
}
