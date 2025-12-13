import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

function Inventario() {
    const [productos, setProductos] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [modoEdicion, setModoEdicion] = useState(null);

    const [form, setForm] = useState({
        codigo_barras: '',
        nombre: '',
        categoria: '',
        precio_compra: '',
        precio_venta: '',
        stock_actual: '',
        stock_minimo: 5
    });

    useEffect(() => { fetchProductos(); }, []);

    // 1. CARGAR SOLO PRODUCTOS ACTIVOS
    async function fetchProductos() {
        const { data } = await supabase
            .from('productos')
            .select('*')
            .eq('activo', true) // <--- CLAVE: Solo traemos los activos
            .order('id', { ascending: false });

        if (data) setProductos(data);
    }

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    async function handleSubmit(e) {
        e.preventDefault();
        if (!form.nombre || !form.precio_venta) return alert("Nombre y Precio son obligatorios");

        // Preparar datos limpios (convertir números y nulos)
        const datosProducto = {
            codigo_barras: form.codigo_barras.trim() === '' ? null : form.codigo_barras,
            nombre: form.nombre,
            categoria: form.categoria,
            precio_compra: parseFloat(form.precio_compra) || 0,
            precio_venta: parseFloat(form.precio_venta) || 0,
            stock_actual: parseInt(form.stock_actual) || 0,
            stock_minimo: parseInt(form.stock_minimo) || 5,
            activo: true
        };

        try {
            if (modoEdicion) {
                // MODO EDITAR
                const { error } = await supabase
                    .from('productos')
                    .update(datosProducto)
                    .eq('id', modoEdicion);

                if (error) throw error;
                alert("Actualizado correctamente ✅");

            } else {
                // MODO CREAR
                const { error } = await supabase
                    .from('productos')
                    .insert([datosProducto]); // Supabase generará el ID solo

                if (error) throw error;
                alert("Producto creado ✅");
            }

            limpiarFormulario();
            fetchProductos(); // Recargar la lista

        } catch (error) {
            console.error(error);
            alert("Error: " + error.message);
        }
    }

    // 2. FUNCIÓN DE ELIMINAR (BORRADO LÓGICO)
    const eliminarProducto = async (id) => {
        if (window.confirm('¿Seguro que quieres borrar este producto?')) {
            // En lugar de .delete(), hacemos .update(activo: false)
            const { error } = await supabase
                .from('productos')
                .update({ activo: false })
                .eq('id', id);

            if (error) {
                alert('No se pudo borrar: ' + error.message);
            } else {
                fetchProductos(); // Recargamos y el producto "desaparece"
            }
        }
    };

    const cargarParaEditar = (prod) => {
        setModoEdicion(prod.id);
        // Llenamos el formulario (asegurando que no haya nulls que rompan los inputs)
        setForm({
            codigo_barras: prod.codigo_barras || '',
            nombre: prod.nombre,
            categoria: prod.categoria || '',
            precio_compra: prod.precio_compra,
            precio_venta: prod.precio_venta,
            stock_actual: prod.stock_actual,
            stock_minimo: prod.stock_minimo || 5
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const limpiarFormulario = () => {
        setModoEdicion(null);
        setForm({ codigo_barras: '', nombre: '', categoria: '', precio_compra: '', precio_venta: '', stock_actual: '', stock_minimo: 5 });
    };

    const filtrados = productos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()));

    return (
        <div className="container">
            <h2 style={{ marginBottom: '20px' }}>📦 Inventario</h2>

            {/* TARJETA DEL FORMULARIO */}
            <div className="card">
                <h3 style={{ marginTop: 0, color: modoEdicion ? '#007bff' : '#28a745' }}>
                    {modoEdicion ? '✏️ Editar Producto' : '➕ Nuevo Producto'}
                </h3>

                <form onSubmit={handleSubmit} className="form-grid">
                    <input name="codigo_barras" placeholder="Código (Opcional)" value={form.codigo_barras} onChange={handleChange} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }} />
                    <input name="nombre" placeholder="Nombre *" value={form.nombre} onChange={handleChange} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }} required />
                    <input name="categoria" placeholder="Categoría" list="cats" value={form.categoria} onChange={handleChange} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }} />
                    <datalist id="cats"><option value="Bebidas" /><option value="Abarrotes" /><option value="Limpieza" /><option value="Otro" /></datalist>

                    <input type="number" name="precio_compra" placeholder="Costo *" value={form.precio_compra} onChange={handleChange} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }} />
                    <input type="number" name="precio_venta" placeholder="Venta *" value={form.precio_venta} onChange={handleChange} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }} required />
                    <input type="number" name="stock_actual" placeholder="Stock" value={form.stock_actual} onChange={handleChange} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }} />

                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', marginTop: '10px' }}>
                        <button type="submit" style={{ flex: 1, padding: '12px', background: modoEdicion ? '#007bff' : '#28a745', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>
                            {modoEdicion ? 'Guardar Cambios' : 'Crear Producto'}
                        </button>
                        {modoEdicion && <button type="button" onClick={limpiarFormulario} style={{ background: '#6c757d', color: 'white', border: 'none', padding: '10px', borderRadius: '5px', cursor: 'pointer' }}>Cancelar</button>}
                    </div>
                </form>
            </div>

            {/* BUSCADOR */}
            <input
                type="text"
                placeholder="🔍 Buscar producto..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                style={{ width: '100%', padding: '15px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '20px', boxSizing: 'border-box' }}
            />

            {/* TABLA RESPONSIVA */}
            <div className="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Producto</th><th>Cat</th><th>Costo</th><th>Venta</th><th>Stock</th><th>Acción</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtrados.length === 0 ? (
                            <tr><td colSpan="6" style={{ textAlign: 'center', color: '#888' }}>No hay productos activos.</td></tr>
                        ) : (
                            filtrados.map(p => (
                                <tr key={p.id}>
                                    <td>
                                        <strong>{p.nombre}</strong><br />
                                        <small style={{ color: '#888' }}>{p.codigo_barras || '-'}</small>
                                    </td>
                                    <td>{p.categoria || '-'}</td>
                                    <td>${p.precio_compra}</td>
                                    <td style={{ color: 'green', fontWeight: 'bold' }}>${p.precio_venta}</td>
                                    <td style={{ color: p.stock_actual <= p.stock_minimo ? 'red' : 'black', fontWeight: 'bold' }}>{p.stock_actual}</td>
                                    <td>
                                        <button onClick={() => cargarParaEditar(p)} style={{ marginRight: '5px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px' }}>✏️</button>
                                        <button onClick={() => eliminarProducto(p.id)} style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px' }}>🗑️</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default Inventario;