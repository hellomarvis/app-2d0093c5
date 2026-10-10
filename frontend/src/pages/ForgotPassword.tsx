import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as Yup from 'yup';
import { Link } from 'react-router-dom';
import { apiClient } from '@/lib/apiClient';
import { sendPasswordResetEmail } from '@/lib/passwordResetEmail';
import { APP_NAME } from '@/brand';
import { PasswordResetConsentDialog } from '@/components/PasswordResetConsentDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { FunctionComponent } from '@/common/types';

// Step 1 of the forgot-password flow (backend: POST /api/auth/forgot-password).
// Submitting opens PasswordResetConsentDialog — the email is sent by the Lumexa
// platform, so nothing goes out until the user confirms; Cancel sends nothing.
// The server answers the same way whether or not the email has an account, so
// this page always ends on "check your inbox" — never "no such user".
const forgotSchema = Yup.object({
  email: Yup.string().email('Invalid email address').required('Email is required'),
});

type ForgotFormData = Yup.InferType<typeof forgotSchema>;

export const ForgotPassword = (): FunctionComponent => {
  const [sentTo, setSentTo] = useState('');
  const [serverError, setServerError] = useState('');
  // Email awaiting consent — non-empty while the consent dialog is open.
  const [pendingEmail, setPendingEmail] = useState('');
  const [sending, setSending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotFormData>({ resolver: yupResolver(forgotSchema) });

  // Submit only asks for consent; nothing is sent yet.
  const onSubmit = (values: ForgotFormData) => {
    setServerError('');
    setPendingEmail(values.email);
  };

  const sendResetEmail = async () => {
    const email = pendingEmail;
    setPendingEmail('');
    setSending(true);
    try {
      // Backend creates the reset token and seals the email; the browser hands
      // the sealed email to the platform to send — same path as lead forms.
      const { sealed } = await apiClient.post<{ sealed?: string }>('/api/auth/forgot-password', {
        email,
        appName: APP_NAME,
      });
      await sendPasswordResetEmail(sealed, APP_NAME);
      setSentTo(email);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/8 via-background to-accent/6 px-4 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-accent/8 blur-3xl" />
      </div>

      <Card className="relative z-10 w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Forgot your password?</CardTitle>
          <CardDescription>
            {sentTo
              ? 'Check your inbox for the reset link.'
              : "Enter your account email and we'll send you a link to reset it."}
          </CardDescription>
        </CardHeader>

        {sentTo ? (
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{sentTo}</span>, a password
              reset link is on its way. It works once and expires in an hour. Don't see it? Check your spam folder.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">Back to sign in</Link>
            </Button>
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...register('email')} />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>

              {serverError && (
                <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{serverError}</p>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={sending}>
                {sending ? 'Sending…' : 'Send reset link'}
              </Button>
              <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
              <p className="text-sm text-muted-foreground text-center">
                {'Remembered it? '}
                <Link to="/login" className="text-primary font-medium hover:underline">
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        )}
      </Card>

      <PasswordResetConsentDialog
        open={pendingEmail !== ''}
        email={pendingEmail}
        appName={APP_NAME}
        onConfirm={() => void sendResetEmail()}
        onCancel={() => setPendingEmail('')}
      />
    </div>
  );
};
