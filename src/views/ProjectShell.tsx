import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@adc-ui/components";
import { ListChecks, LogOut, Settings as SettingsIcon, Workflow } from "lucide-react";
import { useCasesStore, useProjectStore } from "@/lib/store";
import { onCasesChanged } from "@/lib/events";
import { api } from "@/lib/tauri";
import { useTranslation } from "react-i18next";

export default function ProjectShell() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { current, currentPath, closeProject } = useProjectStore();
  const refresh = useCasesStore((s) => s.refresh);
  const clearCases = useCasesStore((s) => s.clear);
  const caseCount = useCasesStore((s) => s.cases.length);

  const NAV_ITEMS: Array<{ to: string; label: string; icon: React.ReactNode }> = [
    { to: "cases", label: t("projectShell.cases", "Casos"), icon: <ListChecks size={14} /> },
    { to: "sessions", label: t("projectShell.sessions", "Sesiones"), icon: <Workflow size={14} /> },
    { to: "settings", label: t("projectShell.settings", "Settings"), icon: <SettingsIcon size={14} /> },
  ];

  useEffect(() => {
    if (!current) navigate("/", { replace: true });
  }, [current, navigate]);

  useEffect(() => {
    if (!currentPath) return;
    let unlistenFn: (() => void) | null = null;
    let cancelled = false;
    refresh(currentPath);
    api.startWatch(currentPath).catch((e) => console.error("watcher failed", e));
    onCasesChanged(() => {
      if (!cancelled) refresh(currentPath);
    }).then((u) => {
      if (cancelled) u();
      else unlistenFn = u;
    });
    return () => {
      cancelled = true;
      api.stopWatch().catch(() => {});
      if (unlistenFn) unlistenFn();
    };
  }, [currentPath, refresh]);

  if (!current) return null;

  function handleClose() {
    api.stopWatch().catch(() => {});
    clearCases();
    closeProject();
    navigate("/", { replace: true });
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "260px minmax(0, 1fr)",
        height: "100dvh",
        overflow: "hidden",
      }}
    >
      <aside
        style={{
          height: "100dvh",
          boxSizing: "border-box",
          position: "sticky",
          top: 0,
          alignSelf: "start",
          padding: "var(--adc-space-5)",
          borderRight: "var(--adc-border-1)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--adc-space-5)",
          background: "var(--adc-bg-app)",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--adc-fs-md)", letterSpacing: "-0.01em" }}>
            {current.project_name}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "var(--adc-fs-xs)",
              color: "var(--adc-fg-muted-strong)",
              wordBreak: "break-all",
            }}
          >
            {currentPath}
          </p>
        </div>

        <div className="adc-nav" style={{ flex: 1 }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `adc-nav__item ${isActive ? "is-active" : ""}`}
              style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.to === "cases" && caseCount > 0 && (
                <span className="adc-nav__count">{caseCount}</span>
              )}
            </NavLink>
          ))}
        </div>

        <Button
          variant="ghost"
          onClick={handleClose}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            justifyContent: "center",
          }}
        >
          <LogOut size={14} /> {t("projectShell.closeProject", "Cerrar proyecto")}
        </Button>
      </aside>

      <div style={{ minWidth: 0, minHeight: 0, overflow: "auto" }}>
        <Outlet />
      </div>
    </div>
  );
}
