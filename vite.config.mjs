import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { studioPlugin } from "./server/runtime.mjs";
import { mcpBridge } from "./server/bridge.mjs";

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "127.0.0.1",
    fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.haggsfield/**", "**/mcp-assets/**"] },
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), mcpBridge(), studioPlugin()],
});
