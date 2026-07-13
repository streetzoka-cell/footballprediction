import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    // VitePWA has been removed to prevent Workbox from caching live data
  ]
});