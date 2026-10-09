import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => {
  const buildId =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    `local-${Date.now()}`;

  return {
    server: {
      host: "::",
      port: 8080,
    },
    define: {
      "import.meta.env.VITE_BUILD_ID": JSON.stringify(buildId),
    },
    plugins: [
      react(),
      {
        name: "ursora-build-version",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "version.json",
            source: JSON.stringify({ buildId }),
          });
        },
      },
    ].filter(Boolean),
    resolve: {
      alias: {
        "@/lib/api": path.resolve(__dirname, "./src/lib/api-v59.ts"),
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
