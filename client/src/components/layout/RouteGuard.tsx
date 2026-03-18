import { RequireUserType } from './RequireUserType';
import { isCustomerOnlyRoute, isAdminOnlyRoute } from '@/lib/route-config';
import { useLocation } from 'wouter';
import { getToken } from '@/lib/auth';

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const getUserType = (): { userType: string; isAdmin: boolean } => {
    try {
      const token = getToken();
      if (!token) return { userType: 'customer', isAdmin: false };
      const parts = token.split('.');
      if (parts.length !== 3) return { userType: 'customer', isAdmin: false };
      const payload = JSON.parse(atob(parts[1]));
      return {
        userType: payload.userType || 'customer',
        isAdmin: payload.isAdmin === true
      };
    } catch {
      return { userType: 'customer', isAdmin: false };
    }
  };

  const { userType, isAdmin } = getUserType();

  // Admin can access everything
  if (isAdmin) return <>{children}</>;

  // Client users cannot access customer-only routes
  if (userType === 'client' && isCustomerOnlyRoute(location)) {
    return (
      <RequireUserType allowedTypes={['customer', 'admin']}>
        {children}
      </RequireUserType>
    );
  }

  // Non-admin users cannot access admin routes
  if (!isAdmin && isAdminOnlyRoute(location)) {
    return (
      <RequireUserType allowedTypes={['admin']}>
        {children}
      </RequireUserType>
    );
  }

  return <>{children}</>;
}
