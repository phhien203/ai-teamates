"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { ShuffleIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { nanoid } from "nanoid"
import { Controller, useForm, useWatch } from "react-hook-form"

import { createBot, deleteBot, updateBot } from "@/actions/bot"
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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { toastBillingFailure } from "@/components/upgrade-toast"
import { insertBotSchema, type InsertBot } from "@/db/schema"

const TEMPLATES = [
  {
    label: "Research assistant",
    job: "Research assistant",
    instructions:
      "Answer briefly, cite sources, and ask before running anything destructive.",
  },
  {
    label: "Code reviewer",
    job: "Code reviewer",
    instructions:
      "Review diffs for bugs, security issues, and readability. Be specific and suggest fixes.",
  },
  {
    label: "Writing editor",
    job: "Writing editor",
    instructions:
      "Tighten prose, fix grammar, and keep the author's voice. Explain larger changes.",
  },
  {
    label: "Tutor",
    job: "Tutor",
    instructions:
      "Teach step by step, check understanding with questions, and avoid giving answers away too early.",
  },
] as const

type EditableBot = InsertBot & { id: string }

function defaultValues(bot?: EditableBot): InsertBot {
  if (bot) {
    return {
      name: bot.name,
      avatar: bot.avatar,
      job: bot.job,
      instructions: bot.instructions ?? "",
    }
  }
  return { name: "", avatar: nanoid(), job: "", instructions: "" }
}

/** Creates a new bot, or edits `bot` when given one. */
export function BotDialog({
  bot,
  children,
  open: openProp,
  onOpenChange,
}: {
  bot?: EditableBot
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

  const form = useForm<InsertBot>({
    resolver: zodResolver(insertBotSchema),
    defaultValues: defaultValues(bot),
  })

  const avatar = useWatch({ control: form.control, name: "avatar" })
  const { isSubmitting } = form.formState

  async function onSubmit(values: InsertBot) {
    const result = bot
      ? await updateBot(bot.id, values)
      : await createBot(values)

    if (toastBillingFailure(result, router.push)) return
    if (!result.ok) {
      for (const [name, messages] of Object.entries(result.fieldErrors ?? {})) {
        form.setError(name as keyof InsertBot, { message: messages?.[0] })
      }
      toast.add({ type: "error", title: result.error })
      return
    }

    toast.add({
      type: "success",
      title: bot ? `${values.name} is updated` : `${values.name} is ready`,
    })
    setOpen(false)
    form.reset(defaultValues(bot && { ...values, id: bot.id }))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) form.reset(defaultValues(bot))
      }}
    >
      {children && <DialogTrigger render={children} />}
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-6"
        >
          <DialogHeader>
            <DialogTitle>{bot ? "Edit bot" : "New bot"}</DialogTitle>
            <DialogDescription>
              {bot
                ? "Change its face, name, or how it does its job."
                : "Give it a face, a name, and a job to do."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((template) => (
              <Button
                key={template.label}
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => {
                  form.setValue("job", template.job, { shouldValidate: true })
                  form.setValue("instructions", template.instructions, {
                    shouldValidate: true,
                  })
                }}
              >
                {template.label}
              </Button>
            ))}
          </div>

          <FieldGroup>
            <Field orientation="horizontal">
              <ChatAvatar seed={avatar} animated className="size-12" />
              <FieldContent>
                <FieldTitle>Face</FieldTitle>
                <FieldDescription>
                  Shuffle until you find one you like.
                </FieldDescription>
              </FieldContent>
              <Button
                type="button"
                variant="outline"
                onClick={() => form.setValue("avatar", nanoid())}
              >
                <ShuffleIcon data-icon="inline-start" />
                Shuffle
              </Button>
            </Field>

            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="bot-name">Name</FieldLabel>
                  <Input
                    {...field}
                    id="bot-name"
                    placeholder="Ada"
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
              name="job"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="bot-job">Job</FieldLabel>
                  <Input
                    {...field}
                    id="bot-job"
                    placeholder="Research assistant"
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
              name="instructions"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="bot-instructions">
                    How it should work
                  </FieldLabel>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    id="bot-instructions"
                    placeholder="Answer briefly, cite sources, and ask before running anything destructive."
                    className="min-h-24"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>

          <DialogFooter>
            {bot && (
              <DeleteBotButton
                bot={bot}
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
              {bot ? "Save changes" : "Create bot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteBotButton({
  bot,
  onDeleted,
}: {
  bot: EditableBot
  onDeleted: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [isDeleting, startDeleting] = React.useTransition()

  function onConfirm() {
    startDeleting(async () => {
      const result = await deleteBot(bot.id)

      if (!result.ok) {
        toast.add({ type: "error", title: result.error })
        return
      }

      toast.add({ type: "success", title: `${bot.name} was deleted` })
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
          <AlertDialogTitle>Delete {bot.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes the bot and its chats. You can&apos;t undo this.
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
