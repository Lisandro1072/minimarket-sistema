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
        try {
            await login(nombre, password);
            navigate('/');
        } catch (err) {
            setError('Credenciales incorrectas');
        }
    };

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#333', padding: '20px'
        }}>
            <div className="card" style={{ width: '100%', maxWidth: '400px', textAlign: 'center', padding: '40px' }}>
                <h1 style={{ color: '#28a745', fontSize: '2.5rem', marginBottom: '10px' }}>🛒</h1>
                <h2 style={{ marginTop: 0 }}>Bienvenido</h2>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '30px' }}>
                    <input
                        type="text" placeholder="Usuario" value={nombre} onChange={e => setNombre(e.target.value)}
                        style={{ padding: '15px', fontSize: '16px', borderRadius: '8px', border: '1px solid #ccc' }} required
                    />
                    <input
                        type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)}
                        style={{ padding: '15px', fontSize: '16px', borderRadius: '8px', border: '1px solid #ccc' }} required
                    />

                    {error && <div style={{ color: 'red', background: '#ffe6e6', padding: '10px', borderRadius: '5px' }}>{error}</div>}

                    <button type="submit" style={{ padding: '15px', background: '#28a745', color: 'white', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' }}>
                        INGRESAR
                    </button>
                </form>
            </div>
        </div>
    );
}

export default Login;