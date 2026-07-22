"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, Loader2 } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import {
  updatePreference,
  updateDailyGoal,
  deleteAccount,
  type PreferenceKey,
} from "@/app/actions/profile"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

/**
 * A single preference row with an icon, title, optional subtitle and a toggle.
 * The switch is optimistic: it flips immediately and persists in the
 * background, reverting if the server call fails.
 */
export function PreferenceRow({
  icon,
  title,
  subtitle,
  prefKey,
  initial,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  prefKey: PreferenceKey
  initial: boolean
}) {
  const [on, setOn] = useState(initial)
  const [, startTransition] = useTransition()

  function toggle(next: boolean) {
    setOn(next)
    startTransition(async () => {
      const res = await updatePreference(prefKey, next)
      if (!res.ok) setOn(!next)
    })
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 last:border-b-0">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
          {icon}
        </span>
        <span className="flex flex-col">
          <span className="text-sm font-semibold">{title}</span>
          {subtitle && (
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          )}
        </span>
      </div>
      <Switch
        checked={on}
        onCheckedChange={toggle}
        aria-label={title}
      />
    </div>
  )
}

/** Daily listening goal row that opens a slider dialog. */
export function DailyGoalRow({
  icon,
  initial,
}: {
  icon: React.ReactNode
  initial: number
}) {
  const [open, setOpen] = useState(false)
  const [minutes, setMinutes] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      await updateDailyGoal(minutes)
      setSaved(minutes)
      setOpen(false)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMinutes(saved)
          setOpen(true)
        }}
        className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-accent"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-foreground">
            {icon}
          </span>
          <span className="text-sm font-semibold">Daily Goal</span>
        </span>
        <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
          {saved} min
          <ChevronRight className="h-5 w-5" />
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Daily listening goal</DialogTitle>
            <DialogDescription>
              Set a target for how long you want to listen each day.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="mb-4 text-center">
              <span className="text-4xl font-extrabold tracking-tight">
                {minutes}
              </span>
              <span className="ml-1 text-lg font-semibold text-muted-foreground">
                min
              </span>
            </div>
            <Slider
              value={[minutes]}
              min={5}
              max={120}
              step={5}
              onValueChange={(v) => setMinutes(v[0])}
              aria-label="Daily goal minutes"
            />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>5 min</span>
              <span>120 min</span>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save goal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Destructive "close account" flow with a typed confirmation. */
export function DeleteAccountLink() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState("")
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      await deleteAccount()
      await authClient.signOut().catch(() => {})
      router.push("/")
      router.refresh()
    })
  }

  return (
    <>
      <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
        To close your account and delete all your data permanently,{" "}
        <button
          type="button"
          onClick={() => {
            setConfirm("")
            setOpen(true)
          }}
          className="font-semibold text-destructive underline underline-offset-2"
        >
          tap here
        </button>
        .
      </p>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account, documents, listening
              history and stats. This action cannot be undone. Type{" "}
              <span className="font-semibold text-foreground">DELETE</span> to
              confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="DELETE"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Type DELETE to confirm"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={confirm !== "DELETE" || pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
