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
    const [garantiaTexto, setGarantiaTexto] = useState(''); // NUEVO: Para guardar qué dejó de garantía
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
            // Si es abarrotes (peso), sumar 0.5. Si no, 1.
            const paso = (prod.unidad === 'Lb' || prod.unidad === 'Kg' || prod.unidad === 'Lt') ? 0.5 : 1;
            ajustarCantidad(prod.id, paso);
        } else {
            setCarrito([...carrito, { ...prod, cantidad: 1 }]);
        }
    };

    const ajustarCantidad = (id, pasoReal) => {
        // pasoReal puede ser +1, -1, +0.5, -0.5 (ya calculado antes o aqui)
        setCarrito(prev => prev.map(item => {
            if (item.id === id) {
                const nueva = parseFloat((item.cantidad + pasoReal).toFixed(3));
                return { ...item, cantidad: Math.max(0, nueva) };
            }
            return item;
        }).filter(i => i.cantidad > 0));
    };

    const botonAjuste = (id, direccion) => {
        // direccion 1 o -1
        const item = carrito.find(i => i.id === id);
        if (!item) return;
        const esGranel = ['Lb', 'Kg', 'Lt'].includes(item.unidad);
        const paso = (esGranel ? 0.5 : 1) * direccion;
        ajustarCantidad(id, paso);
    };

    const cambiarCantidadManual = (id, val) => {
        let cant = parseFloat(val); if (isNaN(cant)) cant = 0;
        setCarrito(prev => prev.map(item => item.id === id ? { ...item, cantidad: cant } : item));
    };

    const finalizarEdicionCantidad = () => setCarrito(prev => prev.filter(i => i.cantidad > 0));
    const eliminarDelCarrito = (id) => setCarrito(prev => prev.filter(i => i.id !== id));

    // --- COBRAR ---
    const handleCobrar = async () => {
        if (carrito.length === 0) return;
        if (metodoPago === 'Fiado' && !clienteSeleccionado) return alert("⚠️ Selecciona un cliente para fiar.");

        if (!confirm(`¿Procesar ${metodoPago} por $${total.toFixed(2)}?`)) return;

        setProcesando(true);
        try {
            // 1. Registrar Venta con Garantía
            const { data: venta, error } = await supabase.from('ventas').insert([{
                total,
                metodo_pago: metodoPago,
                estado: metodoPago === 'Fiado' ? 'pendiente' : 'pagado',
                cliente_id: metodoPago === 'Fiado' ? clienteSeleccionado : null,
                usuario_id: user.id,
                garantia: metodoPago === 'Fiado' ? garantiaTexto : null // <--- GUARDAR OBJETO DEJADO
            }]).select().single();

            if (error) throw error;

            // 2. Registrar Detalles y Restar Stock
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

            // 3. Confirmación
            if (metodoPago === 'Fiado' && garantiaTexto) {
                alert(`✅ Fiado registrado con Garantía.\n\n🏷️ ETIQUETA LA BOLSA CON EL ID: #${venta.id}`);
            } else {
                alert("Venta registrada ✅");
            }

            // Limpieza
            setCarrito([]);
            setMetodoPago('Efectivo');
            setClienteSeleccionado('');
            setGarantiaTexto('');
            fetchProductos();
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

    // --- EXTRAS: GASTOS Y CIERRE ---
    const handleRegistrarGasto = async (e) => {
        e.preventDefault();
        if (!gastoForm.descripcion || !gastoForm.monto) return;
        await supabase.from('movimientos_caja').insert([{
            tipo: 'salida', monto: parseFloat(gastoForm.monto), descripcion: gastoForm.descripcion,
            categoria: gastoForm.categoria, usuario_id: user.id
        }]);
        setMostrarModalGasto(false); setGastoForm({ descripcion: '', monto: '', categoria: 'Operativo' });
        alert("Salida registrada");
    };

    const handleCrearCliente = async () => { /* ... Misma lógica crear cliente ... */
        if (!nuevoCliente.nombre) return alert("Nombre requerido");
        const { data } = await supabase.from('clientes').insert([nuevoCliente]).select().single();
        if (data) {
            setClientes([...clientes, data]); setClienteSeleccionado(data.id); setMostrarModalCliente(false); setNuevoCliente({ nombre: '', telefono: '' });
        }
    };

    const calcularResumenDia = async () => {
        /* ... Lógica de cierre ciego ... */
        const hoy = new Date().toISOString().slice(0, 10);
        const { data: v } = await supabase.from('ventas').select('total, metodo_pago').gte('fecha', `${hoy}T00:00:00`).lte('fecha', `${hoy}T23:59:59`);
        const { data: g } = await supabase.from('movimientos_caja').select('monto').eq('tipo', 'salida').gte('fecha', `${hoy}T00:00:00`).lte('fecha', `${hoy}T23:59:59`);

        let tVentas = 0, tEfec = 0, tGastos = 0;
        v?.forEach(i => { tVentas += i.total; if (i.metodo_pago === 'Efectivo') tEfec += i.total; });
        g?.forEach(i => tGastos += i.monto);

        setResumenCajero({ ventasTotal: tVentas, gastos: tGastos, efectivoEsperado: tEfec - tGastos });
        setResultadoCierre(null); setMontoCierre(''); setMostrarModalCierre(true);
    };

    const procesarCierreCajero = (e) => {
        e.preventDefault();
        const contado = parseFloat(montoCierre) || 0;
        const dif = contado - resumenCajero.efectivoEsperado;
        setResultadoCierre({ esperado: resumenCajero.efectivoEsperado, contado, diferencia: dif, estado: Math.abs(dif) < 0.5 ? 'OK' : (dif < 0 ? 'FALTA' : 'SOBRA') });
    };

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
                    <div style={{ display: 'flex', gap: '5px' }}>
                        <button onClick={calcularResumenDia} style={{ background: '#6f42c1', color: 'white', border: 'none', padding: '8px', borderRadius: '5px', cursor: 'pointer' }} title="Cierre Cajero">👤 Mi Caja</button>
                        <button onClick={() => setMostrarModalGasto(true)} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '8px', borderRadius: '5px', cursor: 'pointer' }}>💸 Gasto</button>
                    </div>
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
                                    <button onClick={() => botonAjuste(item.id, -1)} style={{ width: '30px', background: '#eee', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>-</button>
                                    <input type="number" step="any" value={item.cantidad} onChange={e => cambiarCantidadManual(item.id, e.target.value)} onBlur={finalizarEdicionCantidad} style={{ width: '60px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px' }} />
                                    <span style={{ fontSize: '12px', color: '#888' }}>{item.unidad}</span>
                                    <button onClick={() => botonAjuste(item.id, 1)} style={{ width: '30px', background: '#eee', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+</button>
                                </div>
                                <button onClick={() => eliminarDelCarrito(item.id)} style={{ color: 'red', background: 'none', border: 'none', cursor: 'pointer' }}>Quitar</button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="ticket-footer">
                    <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px' }}>
                        <option value="Efectivo">💵 Efectivo</option>
                        <option value="Tarjeta">💳 Tarjeta</option>
                        <option value="QR">📱 QR</option>
                        <option value="Fiado">⏳ FIADO</option>
                    </select>

                    {metodoPago === 'Fiado' && (
                        <div style={{ background: '#fff3cd', padding: '10px', borderRadius: '5px', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                                <select value={clienteSeleccionado} onChange={e => setClienteSeleccionado(e.target.value)} style={{ flex: 1, padding: '8px' }}>
                                    <option value="">-- Cliente --</option>
                                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                </select>
                                <button onClick={() => setMostrarModalCliente(true)} style={{ background: '#28a745', color: 'white', border: 'none', width: '40px', borderRadius: '4px' }}>+</button>
                            </div>
                            <input type="text" placeholder="¿Deja garantía? (Ej: Reloj)" value={garantiaTexto} onChange={e => setGarantiaTexto(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box', border: '1px solid #ccc' }} />
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
                        <span>Total:</span><span>${total.toFixed(2)}</span>
                    </div>
                    <button onClick={handleCobrar} disabled={carrito.length === 0 || procesando} style={{ width: '100%', padding: '15px', background: metodoPago === 'Fiado' ? '#ffc107' : '#28a745', color: metodoPago === 'Fiado' ? 'black' : 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '20px', cursor: 'pointer' }}>
                        {procesando ? '...' : metodoPago === 'Fiado' ? 'ANOTAR DEUDA' : 'COBRAR'}
                    </button>
                </div>
            </div>

            {/* --- MODAL GASTO --- */}
            {mostrarModalGasto && (
                <div className="overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
                    <div className="card" style={{ width: '300px' }}>
                        <h3>💸 Salida de Dinero</h3>
                        <select value={gastoForm.categoria} onChange={e => setGastoForm({ ...gastoForm, categoria: e.target.value })} style={{ width: '100%', marginBottom: '10px', padding: '10px' }}>
                            <option value="Operativo">🔴 Gasto (Luz/Comida)</option>
                            <option value="Activo Fijo">🔵 Inversión (Estantes)</option>
                        </select>
                        <input placeholder="Motivo" value={gastoForm.descripcion} onChange={e => setGastoForm({ ...gastoForm, descripcion: e.target.value })} style={{ width: '100%', marginBottom: '10px', padding: '10px', boxSizing: 'border-box' }} />
                        <input type="number" placeholder="Monto" value={gastoForm.monto} onChange={e => setGastoForm({ ...gastoForm, monto: e.target.value })} style={{ width: '100%', marginBottom: '10px', padding: '10px', boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={handleRegistrarGasto} style={{ flex: 1, padding: '10px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '5px' }}>Registrar</button>
                            <button onClick={() => setMostrarModalGasto(false)} style={{ flex: 1, padding: '10px', background: '#eee', border: 'none', borderRadius: '5px' }}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL CLIENTE --- */}
            {mostrarModalCliente && (
                <div className="overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
                    <div className="card" style={{ width: '300px' }}>
                        <h3>👤 Nuevo Cliente</h3>
                        <input placeholder="Nombre" value={nuevoCliente.nombre} onChange={e => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })} style={{ width: '100%', marginBottom: '10px', padding: '10px', boxSizing: 'border-box' }} />
                        <input placeholder="Teléfono" value={nuevoCliente.telefono} onChange={e => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })} style={{ width: '100%', marginBottom: '10px', padding: '10px', boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={handleCrearCliente} style={{ flex: 1, padding: '10px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px' }}>Guardar</button>
                            <button onClick={() => setMostrarModalCliente(false)} style={{ flex: 1, padding: '10px', background: '#eee', border: 'none', borderRadius: '5px' }}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL CIERRE CAJERO --- */}
            {mostrarModalCierre && (
                <div className="overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
                    <div className="card" style={{ width: '350px', textAlign: 'center' }}>
                        <h3>👤 Mi Caja (Turno)</h3>
                        {!resultadoCierre ? (
                            <form onSubmit={procesarCierreCajero}>
                                <div style={{ background: '#f8f9fa', padding: '10px', marginBottom: '15px', textAlign: 'left', borderRadius: '5px' }}>
                                    <p>Ventas Efectivo Hoy: <strong>${(resumenCajero.efectivoEsperado + resumenCajero.gastos).toFixed(2)}</strong></p>
                                    <p style={{ color: 'red' }}>Gastos (Salidas): <strong>-${resumenCajero.gastos.toFixed(2)}</strong></p>
                                    <hr />
                                    <p>Debes tener en mano: <strong>${resumenCajero.efectivoEsperado.toFixed(2)}</strong></p>
                                </div>
                                <input type="number" step="any" placeholder="¿Cuánto contaste?" value={montoCierre} onChange={e => setMontoCierre(e.target.value)} style={{ width: '80%', padding: '10px', fontSize: '18px', textAlign: 'center', marginBottom: '15px', border: '2px solid #6f42c1', borderRadius: '5px' }} autoFocus />
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button type="submit" style={{ flex: 1, padding: '10px', background: '#6f42c1', color: 'white', border: 'none', borderRadius: '5px' }}>Verificar</button>
                                    <button type="button" onClick={() => setMostrarModalCierre(false)} style={{ flex: 1, padding: '10px', background: '#eee', border: 'none', borderRadius: '5px' }}>Cancelar</button>
                                </div>
                            </form>
                        ) : (
                            <div>
                                <div style={{ fontSize: '3rem', margin: '10px 0' }}>{resultadoCierre.estado === 'OK' ? '✅' : resultadoCierre.estado === 'FALTA' ? '❌' : '⚠️'}</div>
                                <p style={{ fontWeight: 'bold', fontSize: '1.2rem', color: resultadoCierre.estado === 'OK' ? 'green' : 'red' }}>
                                    {resultadoCierre.estado === 'OK' ? '¡Cuadra Perfecto!' :
                                        resultadoCierre.estado === 'FALTA' ? `Faltan $${Math.abs(resultadoCierre.diferencia).toFixed(2)}` :
                                            `Sobran $${resultadoCierre.diferencia.toFixed(2)}`}
                                </p>
                                <button onClick={() => setMostrarModalCierre(false)} style={{ width: '100%', padding: '10px', background: '#333', color: 'white', border: 'none', borderRadius: '5px', marginTop: '10px' }}>Cerrar</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
}

export default Venta;