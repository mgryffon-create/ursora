import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    {
      name: 'ursora-tradecycle-5-9',
      enforce: 'pre',
      transform(code, id) {
        if (id.endsWith('OpportunitiesView.tsx') || id.endsWith('ThesisView.tsx')) {
          return code.replaceAll('tradecycle-5.8.0', 'tradecycle-5.9.0');
        }
        return null;
      },
    },
  ].filter(Boolean),
  resolve: {
    alias: {
      "@/lib/api": path.resolve(__dirname, "./src/lib/api-v59.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
