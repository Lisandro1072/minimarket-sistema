import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider'; // Importamos para saber quién es el cajero

function Venta() {
    const { user } = useAuth(); // Obtenemos el usuario logueado
    const [productos, setProductos] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [carrito, setCarrito] = useState([]);
    const [total, setTotal] = useState(0);
    const [metodoPago, setMetodoPago] = useState('Efectivo');
    const [procesando, setProcesando] = useState(false);

    // Modales
    const [mostrarModalGasto, setMostrarModalGasto] = useState(false);
    const [mostrarModalCierre, setMostrarModalCierre] = useState(false); // Nuevo para cajero
    const [mostrarModalCliente, setMostrarModalCliente] = useState(false);

    // Formularios
    const [gastoForm, setGastoForm] = useState({ descripcion: '', monto: '' });
    const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', telefono: '' });

    // Datos para Fiado
    const [clientes, setClientes] = useState([]);
    const [clienteSeleccionado, setClienteSeleccionado] = useState('');

    // Datos para Cierre de Caja del Cajero
    const [resumenCajero, setResumenCajero] = useState({ ventas: 0, gastos: 0, efectivoEsperado: 0 });
    const [montoCierre, setMontoCierre] = useState('');
    const [resultadoCierre, setResultadoCierre] = useState(null);

    useEffect(() => {
        fetchProductos();
        fetchClientes();
    }, []);

    async function fetchProductos() {
        const { data } = await supabase.from('productos').select('*').eq('activo', true).order('nombre');
        setProductos(data || []);
    }

    async function fetchClientes() {
        const { data } = await supabase.from('clientes').select('*').order('nombre');
        setClientes(data || []);
    }

    // --- CALCULAR RESUMEN PARA EL CAJERO (MI DÍA) ---
    const calcularResumenDia = async () => {
        const hoy = new Date().toISOString().slice(0, 10);
        const inicio = `${hoy}T00:00:00`;
        const fin = `${hoy}T23:59:59`;

        // 1. Sus Ventas en Efectivo (Globales del día para la caja física)
        // Nota: Usualmente la caja física es una sola, así que contamos TODAS las ventas en efectivo del día,
        // independientemente de si hay varios cajeros turnándose en la misma PC.
        const { data: v } = await supabase.from('ventas')
            .select('total, metodo_pago')
            .gte('fecha', inicio).lte('fecha', fin);

        // 2. Gastos del día
        const { data: g } = await supabase.from('movimientos_caja')
            .select('monto')
            .eq('tipo', 'salida')
            .gte('fecha', inicio).lte('fecha', fin);

        let tVentas = 0, tEfectivo = 0, tGastos = 0;

        v?.forEach(item => {
            tVentas += item.total;
            if (item.metodo_pago === 'Efectivo') tEfectivo += item.total;
        });

        g?.forEach(item => tGastos += item.monto);

        setResumenCajero({
            ventasTotal: tVentas,
            gastos: tGastos,
            efectivoEsperado: tEfectivo - tGastos // Esto es lo que debe haber en el cajón
        });

        setResultadoCierre(null);
        setMontoCierre('');
        setMostrarModalCierre(true);
    };

    const procesarCierreCajero = (e) => {
        e.preventDefault();
        const contado = parseFloat(montoCierre) || 0;
        const diferencia = contado - resumenCajero.efectivoEsperado;

        setResultadoCierre({
            esperado: resumenCajero.efectivoEsperado,
            contado,
            diferencia,
            estado: Math.abs(diferencia) < 0.5 ? 'OK' : (diferencia < 0 ? 'FALTA' : 'SOBRA')
        });
    };

    // --- LÓGICA DE CARRITO Y SUMA ---
    useEffect(() => {
        const nuevoTotal = carrito.reduce((sum, item) => {
            const pLimpio = parseFloat(String(item.precio_venta).replace(/[^0-9.]/g, '')) || 0;
            return sum + (pLimpio * item.cantidad);
        }, 0);
        setTotal(nuevoTotal);
    }, [carrito]);

    const agregarAlCarrito = (prod) => {
        const existe = carrito.find(item => item.id === prod.id);
        if (existe) ajustarCantidad(prod.id, 1);
        else setCarrito([...carrito, { ...prod, cantidad: 1 }]);
    };

    const ajustarCantidad = (id, cant) => {
        setCarrito(prev => prev.map(item => item.id === id ? { ...item, cantidad: Math.max(0, item.cantidad + cant) } : item).filter(i => i.cantidad > 0));
    };

    const cambiarCantidadManual = (id, val) => {
        const cant = parseInt(val) || 0;
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
                total,
                metodo_pago: metodoPago,
                estado: metodoPago === 'Fiado' ? 'pendiente' : 'pagado',
                cliente_id: metodoPago === 'Fiado' ? clienteSeleccionado : null,
                usuario_id: user.id // <--- AQUÍ GUARDAMOS QUIÉN VENDIÓ
            }]).select().single();

            if (error) throw error;

            for (const item of carrito) {
                const pLimpio = parseFloat(String(item.precio_venta).replace(/[^0-9.]/g, '')) || 0;
                await supabase.from('detalle_ventas').insert([{
                    venta_id: venta.id, producto_id: item.id, cantidad: item.cantidad, precio_momento: pLimpio
                }]);

                const prod = productos.find(p => p.id === item.id);
                if (prod) {
                    await supabase.from('productos').update({ stock_actual: prod.stock_actual - item.cantidad }).eq('id', item.id);
                }
            }

            alert("Venta registrada ✅");
            setCarrito([]);
            setMetodoPago('Efectivo');
            setClienteSeleccionado('');
            fetchProductos();
        } catch (err) { alert(err.message); }
        finally { setProcesando(false); }
    };

    // --- CREAR CLIENTE Y GASTOS ---
    const handleCrearCliente = async () => {
        if (!nuevoCliente.nombre) return alert("Nombre requerido");
        const { data } = await supabase.from('clientes').insert([nuevoCliente]).select().single();
        if (data) {
            setClientes([...clientes, data]);
            setClienteSeleccionado(data.id);
            setMostrarModalCliente(false);
            setNuevoCliente({ nombre: '', telefono: '' });
        }
    };

    const handleRegistrarGasto = async () => {
        if (!gastoForm.descripcion || !gastoForm.monto) return;
        await supabase.from('movimientos_caja').insert([{
            tipo: 'salida',
            monto: parseFloat(gastoForm.monto),
            descripcion: gastoForm.descripcion,
            usuario_id: user.id // <--- QUIÉN REGISTRÓ EL GASTO
        }]);
        setMostrarModalGasto(false);
        setGastoForm({ descripcion: '', monto: '' });
        alert("Gasto registrado");
    };

    const filtrados = productos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()));

    return (
        <div className="venta-container">
            {/* IZQUIERDA: PRODUCTOS */}
            <div className="columna-productos">
                <h2>🔍 Productos</h2>
                <input placeholder="Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    style={{ width: '95%', padding: '12px', marginBottom: '20px', borderRadius: '8px', border: '1px solid #ccc' }} />

                <div className="grid-productos">
                    {filtrados.map(p => (
                        <div key={p.id} className="card-producto" onClick={() => agregarAlCarrito(p)} style={{ opacity: p.stock_actual <= 0 ? 0.6 : 1 }}>
                            <div><strong>{p.nombre}</strong><br /><small>{p.stock_actual} unid.</small></div>
                            <div style={{ color: '#28a745', fontWeight: 'bold', marginTop: '10px' }}>${p.precio_venta}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* DERECHA: TICKET */}
            <div className="columna-ticket">
                <div className="ticket-header">
                    <h3>🛒 Ticket</h3>
                    <div style={{ display: 'flex', gap: '5px' }}>
                        <button onClick={calcularResumenDia} style={{ background: '#6f42c1', color: 'white', border: 'none', padding: '8px', borderRadius: '5px', cursor: 'pointer' }} title="Cierre de Caja">👤 Mi Caja</button>
                        <button onClick={() => setMostrarModalGasto(true)} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '8px', borderRadius: '5px', cursor: 'pointer' }}>💸 Gasto</button>
                    </div>
                </div>

                <div className="ticket-body">
                    {carrito.length === 0 && <p style={{ textAlign: 'center', color: '#999', marginTop: '20px' }}>Carrito vacío</p>}
                    {carrito.map(item => (
                        <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <strong>{item.nombre}</strong>
                                <strong>${(item.cantidad * (parseFloat(String(item.precio_venta).replace(/[^0-9.]/g, '')) || 0)).toFixed(2)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px' }}>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    <button onClick={() => ajustarCantidad(item.id, -1)} style={{ width: '30px', background: '#eee', border: 'none', borderRadius: '4px' }}>-</button>
                                    <input type="number" value={item.cantidad} onChange={e => cambiarCantidadManual(item.id, e.target.value)} onBlur={finalizarEdicionCantidad} style={{ width: '40px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px' }} />
                                    <button onClick={() => ajustarCantidad(item.id, 1)} style={{ width: '30px', background: '#eee', border: 'none', borderRadius: '4px' }}>+</button>
                                </div>
                                <button onClick={() => eliminarDelCarrito(item.id)} style={{ color: 'red', background: 'none', border: 'none', cursor: 'pointer' }}>Quitar</button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="ticket-footer">
                    <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '5px' }}>
                        <option value="Efectivo">💵 Efectivo</option>
                        <option value="Tarjeta">💳 Tarjeta</option>
                        <option value="QR">📱 QR / Transf.</option>
                        <option value="Fiado">⏳ FIADO</option>
                    </select>

                    {metodoPago === 'Fiado' && (
                        <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
                            <select value={clienteSeleccionado} onChange={e => setClienteSeleccionado(e.target.value)} style={{ flex: 1, padding: '8px', borderRadius: '5px' }}>
                                <option value="">-- Cliente --</option>
                                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                            <button onClick={() => setMostrarModalCliente(true)} style={{ background: '#28a745', color: 'white', border: 'none', borderRadius: '5px', width: '40px' }}>+</button>
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
                        <span>Total:</span><span>${total.toFixed(2)}</span>
                    </div>

                    <button onClick={handleCobrar} disabled={carrito.length === 0 || procesando}
                        style={{ width: '100%', padding: '15px', background: metodoPago === 'Fiado' ? '#ffc107' : '#28a745', color: metodoPago === 'Fiado' ? 'black' : 'white', border: 'none', borderRadius: '8px', fontSize: '20px', fontWeight: 'bold', cursor: 'pointer' }}>
                        {procesando ? '...' : (metodoPago === 'Fiado' ? '📒 ANOTAR' : '💰 COBRAR')}
                    </button>
                </div>
            </div>

            {/* --- MODAL 1: GASTO --- */}
            {mostrarModalGasto && (
                <div className="overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="card" style={{ width: '300px' }}>
                        <h3>💸 Registrar Gasto</h3>
                        <input placeholder="Motivo" value={gastoForm.descripcion} onChange={e => setGastoForm({ ...gastoForm, descripcion: e.target.value })} style={{ width: '100%', marginBottom: '10px', padding: '10px', boxSizing: 'border-box' }} />
                        <input type="number" placeholder="Monto" value={gastoForm.monto} onChange={e => setGastoForm({ ...gastoForm, monto: e.target.value })} style={{ width: '100%', marginBottom: '10px', padding: '10px', boxSizing: 'border-box' }} />
                        <button onClick={handleRegistrarGasto} style={{ width: '100%', padding: '10px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', marginBottom: '5px' }}>Registrar</button>
                        <button onClick={() => setMostrarModalGasto(false)} style={{ width: '100%', padding: '10px', border: 'none', background: '#eee', borderRadius: '5px' }}>Cancelar</button>
                    </div>
                </div>
            )}

            {/* --- MODAL 2: CLIENTE --- */}
            {mostrarModalCliente && (
                <div className="overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="card" style={{ width: '300px' }}>
                        <h3>👤 Nuevo Cliente</h3>
                        <input placeholder="Nombre" value={nuevoCliente.nombre} onChange={e => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })} style={{ width: '100%', marginBottom: '10px', padding: '10px', boxSizing: 'border-box' }} />
                        <input placeholder="Teléfono" value={nuevoCliente.telefono} onChange={e => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })} style={{ width: '100%', marginBottom: '10px', padding: '10px', boxSizing: 'border-box' }} />
                        <button onClick={handleCrearCliente} style={{ width: '100%', padding: '10px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px', marginBottom: '5px' }}>Guardar</button>
                        <button onClick={() => setMostrarModalCliente(false)} style={{ width: '100%', padding: '10px', border: 'none', background: '#eee', borderRadius: '5px' }}>Cancelar</button>
                    </div>
                </div>
            )}

            {/* --- MODAL 3: CIERRE CAJERO (NUEVO) --- */}
            {mostrarModalCierre && (
                <div className="overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="card" style={{ width: '350px', textAlign: 'center' }}>
                        <h3>👤 Panel de Caja</h3>
                        <div style={{ background: '#f8f9fa', padding: '10px', borderRadius: '8px', marginBottom: '15px', textAlign: 'left' }}>
                            <p style={{ margin: '5px 0' }}><strong>Ventas Hoy:</strong> ${resumenCajero.ventasTotal.toFixed(2)}</p>
                            <p style={{ margin: '5px 0', color: 'red' }}><strong>Gastos Registrados:</strong> -${resumenCajero.gastos.toFixed(2)}</p>
                            <hr />
                            <p style={{ margin: '5px 0', color: '#555', fontSize: '0.9rem' }}>Debes tener en efectivo (Teórico):</p>
                            <h2 style={{ margin: '0', color: '#333' }}>${resumenCajero.efectivoEsperado.toFixed(2)}</h2>
                        </div>

                        {!resultadoCierre ? (
                            <form onSubmit={procesarCierreCajero}>
                                <p style={{ fontSize: '0.9rem', color: '#666' }}>Cuenta tus billetes e ingresa el monto real:</p>
                                <input
                                    type="number"
                                    placeholder="Monto en Caja ($)"
                                    value={montoCierre}
                                    onChange={e => setMontoCierre(e.target.value)}
                                    style={{ fontSize: '18px', padding: '10px', width: '80%', marginBottom: '15px', textAlign: 'center', border: '2px solid #6f42c1', borderRadius: '5px' }}
                                    autoFocus
                                />
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button type="submit" style={{ flex: 1, padding: '10px', background: '#6f42c1', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>Verificar</button>
                                    <button type="button" onClick={() => setMostrarModalCierre(false)} style={{ flex: 1, padding: '10px', background: '#eee', border: 'none', borderRadius: '5px' }}>Cerrar</button>
                                </div>
                            </form>
                        ) : (
                            <div style={{ animation: 'fadeIn 0.3s' }}>
                                <div style={{ fontSize: '3rem', margin: '10px 0' }}>
                                    {resultadoCierre.estado === 'OK' ? '✅' : resultadoCierre.estado === 'FALTA' ? '❌' : '⚠️'}
                                </div>
                                <p style={{ fontWeight: 'bold', fontSize: '1.2rem', color: resultadoCierre.estado === 'OK' ? 'green' : 'red' }}>
                                    {resultadoCierre.estado === 'OK' ? '¡Caja Cuadrada!' :
                                        resultadoCierre.estado === 'FALTA' ? `Faltan $${Math.abs(resultadoCierre.diferencia).toFixed(2)}` :
                                            `Sobran $${resultadoCierre.diferencia.toFixed(2)}`}
                                </p>
                                <button onClick={() => setMostrarModalCierre(false)} style={{ marginTop: '15px', width: '100%', padding: '10px', background: '#333', color: 'white', border: 'none', borderRadius: '5px' }}>Finalizar</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
}

export default Venta;