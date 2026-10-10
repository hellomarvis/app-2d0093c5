import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { FunctionComponent } from '@/common/types';

interface PasswordResetConsentDialogProps {
  open: boolean;
  /** The address the reset link will go to. */
  email: string;
  /** This app's name — shown as the sender name on the email. */
  appName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Consent step of the forgot-password flow — REQUIRED in every app, like the
// flow itself. The reset email is delivered by the Lumexa platform (the app is
// built and hosted on it), so the user is told who sends it and asked before
// anything goes out. The send button stays disabled until the user ticks the
// consent checkbox; Cancel sends nothing. Restyle freely; never remove it or
// send without confirmation — a deploy check looks for this component.
export const PasswordResetConsentDialog = ({
  open,
  email,
  appName,
  onConfirm,
  onCancel,
}: PasswordResetConsentDialogProps): FunctionComponent => {
  const [agreed, setAgreed] = React.useState(false);
  // Every opening starts unticked — consent is given per send, never remembered.
  React.useEffect(() => {
    if (open) setAgreed(false);
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send a password reset email?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                We'll email a secure, one-time reset link to{' '}
                <span className="font-medium text-foreground break-all">{email}</span>.
              </p>
              <p>
                This email is sent on behalf of {appName} by <span className="font-medium text-foreground">Lumexa</span>
                , the platform this app is built on. It contains only your reset link and is not used for marketing.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3">
          <Checkbox
            id="password-reset-consent"
            checked={agreed}
            onCheckedChange={(value) => setAgreed(value === true)}
            className="mt-0.5"
          />
          <Label htmlFor="password-reset-consent" className="text-sm font-normal leading-snug cursor-pointer">
            I understand this email is sent by Lumexa on behalf of {appName}, and I want the reset link sent to this
            address.
          </Label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={!agreed}>
            Yes, send the email
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
