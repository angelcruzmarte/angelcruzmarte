"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Pencil, Plus, Tag, Trash2, X } from "lucide-react"
import {
  createPromotion,
  deletePromotion,
  togglePromotion,
  updatePromotion,
  type PromotionInput,
} from "@/app/actions/promotions"
import type { Promotion } from "@/lib/db/schema"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const selectClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none ring-primary/30 focus:ring-2"

const empty: PromotionInput = {
  name: "",
  description: "",
  percentOff: 50,
  durationType: "once",
  durationMonths: 3,
  planScope: "all",
  active: true,
  showBanner: true,
  startsAt: null,
  endsAt: null,
}

function toInput(p: Promotion): PromotionInput {
  return {
    name: p.name,
    description: p.description ?? "",
    percentOff: p.percentOff,
    durationType: p.durationType as PromotionInput["durationType"],
    durationMonths: p.durationMonths ?? 3,
    planScope: p.planScope as PromotionInput["planScope"],
    active: p.active,
    showBanner: p.showBanner,
    startsAt: p.startsAt ? new Date(p.startsAt).toISOString().slice(0, 10) : null,
    endsAt: p.endsAt ? new Date(p.endsAt).toISOString().slice(0, 10) : null,
  }
}

export function AdminPromotions({ promotions }: { promotions: Promotion[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(promotions.length === 0)
  const [form, setForm] = useState<PromotionInput>(empty)
  const [error, setError] = useState<string | null>(null)

  function openNew() {
    setForm(empty)
    setEditingId(null)
    setShowForm(true)
    setError(null)
  }

  function openEdit(p: Promotion) {
    setForm(toInput(p))
    setEditingId(p.id)
    setShowForm(true)
    setError(null)
  }

  function submit() {
    if (!form.name.trim()) {
      setError("Give the promotion a name.")
      return
    }
    setError(null)
    startTransition(async () => {
      if (editingId) await updatePromotion(editingId, form)
      else await createPromotion(form)
      setShowForm(false)
      setEditingId(null)
      setForm(empty)
      router.refresh()
    })
  }

  function toggle(p: Promotion) {
    startTransition(async () => {
      await togglePromotion(p.id, !p.active)
      router.refresh()
    })
  }

  function remove(id: number) {
    startTransition(async () => {
      await deletePromotion(id)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {promotions.length} promotion{promotions.length === 1 ? "" : "s"}
        </p>
        {!showForm && (
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" />
            New promotion
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              {editingId ? "Edit promotion" : "New promotion"}
            </h2>
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setEditingId(null)
              }}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close form"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="promo-name">Name</Label>
              <Input
                id="promo-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Launch offer"
              />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="promo-desc">Description (shown to users)</Label>
              <Textarea
                id="promo-desc"
                value={form.description ?? ""}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Get 50% off your first subscription."
                rows={2}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="promo-percent">Percent off</Label>
              <Input
                id="promo-percent"
                type="number"
                min={1}
                max={100}
                value={form.percentOff}
                onChange={(e) =>
                  setForm({ ...form, percentOff: Number(e.target.value) })
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="promo-scope">Applies to</Label>
              <select
                id="promo-scope"
                className={selectClass}
                value={form.planScope}
                onChange={(e) =>
                  setForm({
                    ...form,
                    planScope: e.target.value as PromotionInput["planScope"],
                  })
                }
              >
                <option value="all">All plans</option>
                <option value="monthly">Monthly only</option>
                <option value="yearly">Annual only</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="promo-duration">Discount duration</Label>
              <select
                id="promo-duration"
                className={selectClass}
                value={form.durationType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    durationType: e.target
                      .value as PromotionInput["durationType"],
                  })
                }
              >
                <option value="once">First payment only</option>
                <option value="repeating">Multiple months</option>
                <option value="forever">Forever</option>
              </select>
            </div>

            {form.durationType === "repeating" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="promo-months">Number of months</Label>
                <Input
                  id="promo-months"
                  type="number"
                  min={1}
                  max={36}
                  value={form.durationMonths ?? 3}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      durationMonths: Number(e.target.value),
                    })
                  }
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="promo-start">Starts (optional)</Label>
              <Input
                id="promo-start"
                type="date"
                value={form.startsAt ?? ""}
                onChange={(e) =>
                  setForm({ ...form, startsAt: e.target.value || null })
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="promo-end">Ends (optional)</Label>
              <Input
                id="promo-end"
                type="date"
                value={form.endsAt ?? ""}
                onChange={(e) =>
                  setForm({ ...form, endsAt: e.target.value || null })
                }
              />
            </div>

            <div className="flex items-center gap-6 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm({ ...form, active: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-border"
                />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.showBanner}
                  onChange={(e) =>
                    setForm({ ...form, showBanner: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-border"
                />
                Show banner during signup
              </label>
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="mt-5 flex gap-3">
            <Button onClick={submit} disabled={pending} className="gap-2">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? "Save changes" : "Create promotion"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowForm(false)
                setEditingId(null)
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {promotions.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Tag className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{p.name}</p>
                    <Badge variant={p.active ? "default" : "secondary"}>
                      {p.active ? "Active" : "Paused"}
                    </Badge>
                    {p.showBanner && (
                      <Badge variant="outline">Banner on</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {p.percentOff}% off
                    {p.planScope !== "all"
                      ? ` · ${p.planScope === "yearly" ? "Annual" : "Monthly"} plan`
                      : " · All plans"}
                    {p.durationType === "repeating"
                      ? ` · ${p.durationMonths} months`
                      : p.durationType === "forever"
                        ? " · Forever"
                        : " · First payment"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => toggle(p)}
                  disabled={pending}
                >
                  {p.active ? "Pause" : "Activate"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(p)}
                  aria-label="Edit promotion"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(p.id)}
                  disabled={pending}
                  aria-label="Delete promotion"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}

        {promotions.length === 0 && !showForm && (
          <Card className="p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No promotions yet. Create one to display a discount during signup.
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}
