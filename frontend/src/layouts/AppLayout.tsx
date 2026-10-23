import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { BilingualText } from "../i18n/BilingualText";
import { en, zh } from "../i18n/dictionary";
import { cn } from "../lib/utils";
import { navItems } from "../navigation";

function NavList() {
  return (
    <ul className="flex flex-col gap-1 md:flex-row md:items-center md:gap-0.5">
      {navItems.map((item) => (
        <li key={item.path}>
          <NavLink to={item.path} end={item.path === "/"} className="nav-link">
            <BilingualText tkey={item.navKey} size="xs" />
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * 全站布局：顶部导航（手机可折叠）+ 主内容区 + 页脚署名。
 * 所有文案走 i18n 字典，中文在上、英文在下。
 */
export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // 路由变化后收起手机导航，避免遮挡内容。
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // 浏览器标签标题也保持双语；标签只有一行，因此用竖线分隔。
  useEffect(() => {
    const current = navItems.find((item) => item.path === pathname);
    const titleKey = current?.titleKey ?? "common.notFound.title";
    document.title = `${zh(titleKey)}｜${en(titleKey)}`;
  }, [pathname]);

  return (
    <div id="top" className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-chip focus:border focus:border-primary focus:bg-surface focus:px-4 focus:py-2 focus:shadow-raised"
      >
        <BilingualText tkey="site.skipToMain" size="sm" />
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-canvas/95 backdrop-blur supports-[backdrop-filter]:bg-canvas/80">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 py-3">
            <Link to="/" className="flex items-center gap-3 rounded-chip">
              <span
                aria-hidden="true"
                className="grid h-9 w-9 place-items-center rounded-chip bg-primary font-mono text-xs font-bold text-white"
              >
                Py
              </span>
              <BilingualText tkey="site.name" size="sm" />
            </Link>

            <nav aria-label={zh("nav.primaryLabel")} className="hidden md:block">
              <NavList />
            </nav>

            <button
              type="button"
              className="btn btn--secondary md:hidden"
              aria-expanded={menuOpen}
              aria-controls="site-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span aria-hidden="true" className="w-4 text-center">
                {menuOpen ? "✕" : "☰"}
              </span>
              <BilingualText tkey={menuOpen ? "nav.closeMenu" : "nav.openMenu"} size="sm" />
            </button>
          </div>

          <div id="site-nav" className={cn("pb-3 md:hidden", menuOpen ? "block" : "hidden")}>
            <nav aria-label={zh("nav.primaryLabel")}>
              <NavList />
            </nav>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:py-12">
        <Outlet />
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <BilingualText tkey="site.name" size="sm" />
              <BilingualText tkey="footer.disclaimer" size="xs" />
            </div>
            <div className="space-y-2 sm:justify-self-end">
              <BilingualText tkey="footer.attribution" size="xs" />
              <BilingualText tkey="footer.license" size="xs" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
