import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthProvider';

function Navbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const estiloNav = {
        background: '#333',
        padding: '1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: 'white'
    };

    const estiloLink = { color: 'white', textDecoration: 'none', fontWeight: 'bold', marginRight: '20px' };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Si no hay usuario logueado, no mostramos el menú (o mostramos uno vacío)
    if (!user) return null;

    return (
        <nav style={estiloNav}>
            <div>
                <Link to="/" style={estiloLink}>🛒 Venta</Link>

                {/* SOLO ADMIN PUEDE VER ESTO */}
                {user.rol === 'admin' && (
                    <>
                        <Link to="/inventario" style={estiloLink}>📦 Inventario</Link>
                        <Link to="/reportes" style={estiloLink}>📊 Reportes</Link>
                    </>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>Hola, {user.nombre} ({user.rol})</span>
                <button onClick={handleLogout} style={{ background: 'red', border: 'none', color: 'white', padding: '5px 10px', fontSize: '12px' }}>
                    Salir
                </button>
            </div>
        </nav>
    );
}

export default Navbar;