import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';

function Inventario() {
    const { user } = useAuth();
    const [productos, setProductos] = useState([]);
    const [busqueda, setBusqueda] = useState('');

    // Estados CRUD
    const [modoEdicion, setModoEdicion] = useState(null);
    const [form, setForm] = useState({
        codigo_barras: '', nombre: '', categoria: '', unidad: 'Unid',
        controlar_stock: true, precio_compra: '', precio_venta: '',
        stock_actual: '', stock_minimo: 5
    });

    // ESTADOS FINANCIEROS
    const [finanzas, setFinanzas] = useState({
        valorMercaderia: 0, // Stock * Costo
        valorActivos: 0,    // Estantes, Equipos (Gastos tipo 'Activo Fijo')
        capitalInyectado: 0 // Dinero metido al negocio (Entradas)
    });

    // Modales
    const [modalStock, setModalStock] = useState({ visible: false, id: null, nombre: '', cantidad: '' });
    const [modalInversion, setModalInversion] = useState(false);
    const [montoInversion, setMontoInversion] = useState('');

    useEffect(() => {
        fetchProductos();
        fetchDatosFinancieros();
    }, []);

    // --- 1. CARGA DE DATOS ---
    async function fetchProductos() {
        const { data } = await supabase.from('productos').select('*').eq('activo', true).order('id', { ascending: false });
        if (data) {
            setProductos(data);
            calcularValorMercaderia(data);
        }
    }

    const calcularValorMercaderia = (lista) => {
        const total = lista.reduce((acc, p) => {
            // Solo sumamos el stock físico que controlamos
            const stock = p.controlar_stock ? (p.stock_actual || 0) : 0;
            return acc + (stock * (p.precio_compra || 0));
        }, 0);
        setFinanzas(prev => ({ ...prev, valorMercaderia: total }));
    };

    async function fetchDatosFinancieros() {
        // 1. Calcular Capital Inyectado (Entradas manuales)
        const { data: entradas } = await supabase.from('movimientos_caja')
            .select('monto').eq('tipo', 'entrada');
        const capital = entradas?.reduce((acc, item) => acc + item.monto, 0) || 0;

        // 2. Calcular Valor de Activos Fijos (Salidas marcadas como Activo Fijo)
        const { data: activos } = await supabase.from('movimientos_caja')
            .select('monto').eq('tipo', 'salida').eq('categoria', 'Activo Fijo');
        const muebles = activos?.reduce((acc, item) => acc + item.monto, 0) || 0;

        setFinanzas(prev => ({
            ...prev,
            capitalInyectado: capital,
            valorActivos: muebles
        }));
    }

    // --- 2. LÓGICA PRODUCTOS (CRUD) ---
    const handleChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setForm({ ...form, [e.target.name]: value });
    };

    async function handleSubmit(e) {
        e.preventDefault();
        if (!form.nombre || !form.precio_venta) return alert("Datos incompletos");

        const datosProducto = {
            codigo_barras: form.codigo_barras.trim() === '' ? null : form.codigo_barras,
            nombre: form.nombre, categoria: form.categoria, unidad: form.unidad,
            controlar_stock: form.controlar_stock,
            precio_compra: parseFloat(form.precio_compra) || 0,
            precio_venta: parseFloat(form.precio_venta) || 0,
            stock_actual: form.controlar_stock ? (parseFloat(form.stock_actual) || 0) : 0,
            stock_minimo: parseFloat(form.stock_minimo) || 5,
            activo: true
        };

        try {
            if (modoEdicion) {
                await supabase.from('productos').update(datosProducto).eq('id', modoEdicion);
                alert("Actualizado ✅");
            } else {
                await supabase.from('productos').insert([datosProducto]);
                alert("Creado ✅");
            }
            limpiarFormulario();
            fetchProductos();
        } catch (error) { alert("Error: " + error.message); }
    }

    const cargarParaEditar = (prod) => {
        setModoEdicion(prod.id);
        setForm({ ...prod, codigo_barras: prod.codigo_barras || '' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const eliminarProducto = async (id) => {
        if (confirm('¿Borrar producto?')) {
            await supabase.from('productos').update({ activo: false }).eq('id', id);
            fetchProductos();
        }
    };

    const limpiarFormulario = () => {
        setModoEdicion(null);
        setForm({
            codigo_barras: '', nombre: '', categoria: '', unidad: 'Unid', controlar_stock: true,
            precio_compra: '', precio_venta: '', stock_actual: '', stock_minimo: 5
        });
    };

    // --- 3. MODALES DE STOCK Y CAPITAL ---
    const abrirModalStock = (prod) => setModalStock({ visible: true, id: prod.id, nombre: prod.nombre, cantidad: '' });

    const guardarNuevoStock = async (e) => {
        e.preventDefault();
        const cant = parseFloat(modalStock.cantidad);
        if (!cant || cant <= 0) return;
        const prod = productos.find(p => p.id === modalStock.id);
        const nuevo = parseFloat(prod.stock_actual) + cant;

        await supabase.from('productos').update({ stock_actual: nuevo }).eq('id', modalStock.id);
        alert(`Stock actualizado. Total: ${nuevo}`);
        setModalStock({ visible: false, id: null, nombre: '', cantidad: '' });
        fetchProductos();
    };

    const guardarInversion = async (e) => {
        e.preventDefault();
        const monto = parseFloat(montoInversion);
        if (!monto || monto <= 0) return;

        await supabase.from('movimientos_caja').insert([{
            tipo: 'entrada',
            monto: monto,
            descripcion: 'Inyección de Capital (Socio/Préstamo) 💰',
            categoria: 'Capital',
            usuario_id: user.id
        }]);

        alert("Capital registrado ✅");
        setModalInversion(false);
        setMontoInversion('');
        fetchDatosFinancieros();
    };

    const filtrados = productos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()));

    // CÁLCULO DEL PATRIMONIO TOTAL
    const patrimonioTotal = finanzas.valorMercaderia + finanzas.valorActivos;
    // Nota: Al patrimonio se le suele sumar la caja actual, pero aquí mostramos valor de activos físicos.

    return (
        <div className="container">

            {/* DASHBOARD DE CAPITAL */}
            <h2 style={{ marginBottom: '10px' }}>💰 Estado de Inversión</h2>
            <div className="form-grid" style={{ marginBottom: '30px' }}>

                {/* 1. Capital Externo (Lo que te prestaron o pusiste) */}
                <div className="card" style={{ borderLeft: '5px solid #6f42c1', position: 'relative' }}>
                    <button onClick={() => setModalInversion(true)} style={{ position: 'absolute', top: '10px', right: '10px', background: '#6f42c1', color: 'white', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', fontSize: '18px' }} title="Inyectar Dinero">+</button>
                    <h4 style={{ margin: '0 0 5px 0', color: '#666' }}>Capital Inyectado</h4>
                    <h2 style={{ margin: 0, color: '#6f42c1' }}>${finanzas.capitalInyectado.toFixed(2)}</h2>
                    <small>Dinero externo (Préstamos/Ahorros)</small>
                </div>

                {/* 2. Valor Mercadería */}
                <div className="card" style={{ borderLeft: '5px solid #17a2b8' }}>
                    <h4 style={{ margin: '0 0 5px 0', color: '#666' }}>📦 En Mercadería</h4>
                    <h2 style={{ margin: 0, color: '#17a2b8' }}>${finanzas.valorMercaderia.toFixed(2)}</h2>
                    <small>Costo de tus productos actuales</small>
                </div>

                {/* 3. Valor Activos Fijos */}
                <div className="card" style={{ borderLeft: '5px solid #ffc107' }}>
                    <h4 style={{ margin: '0 0 5px 0', color: '#666' }}>🏗️ Mobiliario y Equipos</h4>
                    <h2 style={{ margin: 0, color: '#ffc107' }}>${finanzas.valorActivos.toFixed(2)}</h2>
                    <small>Estantes, Congeladores, etc.</small>
                </div>

                {/* 4. Total Activos */}
                <div className="card" style={{ background: '#333', color: 'white' }}>
                    <h4 style={{ margin: '0 0 5px 0', color: '#ccc' }}>Valor Físico Total</h4>
                    <h2 style={{ margin: 0, color: '#28a745' }}>${patrimonioTotal.toFixed(2)}</h2>
                    <small>Mercadería + Mobiliario</small>
                </div>

            </div>

            <h2>📦 Gestión de Productos</h2>

            {/* FORMULARIO */}
            <div className="card">
                <h3 style={{ marginTop: 0, color: modoEdicion ? '#007bff' : '#28a745' }}>
                    {modoEdicion ? '✏️ Editar' : '➕ Crear Producto'}
                </h3>
                <form onSubmit={handleSubmit} className="form-grid">
                    <input name="codigo_barras" placeholder="Código" value={form.codigo_barras} onChange={handleChange} style={inputStyle} />
                    <input name="nombre" placeholder="Nombre *" value={form.nombre} onChange={handleChange} style={inputStyle} required />

                    <select name="categoria" value={form.categoria} onChange={handleChange} style={inputStyle} required>
                        <option value="">-- Categoría --</option>
                        <option value="Abarrotes">⚖️ Abarrotes</option>
                        <option value="Bebidas">🥤 Bebidas</option>
                        <option value="Snacks">🍪 Snacks</option>
                        <option value="Limpieza">🧹 Limpieza</option>
                        <option value="Lácteos">🥛 Lácteos</option>
                        <option value="Recargas">📱 Recargas</option>
                        <option value="General">📦 General</option>
                    </select>

                    <select name="unidad" value={form.unidad} onChange={handleChange} style={inputStyle}>
                        <option value="Unid">Unidad</option>
                        <option value="Lb">Libra</option>
                        <option value="Kg">Kilo</option>
                        <option value="Lt">Litro</option>
                        <option value="Serv">Servicio</option>
                    </select>

                    <input type="number" step="0.01" name="precio_compra" placeholder="Costo ($)" value={form.precio_compra} onChange={handleChange} style={inputStyle} />
                    <input type="number" step="0.01" name="precio_venta" placeholder="Venta ($)" value={form.precio_venta} onChange={handleChange} style={inputStyle} required />

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f9f9f9', padding: '0 10px', borderRadius: '5px' }}>
                        <input type="checkbox" name="controlar_stock" checked={form.controlar_stock} onChange={handleChange} />
                        <label>Controlar Stock</label>
                    </div>

                    {form.controlar_stock && (
                        <>
                            <input type="number" step="0.001" name="stock_actual" placeholder="Stock" value={form.stock_actual} onChange={handleChange} style={inputStyle} />
                            <input type="number" step="0.001" name="stock_minimo" placeholder="Mínimo" value={form.stock_minimo} onChange={handleChange} style={inputStyle} />
                        </>
                    )}

                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', marginTop: '10px' }}>
                        <button type="submit" style={{ flex: 1, padding: '12px', background: modoEdicion ? '#007bff' : '#28a745', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>
                            {modoEdicion ? 'Guardar' : 'Crear'}
                        </button>
                        {modoEdicion && <button type="button" onClick={limpiarFormulario} style={{ background: '#6c757d', color: 'white', border: 'none', padding: '10px', borderRadius: '5px', cursor: 'pointer' }}>Cancelar</button>}
                    </div>
                </form>
            </div>

            <input type="text" placeholder="🔍 Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                style={{ width: '100%', padding: '15px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '20px', boxSizing: 'border-box' }} />

            <div className="table-responsive">
                <table>
                    <thead><tr><th>Producto</th><th>Tipo</th><th>Costo</th><th>Venta</th><th>Stock</th><th>Acción</th></tr></thead>
                    <tbody>
                        {filtrados.map(p => (
                            <tr key={p.id}>
                                <td><strong>{p.nombre}</strong><br /><small>{p.categoria}</small></td>
                                <td>{p.unidad}</td>
                                <td>${p.precio_compra}</td>
                                <td style={{ color: 'green', fontWeight: 'bold' }}>${p.precio_venta.toFixed(2)}</td>
                                <td>
                                    {p.controlar_stock ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span style={{ color: p.stock_actual <= p.stock_minimo ? 'red' : 'black', fontWeight: 'bold' }}>{p.stock_actual}</span>
                                            <button onClick={() => abrirModalStock(p)} style={{ background: '#28a745', color: 'white', border: 'none', borderRadius: '50%', width: '25px', height: '25px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                                        </div>
                                    ) : '∞'}
                                </td>
                                <td>
                                    <button onClick={() => cargarParaEditar(p)} style={{ marginRight: '5px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px' }}>✏️</button>
                                    <button onClick={() => eliminarProducto(p.id)} style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px' }}>🗑️</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* MODAL STOCK */}
            {modalStock.visible && (
                <div className="overlay" style={overlayStyle}>
                    <div className="card" style={{ width: '300px', textAlign: 'center' }}>
                        <h3>📦 Reponer Stock</h3>
                        <p>{modalStock.nombre}</p>
                        <form onSubmit={guardarNuevoStock}>
                            <input type="number" step="any" placeholder="Cantidad" value={modalStock.cantidad} onChange={e => setModalStock({ ...modalStock, cantidad: e.target.value })} style={{ ...inputStyle, textAlign: 'center', fontSize: '18px' }} autoFocus />
                            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                                <button type="submit" style={{ flex: 1, padding: '10px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px' }}>Agregar</button>
                                <button type="button" onClick={() => setModalStock({ visible: false, id: null, nombre: '', cantidad: '' })} style={{ flex: 1, padding: '10px', background: '#ccc', border: 'none', borderRadius: '5px' }}>Cancelar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL INVERSIÓN */}
            {modalInversion && (
                <div className="overlay" style={overlayStyle}>
                    <div className="card" style={{ width: '300px', textAlign: 'center' }}>
                        <h3>💰 Inyectar Capital</h3>
                        <p>Préstamo o Ahorros</p>
                        <form onSubmit={guardarInversion}>
                            <input type="number" step="any" placeholder="Monto ($)" value={montoInversion} onChange={e => setMontoInversion(e.target.value)} style={{ ...inputStyle, textAlign: 'center', fontSize: '18px' }} autoFocus />
                            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                                <button type="submit" style={{ flex: 1, padding: '10px', background: '#6f42c1', color: 'white', border: 'none', borderRadius: '5px' }}>Registrar</button>
                                <button type="button" onClick={() => setModalInversion(false)} style={{ flex: 1, padding: '10px', background: '#ccc', border: 'none', borderRadius: '5px' }}>Cancelar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}

const inputStyle = { padding: '10px', borderRadius: '5px', border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' };
const overlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 };

export default Inventario;