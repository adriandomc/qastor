import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "@adc-ui/fonts.css";
import "@adc-ui/tokens.css";
import "@adc-ui/components.css";
import "./i18n";
import { router } from "@/routes";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
