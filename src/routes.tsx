import { createMemoryRouter, Navigate } from "react-router-dom";
import Welcome from "@/views/Welcome";
import ProjectShell from "@/views/ProjectShell";
import CaseList from "@/views/CaseList";
import CaseDetail from "@/views/CaseDetail";
import CaseEditor from "@/views/CaseEditor";
import SessionRunner from "@/views/SessionRunner";
import SessionsHistory from "@/views/SessionsHistory";
import Settings from "@/views/Settings";

export const router = createMemoryRouter(
  [
    { path: "/", element: <Welcome /> },
    {
      path: "/project",
      element: <ProjectShell />,
      children: [
        { index: true, element: <Navigate to="cases" replace /> },
        { path: "cases", element: <CaseList /> },
        { path: "cases/new", element: <CaseEditor /> },
        { path: "cases/:caseId", element: <CaseDetail /> },
        { path: "cases/:caseId/edit", element: <CaseEditor /> },
        { path: "sessions", element: <SessionsHistory /> },
        { path: "settings", element: <Settings /> },
      ],
    },
    { path: "/session", element: <SessionRunner /> },
  ],
  { initialEntries: ["/"] },
);
