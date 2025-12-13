import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthProvider';

function Navbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation(); // Para saber en qué página estamos
    const [isOpen, setIsOpen] = useState(false); // Estado del menú

    const handleLogout = () => {
        logout();
        setIsOpen(false);
        navigate('/login');
    };

    // Función para cerrar menú al hacer clic en un enlace
    const closeMenu = () => setIsOpen(false);

    // Si no hay usuario, no mostramos nada (o solo el brand)
    if (!user) return null;

    return (
        <>
            <nav className="navbar">
                <div className="brand">
                    <span>🛒</span> Mini Market
                </div>

                {/* Botón Hamburguesa */}
                <button className="hamburger" onClick={() => setIsOpen(true)}>
                    ☰
                </button>

                {/* Enlaces Desktop */}
                <div className="nav-links">
                    <Link to="/" className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}>Punto de Venta</Link>
                    {user.rol === 'admin' && (
                        <>
                            <Link to="/inventario" className={`nav-item ${location.pathname === '/inventario' ? 'active' : ''}`}>Inventario</Link>
                            <Link to="/reportes" className={`nav-item ${location.pathname === '/reportes' ? 'active' : ''}`}>Reportes</Link>
                        </>
                    )}
                    <button onClick={handleLogout} className="btn-logout">Salir</button>
                </div>
            </nav>

            {/* Menú Lateral Móvil (Drawer) */}
            <div className={`mobile-menu ${isOpen ? 'open' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'white', marginBottom: '20px' }}>
                    <strong>Hola, {user.nombre}</strong>
                    <span onClick={closeMenu} style={{ cursor: 'pointer', fontSize: '20px' }}>✕</span>
                </div>

                <Link to="/" className="mobile-link" onClick={closeMenu}>💰 Punto de Venta</Link>
                {user.rol === 'admin' && (
                    <>
                        <Link to="/inventario" className="mobile-link" onClick={closeMenu}>📦 Inventario</Link>
                        <Link to="/reportes" className="mobile-link" onClick={closeMenu}>📊 Reportes</Link>
                    </>
                )}
                <button onClick={handleLogout} className="mobile-link" style={{ background: 'transparent', border: 'none', textAlign: 'left', color: '#ff6b6b', fontWeight: 'bold' }}>🚪 Cerrar Sesión</button>
            </div>

            {/* Fondo oscuro al abrir menú */}
            {isOpen && <div className="overlay" onClick={closeMenu}></div>}
        </>
    );
}

export default Navbar;