import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Inventario from './pages/Inventario';
import Venta from './pages/Venta';
import Reportes from './pages/Reportes';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './AuthProvider';
import Cuentas from './pages/Cuentas';

// Componente para proteger rutas
const RutaProtegida = ({ children, rolRequerido }) => {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" />; // Si no hay usuario, al login
  if (rolRequerido && user.rol !== rolRequerido) return <Navigate to="/" />; // Si no tiene permiso, al home

  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Rutas Protegidas */}
          <Route path="/" element={
            <RutaProtegida>
              <Venta />
            </RutaProtegida>
          } />

          <Route path="/inventario" element={
            <RutaProtegida rolRequerido="admin">
              <Inventario />
            </RutaProtegida>
          } />

          <Route path="/cuentas" element={
            <RutaProtegida rolRequerido="admin">
              <Cuentas />
            </RutaProtegida>
          } />

          <Route path="/reportes" element={
            <RutaProtegida rolRequerido="admin">
              <Reportes />
            </RutaProtegida>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;