import { Navigate, Outlet } from "react-router";
import { useAuth } from "../contexts/AuthContext";

export default function GuestRoute() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/products" replace />;
  }
  return <Outlet />;
}
