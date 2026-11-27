"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"

import { createGroupChat } from "@/actions/chat"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { insertGroupChatSchema, type InsertGroupChat } from "@/db/schema"
import type { BotSummary } from "@/queries/bots"

const DEFAULT_VALUES: InsertGroupChat = { name: "", botIds: [] }

/** Creates a group chat from a name and two or more of the user's bots. */
export function GroupChatDialog({
  botsPromise,
  children,
  open: openProp,
  onOpenChange,
}: {
  botsPromise: Promise<BotSummary[]>
  children?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = openProp ?? uncontrolledOpen

  function setOpen(next: boolean) {
    if (openProp === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  const router = useRouter()

  const form = useForm<InsertGroupChat>({
    resolver: zodResolver(insertGroupChatSchema),
    defaultValues: DEFAULT_VALUES,
  })

  const { isSubmitting } = form.formState

  async function onSubmit(values: InsertGroupChat) {
    const result = await createGroupChat(values)

    if (!result.ok) {
      for (const [name, messages] of Object.entries(result.fieldErrors ?? {})) {
        form.setError(name as keyof InsertGroupChat, {
          message: messages?.[0],
        })
      }
      toast.add({ type: "error", title: result.error })
      return
    }

    toast.add({ type: "success", title: `${values.name} is ready` })
    setOpen(false)
    form.reset(DEFAULT_VALUES)
    router.push(`/chats/${result.id}`)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) form.reset(DEFAULT_VALUES)
      }}
    >
      {children && <DialogTrigger render={children} />}
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-6"
        >
          <DialogHeader>
            <DialogTitle>New group chat</DialogTitle>
            <DialogDescription>
              Name the group and pick which bots are in it.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="group-chat-name">Name</FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    id="group-chat-name"
                    placeholder="Weekend plans"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="botIds"
              control={form.control}
              render={({ field, fieldState }) => (
                <FieldSet data-invalid={fieldState.invalid}>
                  <FieldLegend variant="label">Bots</FieldLegend>
                  <React.Suspense fallback={<BotOptionsSkeleton />}>
                    <BotOptions
                      botsPromise={botsPromise}
                      value={field.value}
                      invalid={fieldState.invalid}
                      onChange={field.onChange}
                    />
                  </React.Suspense>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </FieldSet>
              )}
            />
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner data-icon="inline-start" />}
              Create group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function BotOptions({
  botsPromise,
  value,
  invalid,
  onChange,
}: {
  botsPromise: Promise<BotSummary[]>
  value: string[]
  invalid: boolean
  onChange: (value: string[]) => void
}) {
  const bots = React.use(botsPromise)

  if (bots.length < 2) {
    return (
      <FieldDescription>
        You need at least two bots to start a group chat.
      </FieldDescription>
    )
  }

  return (
    <div data-slot="checkbox-group" className="flex flex-col gap-3">
      {bots.map((bot) => (
        <Field key={bot.id} orientation="horizontal" data-invalid={invalid}>
          <Checkbox
            id={`group-chat-bot-${bot.id}`}
            checked={value.includes(bot.id)}
            aria-invalid={invalid}
            onCheckedChange={(checked) =>
              // Keep the bots in list order, whatever order they're ticked in.
              onChange(
                bots
                  .map((b) => b.id)
                  .filter((id) =>
                    id === bot.id ? checked : value.includes(id)
                  )
              )
            }
          />
          <FieldLabel
            htmlFor={`group-chat-bot-${bot.id}`}
            className="font-normal"
          >
            <ChatAvatar seed={bot.avatar} className="size-6" />
            {bot.name}
          </FieldLabel>
        </Field>
      ))}
    </div>
  )
}

function BotOptionsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-4 rounded-[4px]" />
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  )
}
