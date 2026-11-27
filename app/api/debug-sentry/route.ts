// TEMPORARY: Sentry production verification route — delete after confirming.
export const dynamic = "force-dynamic"

export function GET() {
  throw new Error("Sentry production test error 1795801129")
}
