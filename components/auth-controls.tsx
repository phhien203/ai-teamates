import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs"
import { Suspense } from "react"

import { Button } from "@/components/ui/button"

export function AuthControls() {
  return (
    <Suspense>
      <Show when="signed-out">
        <SignInButton>
          <Button variant="ghost" size="sm">
            Sign in
          </Button>
        </SignInButton>
        <SignUpButton>
          <Button size="sm">Sign up</Button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </Suspense>
  )
}
