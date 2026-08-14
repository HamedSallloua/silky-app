import { Routes, Route } from 'react-router-dom';

import Layout from './components/layout/Layout';

import Home from './pages/Home';

import Product from './pages/Product';

import Cart from './pages/Cart';

import Checkout from './pages/Checkout';

import OrderConfirmation from './pages/OrderConfirmation';

import Collection from './pages/Collection';

import SearchResults from './pages/SearchResults';

import LeaveReview from './pages/LeaveReview';

import About from './pages/About';

import Contact from './pages/Contact';

import CustomerService from './pages/CustomerService';

import DeliveryReturns from './pages/DeliveryReturns';

import Login from './pages/Login';

import Signup from './pages/Signup';

import Favorites from './pages/Favorites';

import Account from './pages/Account';

import CustomerRoute from './components/CustomerRoute';

import PasswordReset from './pages/PasswordReset';

import AdminLogin, { AdminRoute } from './pages/admin/AdminLogin';

import AdminDashboard from './pages/admin/AdminDashboard';



export default function App() {

  return (

    <Routes>

      <Route element={<Layout />}>

        <Route index element={<Home />} />

        <Route path="product/:id?" element={<Product />} />

        <Route path="collection/:category" element={<Collection />} />

        <Route path="search" element={<SearchResults />} />

        <Route path="cart" element={<Cart />} />

        <Route path="checkout" element={<Checkout />} />

        <Route path="order-confirmation" element={<OrderConfirmation />} />

        <Route path="leave-review" element={<LeaveReview />} />

        <Route path="about" element={<About />} />

        <Route path="contact" element={<Contact />} />

        <Route path="service-client" element={<CustomerService />} />

        <Route path="livraison-retours" element={<DeliveryReturns />} />

        <Route path="login" element={<Login />} />

        <Route path="signup" element={<Signup />} />

        <Route path="password-reset" element={<PasswordReset />} />
        <Route path="password-reset/:token" element={<PasswordReset />} />

        <Route path="favorites" element={<Favorites />} />

        <Route
          path="account"
          element={
            <CustomerRoute>
              <Account />
            </CustomerRoute>
          }
        />

      </Route>



      <Route path="admin/login" element={<AdminLogin />} />

      <Route

        path="admin"

        element={

          <AdminRoute>

            <AdminDashboard />

          </AdminRoute>

        }

      />

    </Routes>

  );

}
