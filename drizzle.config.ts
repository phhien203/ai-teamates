import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    // Direct (non-pooled) connection for schema push
    url: process.env.DATABASE_URL_UNPOOLED!,
  },
});
