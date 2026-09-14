import { Redirect } from 'expo-router';
import { useAuth } from '../features/auth/AuthProvider';
import { LoadingState } from '../components/feedback';

export default function Index() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return <LoadingState message="Starting AquaKart..." />;
  }

  if (!user) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (role === 'supplier') {
    return <Redirect href="/(supplier)/dashboard" />;
  }

  return <Redirect href="/(customer)/home" />;
}
