// Public surface of the auth feature (W2).
export { default as AuthCard } from './components/AuthCard';
export { default as EmailVerification } from './components/EmailVerification';
export { default as ForgotPasswordForm } from './components/ForgotPasswordForm';
export { default as LoginForm } from './components/LoginForm';
export { default as PermissionGate } from './components/PermissionGate';
export { default as RegisterForm } from './components/RegisterForm';
export { default as ResetPasswordForm } from './components/ResetPasswordForm';
export { default as SignOutButtons } from './components/SignOutButtons';
export { useSession, useSignOut } from './hooks/useSession';
export { authService } from './services/authService';
