// Server-only helper (no "use server" directive) for reading a user's block
// list. Lives outside the action files so both server actions and server
// components can import it to filter blocked users' UGC out of a viewer's feed.
import { db } from "@/lib/db"
import { userBlock } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

/** IDs that `blockerId` has blocked. Used to hide their content from the viewer. */
export async function getBlockedIds(blockerId: string): Promise<string[]> {
  const rows = await db
    .select({ id: userBlock.blockedId })
    .from(userBlock)
    .where(eq(userBlock.blockerId, blockerId))
  return rows.map((r) => r.id)
}
