import { RoomClient } from './client'

// Server Component — reads the matchId param (async in Next 16) and hands off
// to the Client Component that owns the WebSocket.
export default async function RoomPage({
  params,
}: {
  params: Promise<{ matchId: string }>
}) {
  const { matchId } = await params
  return <RoomClient matchId={matchId} />
}
