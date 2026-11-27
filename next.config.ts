import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs/config"

const nextConfig: NextConfig = {
  devIndicators: false,
}

export default withSentryConfig(nextConfig, {
  org: "home-z70",
  project: "ai-teamates",

  // Source map upload auth token
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload a wider set of client source files for better stack trace resolution
  widenClientFileUpload: true,

  // Suppress non-CI output
  silent: !process.env.CI,
})
