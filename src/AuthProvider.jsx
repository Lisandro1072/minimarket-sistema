import { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from './supabaseClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null); // Aquí guardamos al usuario logueado
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Al iniciar, buscamos si hay una sesión guardada en el navegador (LocalStorage)
        const sesionGuardada = localStorage.getItem('minimarket_user');
        if (sesionGuardada) {
            setUser(JSON.parse(sesionGuardada));
        }
        setLoading(false);
    }, []);

    const login = async (nombre, password) => {
        // Buscamos usuario en Supabase que coincida nombre y contraseña
        const { data, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('nombre', nombre)
            .eq('password_hash', password) // En producción usaríamos hash
            .single();

        if (error || !data) {
            throw new Error("Usuario o contraseña incorrectos");
        }

        // Si existe, lo guardamos en el estado y en la memoria del navegador
        setUser(data);
        localStorage.setItem('minimarket_user', JSON.stringify(data));
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('minimarket_user');
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

// Hook personalizado para usar la autenticación fácil
export const useAuth = () => useContext(AuthContext);