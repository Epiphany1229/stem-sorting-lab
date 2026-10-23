import { PageHeader } from "../components/PageHeader";

/** 未知路径：给出明确标题与返回首页入口，不留空白页。 */
export default function NotFoundPage() {
  return (
    <div className="page-stack">
      <PageHeader
        titleKey="common.notFound.title"
        leadKey="common.notFound.body"
        backTo="/"
        backLabelKey="common.notFound.cta"
      />
    </div>
  );
}
