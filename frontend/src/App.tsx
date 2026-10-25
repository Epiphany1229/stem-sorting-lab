import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";

import { queryClient } from "./api/client";
import AppLayout from "./layouts/AppLayout";
import AlgorithmDetailPage from "./pages/AlgorithmDetailPage";
import AlgorithmsPage from "./pages/AlgorithmsPage";
import HelpPage from "./pages/HelpPage";
import HomePage from "./pages/HomePage";
import LabPage from "./pages/LabPage";
import NotFoundPage from "./pages/NotFoundPage";
import SourcesPage from "./pages/SourcesPage";
import WeatherPage from "./pages/WeatherPage";
import WeatherSortPage from "./pages/WeatherSortPage";

/**
 * 七个页面的路由表。AppLayout 作为父路由，提供导航、页脚与主内容容器。
 * BrowserRouter 放在 main.tsx / 测试里，方便用 MemoryRouter 单独验证路由。
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="lab" element={<LabPage />} />
        <Route path="weather" element={<WeatherPage />} />
        <Route path="weather-sort" element={<WeatherSortPage />} />
        <Route path="algorithms" element={<AlgorithmsPage />} />
        <Route path="algorithms/:id" element={<AlgorithmDetailPage />} />
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
