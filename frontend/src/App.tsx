import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";

import { queryClient } from "./api/client";
import { BilingualText } from "./i18n/BilingualText";
import AppLayout from "./layouts/AppLayout";
import HelpPage from "./pages/HelpPage";
import HomePage from "./pages/HomePage";
import NotFoundPage from "./pages/NotFoundPage";
import SourcesPage from "./pages/SourcesPage";

// 阶段 6：路由级代码分割。天气页依赖 Plotly（约 5MB），首屏不应加载它；
// 各重页面按路由懒加载，访问时才拉取对应 chunk。
const LabPage = lazy(() => import("./pages/LabPage"));
const WeatherPage = lazy(() => import("./pages/WeatherPage"));
const WeatherSortPage = lazy(() => import("./pages/WeatherSortPage"));
const AlgorithmsPage = lazy(() => import("./pages/AlgorithmsPage"));
const AlgorithmDetailPage = lazy(() => import("./pages/AlgorithmDetailPage"));

/** Suspense fallback：双语载入提示（繁中在上、英文在下），带 role=status。 */
export function RouteLoading() {
  return (
    <div className="section-card route-loading" role="status" data-testid="route-loading">
      <BilingualText tkey="common.routeLoading" />
    </div>
  );
}

/** 懒加载页面统一包一层 Suspense：导航与页脚保持可见，只替换主内容。 */
function LazyPage({ children }: { readonly children: ReactNode }) {
  return <Suspense fallback={<RouteLoading />}>{children}</Suspense>;
}

/**
 * 七个页面的路由表。AppLayout 作为父路由，提供导航、页脚与主内容容器。
 * BrowserRouter 放在 main.tsx / 测试里，方便用 MemoryRouter 单独验证路由。
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route
          path="lab"
          element={
            <LazyPage>
              <LabPage />
            </LazyPage>
          }
        />
        <Route
          path="weather"
          element={
            <LazyPage>
              <WeatherPage />
            </LazyPage>
          }
        />
        <Route
          path="weather-sort"
          element={
            <LazyPage>
              <WeatherSortPage />
            </LazyPage>
          }
        />
        <Route
          path="algorithms"
          element={
            <LazyPage>
              <AlgorithmsPage />
            </LazyPage>
          }
        />
        <Route
          path="algorithms/:id"
          element={
            <LazyPage>
              <AlgorithmDetailPage />
            </LazyPage>
          }
        />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
    </QueryClientProvider>
  );
}
