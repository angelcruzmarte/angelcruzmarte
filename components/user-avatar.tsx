import { cn } from "@/lib/utils"

function initialsFrom(name: string): string {
  return (
    name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U"
  )
}

/** Resolves the <img> src for a stored avatar. */
export function avatarSrc(image: string | null | undefined): string | null {
  if (!image) return null
  // Full URLs (e.g. OAuth/Gravatar) are used as-is; Blob pathnames go through
  // the authenticated /api/avatar delivery route.
  if (/^https?:\/\//.test(image)) return image
  return `/api/avatar?pathname=${encodeURIComponent(image)}`
}

export function UserAvatar({
  name,
  image,
  className,
}: {
  name: string
  image?: string | null
  className?: string
}) {
  const src = avatarSrc(image)
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-primary-foreground",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src || "/placeholder.svg"}
          alt={`${name}'s profile photo`}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-lg font-bold">{initialsFrom(name)}</span>
      )}
    </span>
  )
}
