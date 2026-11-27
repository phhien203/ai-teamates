"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"

import {
  createGroupChat,
  deleteGroupChat,
  updateGroupChat,
} from "@/actions/chat"
import { ChatAvatar } from "@/components/chat-avatar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
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
import { showUpgradeToast } from "@/components/upgrade-toast"
import { insertGroupChatSchema, type InsertGroupChat } from "@/db/schema"
import { isUpgradeRequired } from "@/lib/billing"
import type { BotSummary } from "@/queries/bots"

type EditableGroupChat = InsertGroupChat & { id: string }

function defaultValues(chat?: EditableGroupChat): InsertGroupChat {
  return chat
    ? { name: chat.name, botIds: chat.botIds }
    : { name: "", botIds: [] }
}

/**
 * Creates a group chat from a name and two or more of the user's bots, or
 * edits `chat` when given one.
 */
export function GroupChatDialog({
  chat,
  botsPromise,
  children,
  open: openProp,
  onOpenChange,
}: {
  chat?: EditableGroupChat
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
    defaultValues: defaultValues(chat),
  })

  const { isSubmitting } = form.formState

  async function onSubmit(values: InsertGroupChat) {
    const result = chat
      ? await updateGroupChat(chat.id, values)
      : await createGroupChat(values)

    if (isUpgradeRequired(result)) {
      showUpgradeToast(router.push)
      return
    }
    if (!result.ok) {
      for (const [name, messages] of Object.entries(result.fieldErrors ?? {})) {
        form.setError(name as keyof InsertGroupChat, {
          message: messages?.[0],
        })
      }
      toast.add({ type: "error", title: result.error })
      return
    }

    toast.add({
      type: "success",
      title: chat ? `${values.name} is updated` : `${values.name} is ready`,
    })
    setOpen(false)
    form.reset(defaultValues(chat && { ...values, id: chat.id }))
    if ("id" in result) router.push(`/chats/${result.id}`)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) form.reset(defaultValues(chat))
      }}
    >
      {children && <DialogTrigger render={children} />}
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-6"
        >
          <DialogHeader>
            <DialogTitle>
              {chat ? "Edit group chat" : "New group chat"}
            </DialogTitle>
            <DialogDescription>
              {chat
                ? "Rename the group, or add and remove bots."
                : "Name the group and pick which bots are in it."}
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
            {chat && (
              <DeleteGroupChatButton
                chat={chat}
                onDeleted={() => {
                  setOpen(false)
                  router.push("/")
                }}
              />
            )}
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner data-icon="inline-start" />}
              {chat ? "Save changes" : "Create group"}
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

function DeleteGroupChatButton({
  chat,
  onDeleted,
}: {
  chat: EditableGroupChat
  onDeleted: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [isDeleting, startDeleting] = React.useTransition()

  function onConfirm() {
    startDeleting(async () => {
      const result = await deleteGroupChat(chat.id)

      if (!result.ok) {
        toast.add({ type: "error", title: result.error })
        return
      }

      toast.add({ type: "success", title: `${chat.name} was deleted` })
      setOpen(false)
      onDeleted()
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button type="button" variant="destructive" className="sm:mr-auto" />
        }
      >
        <Trash2Icon data-icon="inline-start" />
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {chat.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes the group chat and its messages. Its bots and their
            other chats stay. You can&apos;t undo this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            disabled={isDeleting}
            onClick={onConfirm}
          >
            {isDeleting && <Spinner data-icon="inline-start" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
