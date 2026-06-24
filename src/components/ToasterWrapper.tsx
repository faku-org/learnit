import { Toaster } from "sonner";

export function ToasterWrapper() {
  return (
    <Toaster
      richColors
      theme="dark"
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--card)",
          border: "1px solid var(--border)",
          color: "var(--foreground)",
        },
      }}
    />
  );
}
