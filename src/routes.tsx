import { createBrowserRouter, Navigate } from "react-router";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import ProductsPage from "./pages/Products/ProductsPage";
import ProductDetailPage from "./pages/Products/ProductDetailPage";
import GuestRoute from "./components/GuestRoute";
import ProtectedRoute from "./components/ProtectedRoute";

const routes = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/products" replace />,
  },
  {
    Component: GuestRoute,
    children: [
      {
        path: "/login",
        Component: Login,
      },
    ],
  },
  {
    Component: ProtectedRoute,
    children: [
      {
        Component: Layout,
        children: [
          {
            path: "/products",
            Component: ProductsPage,
          },
          {
            path: "/products/:id",
            Component: ProductDetailPage,
          },
        ],
      },
    ],
  },
]);

export default routes;
