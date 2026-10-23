import { DevelopmentNotice } from "../components/DevelopmentNotice";
import { PageHeader } from "../components/PageHeader";
import { PlannedSection } from "../components/PlannedSection";

/** 冒泡排序入门实验室（阶段 1 只有骨架与状态，不含排序逻辑）。 */
export default function LabPage() {
  return (
    <div className="page-stack">
      <PageHeader titleKey="lab.title" status="inDevelopment" leadKey="lab.lead" />
      <DevelopmentNotice />
      <PlannedSection
        itemKeys={["lab.planned.1", "lab.planned.2", "lab.planned.3", "lab.planned.4"]}
      />
    </div>
  );
}
