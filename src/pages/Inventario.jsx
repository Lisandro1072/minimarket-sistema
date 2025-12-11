import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

function Inventario() {
    const [productos, setProductos] = useState([]);
    const [nuevoProducto, setNuevoProducto] = useState({
        codigo_barras: '',
        nombre: '',
        precio_compra: '',
        precio_venta: '',
        stock_actual: '',
        stock_minimo: 5
    });

    // 1. Cargar productos al abrir la pantalla
    useEffect(() => {
        fetchProductos();
    }, []);

    async function fetchProductos() {
        const { data, error } = await supabase
            .from('productos')
            .select('*')
            .order('id', { ascending: false }); // Los más nuevos primero

        if (error) console.log('Error cargando:', error);
        else setProductos(data);
    }

    // 2. Manejar cambios en los inputs del formulario
    const handleChange = (e) => {
        setNuevoProducto({
            ...nuevoProducto,
            [e.target.name]: e.target.value
        });
    };

    // 3. Guardar producto en Supabase
    async function guardarProducto(e) {
        e.preventDefault(); // Evitar recarga de página

        const { error } = await supabase
            .from('productos')
            .insert([nuevoProducto]);

        if (error) {
            alert('Error al guardar: ' + error.message);
        } else {
            alert('Producto guardado correctamente');
            fetchProductos(); // Recargar la lista
            // Limpiar formulario
            setNuevoProducto({ codigo_barras: '', nombre: '', precio_compra: '', precio_venta: '', stock_actual: '', stock_minimo: 5 });
        }
    }

    // 4. Eliminar producto
    async function eliminarProducto(id) {
        if (window.confirm('¿Seguro que quieres eliminar este producto?')) {
            const { error } = await supabase.from('productos').delete().eq('id', id);
            if (error) alert('Error borrando');
            else fetchProductos();
        }
    }

    return (
        <div style={{ padding: '20px' }}>
            <h2>📦 Gestión de Inventario</h2>

            {/* Formulario de Registro */}
            <div style={{ background: '#f4f4f4', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                <h3>Nuevo Producto</h3>
                <form onSubmit={guardarProducto} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    <input name="codigo_barras" placeholder="Código de Barras" value={nuevoProducto.codigo_barras} onChange={handleChange} required />
                    <input name="nombre" placeholder="Nombre Producto" value={nuevoProducto.nombre} onChange={handleChange} required />
                    <input type="number" name="precio_compra" placeholder="Costo ($)" value={nuevoProducto.precio_compra} onChange={handleChange} required />
                    <input type="number" name="precio_venta" placeholder="Venta ($)" value={nuevoProducto.precio_venta} onChange={handleChange} required />
                    <input type="number" name="stock_actual" placeholder="Stock Actual" value={nuevoProducto.stock_actual} onChange={handleChange} required />
                    <input type="number" name="stock_minimo" placeholder="Stock Mínimo" value={nuevoProducto.stock_minimo} onChange={handleChange} />

                    <button type="submit" style={{ gridColumn: 'span 3', padding: '10px', background: '#28a745', color: 'white', border: 'none', cursor: 'pointer' }}>
                        + Guardar Producto
                    </button>
                </form>
            </div>

            {/* Tabla de Productos */}
            <table border="1" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ background: '#ddd' }}>
                        <th>Código</th>
                        <th>Producto</th>
                        <th>Costo</th>
                        <th>Venta</th>
                        <th>Stock</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {productos.map((prod) => (
                        <tr key={prod.id}>
                            <td>{prod.codigo_barras}</td>
                            <td>{prod.nombre}</td>
                            <td>${prod.precio_compra}</td>
                            <td>${prod.precio_venta}</td>
                            <td>{prod.stock_actual}</td>
                            <td>
                                <button onClick={() => eliminarProducto(prod.id)} style={{ color: 'red' }}>🗑️ Eliminar</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default Inventario;