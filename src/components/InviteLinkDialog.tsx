import { format } from 'date-fns'
import { Copy, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export interface InviteDialogValue {
  url: string
  expiresAt: string
  name: string
  email?: string
  /** e.g. company name, for the message text */
  company?: string
}

/** Shows a one-time set-password link with copy / WhatsApp share. */
export function InviteLinkDialog({ invite, onClose }: { invite: InviteDialogValue | null; onClose: () => void }) {
  if (!invite) return null
  const message = `Hi ${invite.name.split(' ')[0]}, you've been added to ${invite.company ?? 'our'} attendance. Set your password here: ${invite.url}`

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite link for {invite.name}</DialogTitle>
          <DialogDescription>
            Send this to {invite.email ?? 'them'}. It works once and expires{' '}
            {format(new Date(invite.expiresAt), 'd MMM, h:mm a')}. Creating a new link cancels this one.
          </DialogDescription>
        </DialogHeader>
        <Input readOnly value={invite.url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" asChild>
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          </Button>
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(invite.url)
              toast.success('Link copied')
            }}
          >
            <Copy className="h-4 w-4" /> Copy link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
