import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as Yup from 'yup';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { apiClient } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { FunctionComponent } from '@/common/types';

// Step 2 of the forgot-password flow: the emailed link lands here as
// /reset-password?token=… (backend: POST /api/auth/reset-password).
const resetSchema = Yup.object({
  password: Yup.string().min(6, 'Password must be at least 6 characters').required('Password is required'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password')], 'Passwords do not match')
    .required('Please confirm your password'),
});

type ResetFormData = Yup.InferType<typeof resetSchema>;

export const ResetPassword = (): FunctionComponent => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormData>({ resolver: yupResolver(resetSchema) });

  const onSubmit = async (values: ResetFormData) => {
    setServerError('');
    try {
      await apiClient.post('/api/auth/reset-password', { token, password: values.password });
      toast.success('Password updated — sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Password reset failed');
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
          <CardTitle className="text-2xl">Set a new password</CardTitle>
          <CardDescription>
            {token ? 'Choose a new password for your account.' : 'This reset link is missing its token.'}
          </CardDescription>
        </CardHeader>

        {token ? (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <PasswordInput id="password" autoComplete="new-password" {...register('password')} />
                {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <PasswordInput id="confirmPassword" autoComplete="new-password" {...register('confirmPassword')} />
                {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
              </div>

              {serverError && (
                <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  {serverError}{' '}
                  <Link to="/forgot-password" className="font-medium underline">
                    Request a new link
                  </Link>
                </p>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Reset password'}
              </Button>
              <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
              <p className="text-sm text-muted-foreground text-center">
                <Link to="/login" className="text-primary font-medium hover:underline">
                  Back to sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        ) : (
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/forgot-password">Request a new reset link</Link>
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
};
