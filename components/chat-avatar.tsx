import Image from "next/image"
import { Avatar, Style } from "@dicebear/core"
import gaze from "@dicebear/styles/gaze.json" with { type: "json" }

import { cn } from "@/lib/utils"

const style = new Style(gaze)

const SIZE = 32

type ChatAvatarProps = {
  seed: string
  animated?: boolean
  className?: string
}

export function ChatAvatar({
  seed,
  animated = false,
  className,
}: ChatAvatarProps) {
  const src = new Avatar(style, { seed, animation: animated }).toDataUri()

  return (
    <Image
      src={src}
      alt=""
      width={SIZE}
      height={SIZE}
      unoptimized
      className={cn("size-8 shrink-0 rounded-full", className)}
    />
  )
}
