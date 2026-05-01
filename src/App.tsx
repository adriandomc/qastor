import { Button } from "@adc-ui/components";

export default function App() {
  return (
    <div
      style={{
        padding: "var(--adc-space-8)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--adc-space-5)",
        maxWidth: 720,
      }}
    >
      <h1 style={{ margin: 0 }}>qastor</h1>
      <p style={{ margin: 0, color: "var(--adc-fg-muted)" }}>
        Desktop app for executing manual E2E test cases with screenshot evidence.
      </p>
      <div style={{ display: "flex", gap: "var(--adc-space-3)" }}>
        <Button variant="primary">Hello from ADC</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
      </div>
    </div>
  );
}
