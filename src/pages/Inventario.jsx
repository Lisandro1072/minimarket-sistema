import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

function Inventario() {
    const [productos, setProductos] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [modoEdicion, setModoEdicion] = useState(null);
    const [form, setForm] = useState({
        codigo_barras: '', nombre: '', categoria: '',
        precio_compra: '', precio_venta: '',
        stock_actual: '', stock_minimo: 5
    });

    useEffect(() => { fetchProductos(); }, []);

    async function fetchProductos() {
        const { data } = await supabase.from('productos').select('*').order('id', { ascending: false });
        if (data) setProductos(data);
    }

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    async function handleSubmit(e) {
        e.preventDefault();
        if (!form.nombre || !form.precio_venta) return alert("Nombre y Precio son obligatorios");

        try {
            if (modoEdicion) {
                await supabase.from('productos').update(form).eq('id', modoEdicion);
                alert("Actualizado ✅");
            } else {
                await supabase.from('productos').insert([form]);
                alert("Creado ✅");
            }
            limpiarFormulario();
            fetchProductos();
        } catch (error) { alert(error.message); }
    }

    const cargarParaEditar = (prod) => {
        setModoEdicion(prod.id);
        setForm(prod);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const eliminarProducto = async (id) => {
        if (confirm('¿Borrar producto?')) {
            await supabase.from('productos').delete().eq('id', id);
            fetchProductos();
        }
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
                        <button type="submit" style={{ flex: 1, padding: '12px', background: modoEdicion ? '#007bff' : '#28a745', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>
                            {modoEdicion ? 'Guardar Cambios' : 'Crear Producto'}
                        </button>
                        {modoEdicion && <button type="button" onClick={limpiarFormulario} style={{ background: '#6c757d', color: 'white', border: 'none', padding: '10px', borderRadius: '5px' }}>Cancelar</button>}
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
                        {filtrados.map(p => (
                            <tr key={p.id}>
                                <td>
                                    <strong>{p.nombre}</strong><br />
                                    <small style={{ color: '#888' }}>{p.codigo_barras}</small>
                                </td>
                                <td>{p.categoria}</td>
                                <td>${p.precio_compra}</td>
                                <td style={{ color: 'green', fontWeight: 'bold' }}>${p.precio_venta}</td>
                                <td style={{ color: p.stock_actual <= p.stock_minimo ? 'red' : 'black', fontWeight: 'bold' }}>{p.stock_actual}</td>
                                <td>
                                    <button onClick={() => cargarParaEditar(p)} style={{ marginRight: '5px', border: 'none', background: 'none', cursor: 'pointer' }}>✏️</button>
                                    <button onClick={() => eliminarProducto(p.id)} style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer' }}>🗑️</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default Inventario;