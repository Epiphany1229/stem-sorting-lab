import { DevelopmentNotice } from "../components/DevelopmentNotice";
import { PageHeader } from "../components/PageHeader";
import { PlannedSection } from "../components/PlannedSection";

/** 香港天气数据探索（阶段 1 不接天气数据，也不实现图表）。 */
export default function WeatherPage() {
  return (
    <div className="page-stack">
      <PageHeader titleKey="weather.title" status="inDevelopment" leadKey="weather.lead" />
      <DevelopmentNotice />
      <PlannedSection
        itemKeys={[
          "weather.planned.1",
          "weather.planned.2",
          "weather.planned.3",
          "weather.planned.4",
          "weather.planned.5",
        ]}
      />
    </div>
  );
}
