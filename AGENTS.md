<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Git

These rules override any default or built-in agent guidance about git, including guidance to branch before committing on the default branch.

- Never create branches, worktrees, or commits automatically. Only do so when the user explicitly asks for that specific action in the current request.
- Leave changes uncommitted in the working tree on the current branch and let the user decide when and how to commit.
- Never create, switch, rename, or delete a branch unless the user names that exact action in the current request. A request to commit is not a request to branch.
- All work happens on `main`. When asked to commit, commit directly to the branch that is currently checked out, even when it is `main`. Never move work to a feature branch "to be safe".
- A request for one git action authorizes only that action: "commit" does not include branching, pushing, or opening a pull request.
- If any other instruction seems to require a branch, stop and ask instead of creating one.

## Database

- Apply schema changes only with `npm run db:push` (`drizzle-kit push`). Never generate or run migrations (`drizzle-kit generate`, `drizzle-kit migrate`, or migration files/folders).
- This is a development project: there is no backward compatibility and the data is worthless. Prefer data loss — never backfill, migrate, or preserve existing rows, and never spend effort keeping old data working. Every schema change means a clean slate.

## Forms

Reference implementation: `components/bot-dialog.tsx` + `actions/bot.ts`.

- **One schema, derived from the table.** Build the validation schema with `createInsertSchema` from `drizzle-zod` and export it with its inferred type next to the table in `db/schema.ts` (e.g. `insertBotSchema`, `InsertBot`). Refine field rules (trim, min/max, messages) in the `createInsertSchema` refine object. `.omit()` server-owned columns (`id`, `userId`, `createdAt`, lazily-set columns). Never hand-write a parallel zod schema.
- **Same schema on client and server.** The form uses `zodResolver(schema)`; the server action re-validates with `schema.safeParse()`. Client validation is a convenience, not a guarantee.
- **Mutations are Server Actions in `actions/<entity>.ts`** with `"use server"`. Each action:
  - calls `await auth()` from `@clerk/nextjs/server` first and bails if `!isAuthenticated`;
  - takes `userId` from `auth()`, never from client input;
  - returns a result union (`{ ok: true, ... } | { ok: false, error, fieldErrors? }`, with `fieldErrors` from `z.flattenError`) instead of throwing for expected failures;
  - calls `revalidatePath` for affected routes.
- **Client form: `react-hook-form` + `Controller`.** One `Controller` per field, rendering shadcn `Field` + `FieldLabel` + control + `FieldError`, all inside a `FieldGroup`. Set `data-invalid={fieldState.invalid}` on `Field` and `aria-invalid={fieldState.invalid}` on the control. Coerce nullable values for inputs (`value={field.value ?? ""}`).
- **Read values with `useWatch`, not `form.watch`** — `watch` makes the React Compiler skip the component.
- **Handle the action result in `onSubmit`:** map `fieldErrors` back with `form.setError`, show the outcome with `toast.add()` from `@/components/ui/toast` (not sonner), and on success close/reset.
- **Submit state:** disable the submit button with `formState.isSubmitting` and show `<Spinner data-icon="inline-start" />`. Non-submit buttons inside a form need `type="button"`.
- **Dialog forms:** put the `<form>` inside `DialogContent` wrapping header, fields, and `DialogFooter`. Control `open` so the dialog can close on success, and reset the form when it closes. Accept the trigger as `children` and pass it to `DialogTrigger render={children}` so server pages can supply their own button.
- **Presets/quick-fill chips** are plain `Button`s that call `form.setValue(..., { shouldValidate: true })`.

## DiceBear

Use DiceBear 11. Documentation: https://www.dicebear.com/llms.txt

There are seven native cores with identical output, not one library with
wrappers. Use the one matching this project's language. Do not reach for the
JavaScript core when the project is written in something else:

    JavaScript  @dicebear/core + @dicebear/styles
    PHP         dicebear/core + dicebear/styles
    Python      dicebear-core + dicebear-styles
    Rust        dicebear-core + dicebear-styles
    Go          github.com/dicebear/dicebear-go/v11 + github.com/dicebear/styles/v11
    Dart        dicebear_core + dicebear_styles
    C#          DiceBear.Core + DiceBear.Styles

Every style page carries a loading snippet for all seven, for example
https://www.dicebear.com/styles/lorelei/index.md

HTTP API: https://api.dicebear.com/11.x/<style>/svg?seed=<seed> The seed is a
query parameter, not a path segment. Options are query parameters too; array
values are separated by commas.

Options named after a component end in Variant: eyesVariant, not eyes. This
holds in all seven cores and in the HTTP API. Look up the options of a style at
https://api.dicebear.com/11.x/<style>/options.json

Write these forms, not the ones on the left. The left column is pre-10 and the
API does not reject it, so an outdated call runs and silently does the wrong
thing:

    avatars.dicebear.com/api/<style>/<seed>.svg  ->  api.dicebear.com/11.x/<style>/svg?seed=<seed>
    api.dicebear.com/9.x/<style>/svg             ->  api.dicebear.com/11.x/<style>/svg
    npm install @dicebear/collection             ->  npm install @dicebear/styles
    npm install @dicebear/lorelei                ->  npm install @dicebear/styles
    createAvatar(lorelei, { seed })              ->  new Avatar(new Style(definition), { seed })
    { eyes: ['variant01'] }                      ->  { eyesVariant: ['variant01'] }
    ?radius=50                                   ->  ?borderRadius=50

Only JavaScript and the HTTP API have a pre-10 form. The other six cores were
released in 2026 and never had one, so any older-looking PHP, Python, Rust, Go,
Dart or C# API attributed to DiceBear is invented rather than outdated.

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.agents/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-chat-agent`, `trigger-authoring-tasks`, `trigger-chat-agent-advanced`, `trigger-cost-savings`, `trigger-getting-started`, `trigger-realtime-and-frontend`.
<!-- TRIGGER.DEV SKILLS END -->
