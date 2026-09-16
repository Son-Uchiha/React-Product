import { Outlet, useNavigate } from "react-router";
import { Button } from "@heroui/react";
import { useAuth } from "../contexts/AuthContext";

export default function Layout() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <span className="cursor-pointer text-xl font-bold text-gray-900">
          Product Manager
        </span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            Hello,{" "}
            <span className="font-medium text-gray-800">{user?.username}</span>
          </span>
          <Button variant="danger-soft" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
