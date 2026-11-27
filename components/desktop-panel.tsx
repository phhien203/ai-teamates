"use client"

import { useEffect, useRef, useState } from "react"
import type RFB from "@novnc/novnc"
import { MaximizeIcon } from "lucide-react"
import { useRouter } from "next/navigation"

import { getChatDesktopUrl } from "@/actions/chat"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { showUpgradeToast } from "@/components/upgrade-toast"
import { isUpgradeRequired } from "@/lib/billing"
import { cn } from "cn"

type DesktopState =
  | { status: "idle" | "loading" }
  | { status: "connecting" | "connected"; url: string }
  | { status: "error"; error: string }

/**
 * Live VNC view of the bot's sandbox desktop. Clicking the preview opens it
 * fullscreen in a dialog.
 *
 * The noVNC client runs in this page and talks to the sandbox over a
 * WebSocket (no iframe of Daytona's vnc.html, which would hit Daytona's
 * preview warning page). There is exactly one VNC connection, shared by the
 * panel and the dialog: fullscreen only re-positions the screen (CSS `fixed`)
 * over the dialog's body instead of reconnecting.
 */
export function DesktopPanel({ chatId }: { chatId: string }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const rfbRef = useRef<RFB | null>(null)
  const [desktop, setDesktop] = useState<DesktopState>({ status: "idle" })
  const [fullscreen, setFullscreen] = useState(false)
  const router = useRouter()

  async function load() {
    setDesktop({ status: "loading" })
    const result = await getChatDesktopUrl(chatId)
    if (isUpgradeRequired(result)) showUpgradeToast(router.push)
    setDesktop(
      result.ok
        ? { status: "connecting", url: result.url }
        : { status: "error", error: result.error }
    )
  }

  // The panel starts collapsed: only start the sandbox desktop the first time
  // the panel is actually opened.
  useEffect(() => {
    const root = rootRef.current
    if (!root || desktop.status !== "idle") return
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) {
        observer.disconnect()
        void load()
      }
    })
    observer.observe(root)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop.status])

  // One VNC connection per URL. noVNC touches browser APIs at import time, so
  // it's loaded on the client only.
  const url = "url" in desktop ? desktop.url : null
  useEffect(() => {
    const screen = screenRef.current
    if (!url || !screen) return
    let rfb: RFB | null = null
    let cancelled = false

    void import("@novnc/novnc").then(({ default: RFB }) => {
      if (cancelled) return
      rfb = new RFB(screen, url)
      rfb.scaleViewport = true
      rfb.viewOnly = true
      rfb.background = "transparent"
      rfb.addEventListener("connect", () =>
        setDesktop({ status: "connected", url })
      )
      rfb.addEventListener("disconnect", () => {
        if (cancelled) return // our own cleanup below
        rfbRef.current = null
        setFullscreen(false)
        setDesktop({ status: "error", error: "The desktop disconnected." })
      })
      rfbRef.current = rfb
    })

    return () => {
      cancelled = true
      rfbRef.current = null
      rfb?.disconnect()
    }
  }, [url])

  // Input is only accepted fullscreen; the panel is a click-to-open preview.
  useEffect(() => {
    if (rfbRef.current) rfbRef.current.viewOnly = !fullscreen
  }, [fullscreen, desktop.status])

  return (
    <div ref={rootRef} className="flex h-full flex-col p-2">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10">
        {url && (
          <div
            ref={screenRef}
            className={cn(
              fullscreen
                ? // Matches the dialog body below: inset-4 popup, h-12 title bar.
                  "fixed inset-x-4 top-16 bottom-4 z-[51] overflow-hidden rounded-b-xl bg-black"
                : "absolute inset-0"
            )}
          />
        )}

        {desktop.status === "connected" && !fullscreen && (
          <button
            type="button"
            aria-label="Open desktop fullscreen"
            onClick={() => setFullscreen(true)}
            className="group absolute inset-0 flex cursor-zoom-in items-start justify-end p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="rounded-md bg-background/80 p-1 text-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <MaximizeIcon className="size-4" />
            </span>
          </button>
        )}

        {desktop.status === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
            <p>{desktop.error}</p>
            <Button type="button" size="sm" variant="outline" onClick={load}>
              Retry
            </Button>
          </div>
        ) : (
          desktop.status !== "connected" && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Starting desktop…
            </div>
          )
        )}
      </div>

      <Dialog
        open={fullscreen}
        // Only the close button closes it: Escape, outside presses, and focus
        // moving into the VNC screen must never dismiss a live session.
        disablePointerDismissal
        onOpenChange={(open, details) => {
          if (!open && details.reason !== "close-press") {
            details.cancel()
            return
          }
          setFullscreen(open)
        }}
        onOpenChangeComplete={(open) => {
          if (open) rfbRef.current?.focus()
        }}
      >
        <DialogContent className="inset-4 flex w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 p-0 sm:max-w-none">
          <div className="flex h-12 shrink-0 items-center border-b px-4">
            <DialogTitle>Desktop</DialogTitle>
          </div>
          {/* The shared VNC screen is positioned over this area. */}
          <div className="flex-1" />
        </DialogContent>
      </Dialog>
    </div>
  )
}
