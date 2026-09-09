// Renders its children on every platform.
//
// This wrapper previously hid purchase-referencing chrome inside the native iOS
// build for Apple Guideline 3.1.1. That platform-conditional hiding was flagged
// by Apple under Guideline 5.6 (functionality hidden from review), so it has
// been removed: children now render identically for all users. The component is
// kept as a transparent pass-through so existing call sites remain unchanged.
export function WebOnly({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
