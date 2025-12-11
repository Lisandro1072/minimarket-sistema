import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

function Inventario() {
    const [productos, setProductos] = useState([]);
    const [busqueda, setBusqueda] = useState('');

    // Estado para saber si estamos editando (tiene el ID del producto) o creando (null)
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

    // 1. Cargar productos
    useEffect(() => {
        fetchProductos();
    }, []);

    async function fetchProductos() {
        const { data, error } = await supabase
            .from('productos')
            .select('*')
            .order('id', { ascending: false }); // Los últimos creados primero

        if (data) setProductos(data);
    }

    // 2. Manejar cambios en los inputs
    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    // 3. GUARDAR (Sirve tanto para Crear como para Editar)
    async function handleSubmit(e) {
        e.preventDefault();

        // Validaciones mínimas
        if (!form.nombre || !form.precio_compra || !form.precio_venta) {
            alert("Por favor completa al menos Nombre, Costo y Precio Venta.");
            return;
        }

        try {
            if (modoEdicion) {
                // --- MODO ACTUALIZAR ---
                const { error } = await supabase
                    .from('productos')
                    .update({
                        codigo_barras: form.codigo_barras,
                        nombre: form.nombre,
                        categoria: form.categoria,
                        precio_compra: form.precio_compra,
                        precio_venta: form.precio_venta,
                        stock_actual: form.stock_actual,
                        stock_minimo: form.stock_minimo
                    })
                    .eq('id', modoEdicion); // Buscamos por el ID que estamos editando

                if (error) throw error;
                alert("¡Producto actualizado exitosamente!");

            } else {
                // --- MODO CREAR NUEVO ---
                // Si el código de barras está vacío, generamos uno temporal o lo dejamos vacío
                // Para este caso, lo enviamos tal cual.
                const { error } = await supabase
                    .from('productos')
                    .insert([form]);

                if (error) throw error;
                alert("¡Producto creado correctamente!");
            }

            // Limpiar todo
            limpiarFormulario();
            fetchProductos();

        } catch (error) {
            alert('Error: ' + error.message);
        }
    }

    // 4. Preparar para editar
    const cargarParaEditar = (producto) => {
        setModoEdicion(producto.id); // Activamos modo edición
        setForm({
            codigo_barras: producto.codigo_barras || '',
            nombre: producto.nombre,
            categoria: producto.categoria || '',
            precio_compra: producto.precio_compra,
            precio_venta: producto.precio_venta,
            stock_actual: producto.stock_actual,
            stock_minimo: producto.stock_minimo
        });
        // Hacemos scroll hacia arriba para ver el formulario
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // 5. Eliminar
    async function eliminarProducto(id) {
        if (window.confirm('¿Seguro que quieres borrar este producto?')) {
            const { error } = await supabase.from('productos').delete().eq('id', id);
            if (error) alert('Error al borrar');
            else fetchProductos();
        }
    }

    // 6. Cancelar edición
    const limpiarFormulario = () => {
        setModoEdicion(null);
        setForm({
            codigo_barras: '',
            nombre: '',
            categoria: '',
            precio_compra: '',
            precio_venta: '',
            stock_actual: '',
            stock_minimo: 5
        });
    };

    // FILTRO DE BÚSQUEDA
    const productosFiltrados = productos.filter(p =>
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        (p.categoria && p.categoria.toLowerCase().includes(busqueda.toLowerCase())) ||
        (p.codigo_barras && p.codigo_barras.includes(busqueda))
    );

    return (
        <div className="container">
            <h2>📦 Gestión de Inventario</h2>

            {/* FORMULARIO (Se adapta si es Nuevo o Edición) */}
            <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '10px', marginBottom: '30px', border: '1px solid #ddd' }}>
                <h3 style={{ color: modoEdicion ? '#007bff' : '#28a745' }}>
                    {modoEdicion ? '✏️ Editando Producto' : '➕ Nuevo Producto'}
                </h3>

                <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>

                    {/* Campos NO obligatorios primero */}
                    <div>
                        <label>Código Barras (Opcional)</label>
                        <input
                            name="codigo_barras"
                            value={form.codigo_barras}
                            onChange={handleChange}
                            placeholder="Ej: 7750..."
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div>
                        <label>Categoría</label>
                        <input
                            name="categoria"
                            value={form.categoria}
                            onChange={handleChange}
                            placeholder="Ej: Bebidas"
                            list="lista-categorias"
                            style={{ width: '100%' }}
                        />
                        {/* Sugerencias de categorías */}
                        <datalist id="lista-categorias">
                            <option value="Bebidas" />
                            <option value="Abarrotes" />
                            <option value="Limpieza" />
                            <option value="Snacks" />
                            <option value="Lácteos" />
                            <option value="Embutidos" />
                            <option value="Otro" /> {/* <--- AGREGAR ESTA LÍNEA */}
                        </datalist>
                    </div>

                    {/* Campos Importantes (Required visualmente, validados en la función) */}
                    <div style={{ gridColumn: 'span 2' }}>
                        <label>Nombre del Producto *</label>
                        <input
                            name="nombre"
                            value={form.nombre}
                            onChange={handleChange}
                            placeholder="Ej: Coca Cola 3L"
                            style={{ width: '100%', fontWeight: 'bold' }}
                        />
                    </div>

                    <div>
                        <label>Costo Compra ($) *</label>
                        <input type="number" name="precio_compra" value={form.precio_compra} onChange={handleChange} style={{ width: '100%' }} />
                    </div>

                    <div>
                        <label>Precio Venta ($) *</label>
                        <input type="number" name="precio_venta" value={form.precio_venta} onChange={handleChange} style={{ width: '100%' }} />
                    </div>

                    <div>
                        <label>Stock Actual</label>
                        <input type="number" name="stock_actual" value={form.stock_actual} onChange={handleChange} style={{ width: '100%' }} />
                    </div>

                    <div>
                        <label>Stock Mínimo (Alerta)</label>
                        <input type="number" name="stock_minimo" value={form.stock_minimo} onChange={handleChange} style={{ width: '100%' }} />
                    </div>

                    {/* Botones de Acción */}
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', marginTop: '10px' }}>
                        <button
                            type="submit"
                            style={{
                                flex: 1,
                                padding: '12px',
                                background: modoEdicion ? '#007bff' : '#28a745',
                                color: 'white', border: 'none', borderRadius: '5px', fontSize: '16px'
                            }}
                        >
                            {modoEdicion ? '💾 Actualizar Producto' : '✅ Guardar Producto'}
                        </button>

                        {modoEdicion && (
                            <button
                                type="button"
                                onClick={limpiarFormulario}
                                style={{ padding: '12px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '5px' }}
                            >
                                Cancelar
                            </button>
                        )}
                    </div>
                </form>
            </div>

            {/* BARRA DE BÚSQUEDA */}
            <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
                <input
                    type="text"
                    placeholder="🔍 Buscar por nombre, categoría o código..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    style={{ flex: 1, padding: '15px', fontSize: '16px', border: '2px solid #ddd', borderRadius: '8px' }}
                />
            </div>

            {/* TABLA MEJORADA */}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                    <thead style={{ background: '#333', color: 'white' }}>
                        <tr>
                            <th style={{ padding: '12px' }}>Producto</th>
                            <th>Categoría</th>
                            <th>Costo</th>
                            <th>Venta</th>
                            <th>Stock</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {productosFiltrados.map((prod) => (
                            <tr key={prod.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '12px' }}>
                                    <div style={{ fontWeight: 'bold' }}>{prod.nombre}</div>
                                    <small style={{ color: '#888' }}>{prod.codigo_barras || 'Sin código'}</small>
                                </td>
                                <td>
                                    {prod.categoria ? (
                                        <span style={{ background: '#eef', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', color: '#44a' }}>
                                            {prod.categoria}
                                        </span>
                                    ) : '-'}
                                </td>
                                <td>${prod.precio_compra}</td>
                                <td style={{ fontWeight: 'bold', color: '#28a745' }}>${prod.precio_venta}</td>
                                <td>
                                    <span style={{
                                        fontWeight: 'bold',
                                        color: prod.stock_actual <= prod.stock_minimo ? 'red' : 'black'
                                    }}>
                                        {prod.stock_actual}
                                    </span>
                                </td>
                                <td>
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                        <button
                                            onClick={() => cargarParaEditar(prod)}
                                            style={{ background: '#ffc107', color: '#333', border: 'none', padding: '5px 10px', borderRadius: '4px', fontSize: '12px' }}
                                        >
                                            ✏️ Editar
                                        </button>
                                        <button
                                            onClick={() => eliminarProducto(prod.id)}
                                            style={{ background: '#dc3545', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', fontSize: '12px' }}
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}

                        {productosFiltrados.length === 0 && (
                            <tr>
                                <td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                                    No se encontraron productos.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default Inventario;