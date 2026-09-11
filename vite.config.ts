import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    fs: {
      deny: [".env", ".env.*", "**/.data/**", "**/.git/**", "**/*.{crt,pem}"],
    },
  },
});
