import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { getToken } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

interface Props {
  allowedTypes: string[];
  children: React.ReactNode;
  redirectTo?: string;
}

export function RequireUserType({ allowedTypes, children, redirectTo = '/dashboard' }: Props) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const getUserType = (): string => {
    try {
      const token = getToken();
      if (!token) return 'customer';
      const parts = token.split('.');
      if (parts.length !== 3) return 'customer';
      const payload = JSON.parse(atob(parts[1]));
      return payload.userType || 'customer';
    } catch {
      return 'customer';
    }
  };

  const userType = getUserType();
  const isAllowed = allowedTypes.includes(userType);

  useEffect(() => {
    if (!isAllowed) {
      toast({
        title: 'Access Restricted',
        description: 'You do not have access to this page.',
        variant: 'destructive',
      });
      setLocation(redirectTo);
    }
  }, [isAllowed, setLocation, redirectTo]);

  if (!isAllowed) return null;
  return <>{children}</>;
}
