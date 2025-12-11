import { useState } from 'react';
import { useAuth } from '../AuthProvider';
import { useNavigate } from 'react-router-dom';

function Login() {
    const [nombre, setNombre] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            await login(nombre, password);
            navigate('/'); // Si todo sale bien, ir a la venta
        } catch (err) {
            setError('Credenciales incorrectas. Intenta de nuevo.');
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#333' }}>
            <div style={{ background: 'white', padding: '40px', borderRadius: '10px', width: '300px', textAlign: 'center' }}>
                <h1 style={{ color: '#28a745' }}>🛒 Mini Market</h1>
                <h3>Iniciar Sesión</h3>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <input
                        type="text"
                        placeholder="Usuario"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        required
                    />
                    <input
                        type="password"
                        placeholder="Contraseña"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />

                    {error && <p style={{ color: 'red', fontSize: '14px' }}>{error}</p>}

                    <button type="submit" style={{ padding: '10px', background: '#333', color: 'white', border: 'none' }}>
                        ENTRAR
                    </button>
                </form>
            </div>
        </div>
    );
}

export default Login;