import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import * as settingsService from '@/lib/services/settings'
import type { Notification } from '@/types'
import { formatDistanceToNow, parseISO } from 'date-fns'

export function NotificationBell() {
  const { session } = useAuth()
  const { bump } = useData()
  const navigate = useNavigate()
  const [items, setItems] = useState<Notification[]>([])

  useEffect(() => {
    if (!session) return
    void settingsService.listNotifications(session.userId).then(setItems)
  }, [session, bump])

  if (!session) return null
  const unread = items.filter((n) => !n.read).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber px-1 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2">
          <DropdownMenuLabel className="px-1">Notifications</DropdownMenuLabel>
          {unread > 0 && (
            <button
              className="flex items-center gap-1 text-xs text-teal hover:underline"
              onClick={async () => {
                await settingsService.markAllNotificationsRead(session.userId)
                bump()
              }}
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-ink-muted">No notifications yet</div>
        )}
        {items.slice(0, 8).map((n) => (
          <DropdownMenuItem
            key={n.id}
            className={!n.read ? 'bg-teal-100/40 dark:bg-teal/10' : undefined}
            onClick={async () => {
              await settingsService.markNotificationRead(n.id)
              bump()
              if (n.link) navigate(n.link)
            }}
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{n.title}</span>
              <span className="text-xs text-ink-muted line-clamp-2">{n.message}</span>
              <span className="text-[10px] text-ink-muted">
                {formatDistanceToNow(parseISO(n.createdAt), { addSuffix: true })}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
