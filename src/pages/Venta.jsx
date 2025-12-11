import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

function Venta() {
    const [productos, setProductos] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [carrito, setCarrito] = useState([]);
    const [total, setTotal] = useState(0);
    const [metodoPago, setMetodoPago] = useState('Efectivo');
    const [procesando, setProcesando] = useState(false);

    // --- NUEVO: ESTADOS PARA GASTOS ---
    const [mostrarModalGasto, setMostrarModalGasto] = useState(false);
    const [gastoForm, setGastoForm] = useState({ descripcion: '', monto: '' });

    useEffect(() => {
        fetchProductos();
    }, []);

    async function fetchProductos() {
        const { data } = await supabase
            .from('productos')
            .select('*')
            .order('nombre', { ascending: true });
        setProductos(data || []);
    }

    useEffect(() => {
        const nuevoTotal = carrito.reduce((sum, item) => sum + (item.precio_venta * item.cantidad), 0);
        setTotal(nuevoTotal);
    }, [carrito]);

    // ... (Las funciones de agregarAlCarrito, ajustarCantidad, eliminarDelCarrito son las mismas)
    const agregarAlCarrito = (producto) => {
        const existe = carrito.find(item => item.id === producto.id);
        if (existe) {
            // Opcional: validar stock aquí
            ajustarCantidad(producto.id, 1);
        } else {
            setCarrito([...carrito, { ...producto, cantidad: 1 }]);
        }
    };

    const ajustarCantidad = (id, cantidadAjuste) => {
        setCarrito(carrito => {
            return carrito.map(item => {
                if (item.id === id) {
                    return { ...item, cantidad: item.cantidad + cantidadAjuste };
                }
                return item;
            }).filter(item => item.cantidad > 0);
        });
    };

    const eliminarDelCarrito = (id) => {
        setCarrito(carrito.filter(item => item.id !== id));
    };
    // ... (Fin funciones carrito)

    const handleCobrar = async () => {
        if (carrito.length === 0) return;
        if (!window.confirm(`¿Confirmar venta por $${total.toFixed(2)} con ${metodoPago}?`)) return;

        setProcesando(true);
        try {
            const { data: ventaData, error: errorVenta } = await supabase
                .from('ventas')
                .insert([{ total: total, metodo_pago: metodoPago }])
                .select().single();

            if (errorVenta) throw errorVenta;

            for (const item of carrito) {
                await supabase.from('detalle_ventas').insert([{
                    venta_id: ventaData.id,
                    producto_id: item.id,
                    cantidad: item.cantidad,
                    precio_momento: item.precio_venta
                }]);

                // Descontar stock (simple)
                const prod = productos.find(p => p.id === item.id);
                if (prod) {
                    await supabase.from('productos')
                        .update({ stock_actual: prod.stock_actual - item.cantidad })
                        .eq('id', item.id);
                }
            }

            alert('¡Venta Exitosa! ✅');
            setCarrito([]);
            setMetodoPago('Efectivo');
            fetchProductos();

        } catch (error) {
            console.error('Error:', error);
            alert('Error al procesar venta');
        } finally {
            setProcesando(false);
        }
    };

    // --- NUEVA FUNCIÓN: REGISTRAR GASTO ---
    const handleRegistrarGasto = async (e) => {
        e.preventDefault();
        if (!gastoForm.descripcion || !gastoForm.monto) return alert("Llena ambos campos");

        try {
            const { error } = await supabase.from('movimientos_caja').insert([{
                tipo: 'salida',
                monto: parseFloat(gastoForm.monto),
                descripcion: gastoForm.descripcion
            }]);

            if (error) throw error;

            alert("Gasto registrado correctamente 💸");
            setMostrarModalGasto(false);
            setGastoForm({ descripcion: '', monto: '' });
        } catch (error) {
            alert("Error al guardar gasto: " + error.message);
        }
    };

    const productosFiltrados = productos.filter(p =>
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        (p.codigo_barras && p.codigo_barras.includes(busqueda))
    );

    return (
        <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', position: 'relative' }}>

            {/* IZQUIERDA */}
            <div>
                <h2>🔍 Buscar Producto</h2>
                <input
                    type="text"
                    placeholder="Escanear o escribir..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    style={{ width: '100%', padding: '15px', marginBottom: '20px' }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                    {productosFiltrados.map(prod => (
                        <div
                            key={prod.id}
                            onClick={() => agregarAlCarrito(prod)}
                            style={{ border: '1px solid #ddd', padding: '10px', borderRadius: '8px', cursor: 'pointer', background: 'white', opacity: prod.stock_actual <= 0 ? 0.6 : 1 }}
                        >
                            <strong>{prod.nombre}</strong>
                            <div style={{ color: '#28a745' }}>${prod.precio_venta}</div>
                            <small>Stock: {prod.stock_actual}</small>
                        </div>
                    ))}
                </div>
            </div>

            {/* DERECHA */}
            <div style={{ background: '#fff', padding: '20px', borderLeft: '2px solid #eee', height: '80vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2>🛒 Ticket</h2>
                    {/* BOTÓN NUEVO PARA GASTOS */}
                    <button
                        onClick={() => setMostrarModalGasto(true)}
                        style={{ background: '#dc3545', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '5px', fontSize: '14px' }}
                    >
                        💸 Registrar Gasto
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {carrito.map(item => (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #eee' }}>
                            <div>{item.nombre} <small>x{item.cantidad}</small></div>
                            <div>${(item.cantidad * item.precio_venta).toFixed(2)} <button onClick={() => eliminarDelCarrito(item.id)} style={{ color: 'red', border: 'none', background: 'none' }}>x</button></div>
                        </div>
                    ))}
                </div>

                <div style={{ borderTop: '2px dashed #333', paddingTop: '20px' }}>
                    <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} style={{ padding: '5px', marginBottom: '10px', width: '100%' }}>
                        <option value="Efectivo">💵 Efectivo</option>
                        <option value="Tarjeta">💳 Tarjeta</option>
                        <option value="QR">📱 QR / Transferencia</option>
                    </select>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', textAlign: 'right' }}>TOTAL: ${total.toFixed(2)}</div>
                    <button onClick={handleCobrar} disabled={carrito.length === 0 || procesando} style={{ width: '100%', padding: '15px', background: '#28a745', color: 'white', border: 'none', marginTop: '10px', borderRadius: '5px' }}>
                        {procesando ? '...' : 'COBRAR'}
                    </button>
                </div>
            </div>

            {/* --- MODAL DE GASTOS (VENTANA FLOTANTE) --- */}
            {mostrarModalGasto && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div style={{ background: 'white', padding: '30px', borderRadius: '10px', width: '350px' }}>
                        <h3>💸 Registrar Salida de Dinero</h3>
                        <form onSubmit={handleRegistrarGasto}>
                            <label>¿En qué gastaste?</label>
                            <input
                                type="text"
                                placeholder="Ej: Compra de Hielo, Almuerzo..."
                                value={gastoForm.descripcion}
                                onChange={e => setGastoForm({ ...gastoForm, descripcion: e.target.value })}
                                style={{ width: '100%', marginBottom: '10px' }}
                                autoFocus
                            />
                            <label>Monto ($)</label>
                            <input
                                type="number"
                                placeholder="0.00"
                                value={gastoForm.monto}
                                onChange={e => setGastoForm({ ...gastoForm, monto: e.target.value })}
                                style={{ width: '100%', marginBottom: '20px' }}
                            />
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button type="submit" style={{ flex: 1, background: '#dc3545', color: 'white', padding: '10px', border: 'none', borderRadius: '5px' }}>Registrar</button>
                                <button type="button" onClick={() => setMostrarModalGasto(false)} style={{ flex: 1, background: '#ccc', padding: '10px', border: 'none', borderRadius: '5px' }}>Cancelar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}

export default Venta;