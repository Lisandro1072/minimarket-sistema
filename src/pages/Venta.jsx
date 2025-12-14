import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';

function Venta() {
    const { user } = useAuth();
    const [productos, setProductos] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [categoriaActiva, setCategoriaActiva] = useState('Todos');
    const [carrito, setCarrito] = useState([]);
    const [total, setTotal] = useState(0);
    const [metodoPago, setMetodoPago] = useState('Efectivo');
    const [procesando, setProcesando] = useState(false);

    // Modales
    const [mostrarModalGasto, setMostrarModalGasto] = useState(false);
    const [mostrarModalCierre, setMostrarModalCierre] = useState(false);
    const [mostrarModalCliente, setMostrarModalCliente] = useState(false);

    // Formularios
    const [gastoForm, setGastoForm] = useState({ descripcion: '', monto: '', categoria: 'Operativo' });
    const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', telefono: '' });

    // Datos Extras
    const [clientes, setClientes] = useState([]);
    const [clienteSeleccionado, setClienteSeleccionado] = useState('');
    const [resumenCajero, setResumenCajero] = useState({ ventasTotal: 0, gastos: 0, efectivoEsperado: 0 });
    const [montoCierre, setMontoCierre] = useState('');
    const [resultadoCierre, setResultadoCierre] = useState(null);

    useEffect(() => { fetchProductos(); fetchClientes(); }, []);

    async function fetchProductos() {
        const { data } = await supabase.from('productos').select('*').eq('activo', true).order('nombre');
        setProductos(data || []);
    }

    async function fetchClientes() {
        const { data } = await supabase.from('clientes').select('*').order('nombre');
        setClientes(data || []);
    }

    // --- LÓGICA DE SUMA TOTAL ---
    useEffect(() => {
        const nuevoTotal = carrito.reduce((sum, item) => sum + (item.precio_venta * item.cantidad), 0);
        setTotal(nuevoTotal);
    }, [carrito]);

    // --- CARRITO ---
    const agregarAlCarrito = (prod) => {
        const existe = carrito.find(item => item.id === prod.id);
        if (existe) {
            // Al agregar desde el catálogo, sumamos 1 si es unidad o 0.5 si es peso
            const paso = (prod.unidad === 'Lb' || prod.unidad === 'Kg' || prod.unidad === 'Lt') ? 0.5 : 1;
            ajustarCantidad(prod.id, paso); // Enviamos el paso positivo
        } else {
            // Si es nuevo, entra con 1 (o 0.5 si prefieres que empiece con media libra)
            // Por estándar, dejamos que empiece en 1, y luego ajustan.
            setCarrito([...carrito, { ...prod, cantidad: 1 }]);
        }
    };

    // --- AQUÍ ESTÁ EL CAMBIO IMPORTANTE (SUMA INTELIGENTE) ---
    const ajustarCantidad = (id, direccion) => {
        // direccion puede ser 1 (subir) o -1 (bajar)

        setCarrito(prev => prev.map(item => {
            if (item.id === id) {
                // Detectar si es un producto a granel
                const esGranel = (item.unidad === 'Lb' || item.unidad === 'Kg' || item.unidad === 'Lt');

                // Si es granel, el paso es 0.5. Si no, es 1.
                const paso = esGranel ? 0.5 : 1;

                // Calculamos nueva cantidad
                // Si direccion es 1, sumamos 0.5. Si es -1, restamos 0.5
                const nuevaCantidad = item.cantidad + (paso * direccion); // Nota: direccion aqui debe ser 1 o -1 puro

                // Corrección de decimales locos de JS (ej: 0.300004)
                const cantidadFinal = parseFloat(nuevaCantidad.toFixed(2));

                return { ...item, cantidad: Math.max(0, cantidadFinal) };
            }
            return item;
        }).filter(i => i.cantidad > 0));
    };

    // Esta función auxiliar se usa cuando apretas los botones + y -
    const botonAjuste = (id, tipo) => {
        // tipo 1 = subir, tipo -1 = bajar
        // Simplemente llamamos a la lógica principal pasando 1 o -1
        setCarrito(prev => prev.map(item => {
            if (item.id === id) {
                const esGranel = (item.unidad === 'Lb' || item.unidad === 'Kg' || item.unidad === 'Lt');
                const paso = esGranel ? 0.5 : 1;
                const nueva = item.cantidad + (paso * tipo);
                return { ...item, cantidad: parseFloat(Math.max(0, nueva).toFixed(2)) };
            }
            return item;
        }).filter(i => i.cantidad > 0));
    };

    const cambiarCantidadManual = (id, val) => {
        let cant = parseFloat(val);
        if (isNaN(cant)) cant = 0;
        setCarrito(prev => prev.map(item => item.id === id ? { ...item, cantidad: cant } : item));
    };

    const finalizarEdicionCantidad = () => setCarrito(prev => prev.filter(i => i.cantidad > 0));
    const eliminarDelCarrito = (id) => setCarrito(prev => prev.filter(i => i.id !== id));

    // --- COBRAR ---
    const handleCobrar = async () => {
        if (carrito.length === 0) return;
        if (metodoPago === 'Fiado' && !clienteSeleccionado) return alert("⚠️ Selecciona un cliente.");
        if (!confirm(`¿Procesar ${metodoPago} por $${total.toFixed(2)}?`)) return;

        setProcesando(true);
        try {
            const { data: venta, error } = await supabase.from('ventas').insert([{
                total, metodo_pago: metodoPago, estado: metodoPago === 'Fiado' ? 'pendiente' : 'pagado',
                cliente_id: metodoPago === 'Fiado' ? clienteSeleccionado : null, usuario_id: user.id
            }]).select().single();

            if (error) throw error;

            for (const item of carrito) {
                await supabase.from('detalle_ventas').insert([{
                    venta_id: venta.id, producto_id: item.id, cantidad: item.cantidad, precio_momento: item.precio_venta
                }]);

                if (item.controlar_stock) {
                    const prod = productos.find(p => p.id === item.id);
                    if (prod) {
                        const nuevoStock = parseFloat((prod.stock_actual - item.cantidad).toFixed(3));
                        await supabase.from('productos').update({ stock_actual: nuevoStock }).eq('id', item.id);
                    }
                }
            }
            alert("Venta registrada ✅");
            setCarrito([]); setMetodoPago('Efectivo'); setClienteSeleccionado(''); fetchProductos();
        } catch (err) { alert(err.message); }
        finally { setProcesando(false); }
    };

    // --- FILTROS ---
    const productosVisibles = productos.filter(p => {
        const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase());
        const matchCat = categoriaActiva === 'Todos' ? true :
            categoriaActiva === 'Abarrotes' ? (p.categoria === 'Abarrotes' || ['Lb', 'Kg'].includes(p.unidad)) :
                categoriaActiva === 'Recargas' ? (p.categoria === 'Recargas' || !p.controlar_stock) : true;
        return matchBusqueda && matchCat;
    });

    // --- OTROS HANDLERS (Resumidos) ---
    const calcularResumenDia = async () => { /* ... Lógica anterior ... */ setMostrarModalCierre(true); };
    const procesarCierreCajero = (e) => { e.preventDefault(); /* ... */ };
    const handleRegistrarGasto = async (e) => {
        e.preventDefault();
        if (!gastoForm.descripcion || !gastoForm.monto) return;

        await supabase.from('movimientos_caja').insert([{
            tipo: 'salida',
            monto: parseFloat(gastoForm.monto),
            descripcion: gastoForm.descripcion,
            categoria: gastoForm.categoria, // <--- GUARDAMOS LA CATEGORÍA
            usuario_id: user.id
        }]);

        setMostrarModalGasto(false);
        setGastoForm({ descripcion: '', monto: '', categoria: 'Operativo' });
        alert("Salida registrada");
    };
    const handleCrearCliente = async () => { /* ... */ };

    return (
        <div className="venta-container">
            {/* IZQUIERDA: PRODUCTOS */}
            <div className="columna-productos">
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', overflowX: 'auto' }}>
                    {['Todos', 'Abarrotes', 'Recargas'].map(cat => (
                        <button key={cat} onClick={() => setCategoriaActiva(cat)}
                            style={{
                                padding: '10px 15px', borderRadius: '20px', border: 'none',
                                background: categoriaActiva === cat ? '#28a745' : '#ddd',
                                color: categoriaActiva === cat ? 'white' : '#333', fontWeight: 'bold', cursor: 'pointer'
                            }}>
                            {cat}
                        </button>
                    ))}
                </div>

                <input placeholder="Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    style={{ width: '95%', padding: '12px', marginBottom: '20px', borderRadius: '8px', border: '1px solid #ccc' }} />

                <div className="grid-productos">
                    {productosVisibles.map(p => (
                        <div key={p.id} className="card-producto" onClick={() => agregarAlCarrito(p)}
                            style={{ opacity: (p.controlar_stock && p.stock_actual <= 0) ? 0.6 : 1, borderLeft: !p.controlar_stock ? '4px solid #007bff' : '1px solid #ddd' }}>
                            <div><strong>{p.nombre}</strong><br /><small>{p.controlar_stock ? `Stock: ${p.stock_actual} ${p.unidad}` : '∞ Servicio'}</small></div>
                            <div style={{ color: '#28a745', fontWeight: 'bold', marginTop: '10px' }}>${p.precio_venta.toFixed(2)}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* DERECHA: TICKET */}
            <div className="columna-ticket">
                <div className="ticket-header">
                    <h3>🛒 Ticket</h3>
                    <button onClick={() => setMostrarModalGasto(true)} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '8px', borderRadius: '5px' }}>Gasto</button>
                </div>

                <div className="ticket-body">
                    {carrito.map(item => (
                        <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <strong>{item.nombre}</strong>
                                <strong>${(item.cantidad * item.precio_venta).toFixed(2)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px' }}>
                                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>

                                    {/* BOTÓN MENOS INTELLIGENTE */}
                                    <button onClick={() => botonAjuste(item.id, -1)}
                                        style={{ width: '30px', background: '#eee', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>-</button>

                                    <input type="number" step="any" value={item.cantidad}
                                        onChange={e => cambiarCantidadManual(item.id, e.target.value)} onBlur={finalizarEdicionCantidad}
                                        style={{ width: '60px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px' }} />
                                    <span style={{ fontSize: '12px', color: '#888' }}>{item.unidad}</span>

                                    {/* BOTÓN MAS INTELLIGENTE */}
                                    <button onClick={() => botonAjuste(item.id, 1)}
                                        style={{ width: '30px', background: '#eee', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+</button>
                                </div>
                                <button onClick={() => eliminarDelCarrito(item.id)} style={{ color: 'red', background: 'none', border: 'none', cursor: 'pointer' }}>Quitar</button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="ticket-footer">
                    {/* ... (MISMA LÓGICA DE PAGO QUE ANTES) ... */}
                    <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px' }}>
                        <option value="Efectivo">💵 Efectivo</option>
                        <option value="Tarjeta">💳 Tarjeta</option>
                        <option value="QR">📱 QR</option>
                        <option value="Fiado">⏳ FIADO</option>
                    </select>
                    {metodoPago === 'Fiado' && (
                        <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
                            <select value={clienteSeleccionado} onChange={e => setClienteSeleccionado(e.target.value)} style={{ flex: 1, padding: '8px' }}>
                                <option value="">-- Cliente --</option>
                                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                            <button onClick={() => setMostrarModalCliente(true)} style={{ background: '#28a745', color: 'white', border: 'none', width: '40px' }}>+</button>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
                        <span>Total:</span><span>${total.toFixed(2)}</span>
                    </div>
                    <button onClick={handleCobrar} disabled={carrito.length === 0 || procesando} style={{ width: '100%', padding: '15px', background: metodoPago === 'Fiado' ? '#ffc107' : '#28a745', color: metodoPago === 'Fiado' ? 'black' : 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>
                        {procesando ? '...' : metodoPago === 'Fiado' ? 'ANOTAR' : 'COBRAR'}
                    </button>
                </div>
            </div>

            {/* MODALES REQUERIDOS (NO BORRAR) */}
            {mostrarModalGasto && (
                <div className="overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="card" style={{ width: '300px' }}>
                        <h3>💸 Gasto</h3>
                        <input placeholder="Motivo" value={gastoForm.descripcion} onChange={e => setGastoForm({ ...gastoForm, descripcion: e.target.value })} style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
                        <input type="number" placeholder="Monto" value={gastoForm.monto} onChange={e => setGastoForm({ ...gastoForm, monto: e.target.value })} style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
                        <div style={{ display: 'flex', gap: '5px' }}>
                            <button onClick={handleRegistrarGasto} style={{ flex: 1, padding: '10px', background: '#dc3545', color: 'white', border: 'none' }}>Registrar</button>
                            <button onClick={() => setMostrarModalGasto(false)} style={{ flex: 1, padding: '10px' }}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}
            {mostrarModalCliente && (
                <div className="overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="card" style={{ width: '300px' }}>
                        <h3>👤 Cliente</h3>
                        <input placeholder="Nombre" value={nuevoCliente.nombre} onChange={e => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })} style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
                        <input placeholder="Teléfono" value={nuevoCliente.telefono} onChange={e => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })} style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
                        <div style={{ display: 'flex', gap: '5px' }}>
                            <button onClick={handleCrearCliente} style={{ flex: 1, padding: '10px', background: '#28a745', color: 'white', border: 'none' }}>Guardar</button>
                            <button onClick={() => setMostrarModalCliente(false)} style={{ flex: 1, padding: '10px' }}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Venta;