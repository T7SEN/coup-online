'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useSession } from '@/lib/auth-client'

// Opens the sign-in page in a popup window and keeps the opener in sync.
//
// The whole flow — provider choice, the OAuth round-trip, the magic-link
// request — runs inside that one popup; the opener page is never navigated
// away, so the user stays exactly where they were. When the flow finishes the
// popup lands on /auth/callback, which broadcasts 'popup-done' on the
// 'coup-auth' BroadcastChannel and closes itself. We catch that here and call
// useSession().refetch() so the opener reflects the new session in place —
// no manual refresh. references/auth.md.

const POPUP_NAME = 'coup-signin'
const POPUP_W = 500
const POPUP_H = 740

export function useSignInPopup(): () => void {
  const { refetch } = useSession()
  const refetchRef = useRef(refetch)
  const popupRef = useRef<Window | null>(null)

  // Keep the ref pointed at the latest refetch so the listener effect below
  // can mount once (empty deps) and never call a stale function.
  useEffect(() => {
    refetchRef.current = refetch
  }, [refetch])

  useEffect(() => {
    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel('coup-auth')
      channel.onmessage = (e: MessageEvent) => {
        if (e.data !== 'popup-done') return
        popupRef.current?.close()
        popupRef.current = null
        refetchRef.current()
      }
    } catch {
      // No BroadcastChannel in this browser — sign-in still completes in the
      // popup; the opener just won't update until its next navigation.
    }
    return () => channel?.close()
  }, [])

  return useCallback(() => {
    const left = window.screenX + Math.max(0, (window.outerWidth - POPUP_W) / 2)
    const top = window.screenY + Math.max(0, (window.outerHeight - POPUP_H) / 2)
    const popup = window.open(
      '/auth/signin',
      POPUP_NAME,
      `popup=yes,width=${POPUP_W},height=${POPUP_H},left=${left},top=${top}`,
    )
    if (!popup) {
      // Pop-up blocked — fall back to a full-page sign-in (the page works
      // standalone too).
      window.location.href = '/auth/signin'
      return
    }
    popupRef.current = popup
    popup.focus()
  }, [])
}
