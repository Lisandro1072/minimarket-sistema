import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

function Venta() {
    const [productos, setProductos] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [carrito, setCarrito] = useState([]);
    const [total, setTotal] = useState(0);
    const [metodoPago, setMetodoPago] = useState('Efectivo');
    const [procesando, setProcesando] = useState(false);
    const [mostrarModalGasto, setMostrarModalGasto] = useState(false);
    const [gastoForm, setGastoForm] = useState({ descripcion: '', monto: '' });

    // 1. Cargar productos
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

    // 2. LÓGICA DE SUMA BLINDADA (Corrige el error de $0.00 en móviles)
    useEffect(() => {
        const nuevoTotal = carrito.reduce((sum, item) => {
            // a. Convertimos a texto por seguridad
            const precioTexto = String(item.precio_venta);
            // b. Borramos cualquier cosa que NO sea número o punto (quita el $)
            const precioLimpio = precioTexto.replace(/[^0-9.]/g, '');
            // c. Convertimos a número real
            const precioFinal = parseFloat(precioLimpio) || 0;

            return sum + (precioFinal * item.cantidad);
        }, 0);

        setTotal(nuevoTotal);
    }, [carrito]);

    // --- FUNCIONES DEL CARRITO ---

    const agregarAlCarrito = (producto) => {
        const existe = carrito.find(item => item.id === producto.id);
        if (existe) {
            ajustarCantidad(producto.id, 1);
        } else {
            setCarrito([...carrito, { ...producto, cantidad: 1 }]);
        }
    };

    // Función para botones + y -
    const ajustarCantidad = (id, cantidadAjuste) => {
        setCarrito(carrito => {
            return carrito.map(item => {
                if (item.id === id) {
                    const nuevaCantidad = Math.max(0, item.cantidad + cantidadAjuste);
                    return { ...item, cantidad: nuevaCantidad };
                }
                return item;
            }).filter(item => item.cantidad > 0); // Si es 0 se elimina
        });
    };

    // Función para ESCRIBIR la cantidad manualmente (Ej: escribir "30" directo)
    const cambiarCantidadManual = (id, valorInput) => {
        const cantidad = parseInt(valorInput) || 0;
        setCarrito(carrito => {
            return carrito.map(item => {
                if (item.id === id) {
                    return { ...item, cantidad: cantidad };
                }
                return item;
            });
            // Nota: Aquí no filtramos el 0 inmediatamente para permitir borrar y escribir
        });
    };

    // Función para limpiar ceros cuando dejas de escribir
    const finalizarEdicionCantidad = () => {
        setCarrito(carrito.filter(item => item.cantidad > 0));
    };

    const eliminarDelCarrito = (id) => {
        setCarrito(carrito.filter(item => item.id !== id));
    };

    // --- PROCESAR VENTA ---
    const handleCobrar = async () => {
        if (carrito.length === 0) return;
        if (!window.confirm(`¿Cobrar $${total.toFixed(2)}?`)) return;

        setProcesando(true);
        try {
            const { data: ventaData, error: errorVenta } = await supabase
                .from('ventas')
                .insert([{ total: total, metodo_pago: metodoPago }])
                .select().single();

            if (errorVenta) throw errorVenta;

            for (const item of carrito) {
                // Limpieza de precio unitario para guardar en BD
                const pTexto = String(item.precio_venta);
                const pLimpio = parseFloat(pTexto.replace(/[^0-9.]/g, '')) || 0;

                await supabase.from('detalle_ventas').insert([{
                    venta_id: ventaData.id,
                    producto_id: item.id,
                    cantidad: item.cantidad,
                    precio_momento: pLimpio
                }]);

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

    // --- REGISTRO DE GASTOS ---
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
            alert("Error: " + error.message);
        }
    };

    const productosFiltrados = productos.filter(p =>
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        (p.codigo_barras && p.codigo_barras.includes(busqueda))
    );

    return (
        <div className="venta-container">

            {/* SECCIÓN IZQUIERDA: PRODUCTOS */}
            <div className="columna-productos">
                <h2 style={{ marginTop: 0 }}>🔍 Buscar</h2>
                <input
                    type="text"
                    placeholder="Escanear o escribir..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    style={{ width: '95%', padding: '12px', marginBottom: '20px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '16px' }}
                />

                <div className="grid-productos">
                    {productosFiltrados.map(prod => (
                        <div key={prod.id} className="card-producto" onClick={() => agregarAlCarrito(prod)} style={{ opacity: prod.stock_actual <= 0 ? 0.6 : 1 }}>
                            <div>
                                <strong style={{ fontSize: '1.1rem' }}>{prod.nombre}</strong>
                                <div style={{ color: '#666', fontSize: '0.9rem' }}>{prod.stock_actual} unid.</div>
                            </div>
                            <div style={{ color: '#28a745', fontWeight: 'bold', fontSize: '1.2rem', marginTop: '10px' }}>
                                ${prod.precio_venta}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* SECCIÓN DERECHA: TICKET CON CONTROLES */}
            <div className="columna-ticket">
                <div className="ticket-header">
                    <h3 style={{ margin: 0 }}>🛒 Ticket</h3>
                    <button
                        onClick={() => setMostrarModalGasto(true)}
                        style={{ background: '#dc3545', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '5px', cursor: 'pointer' }}
                    >
                        💸 Gasto
                    </button>
                </div>

                <div className="ticket-body">
                    {carrito.length === 0 ? <p style={{ textAlign: 'center', color: '#999' }}>Carrito vacío</p> : null}

                    {carrito.map(item => {
                        // Cálculo seguro del subtotal visual
                        const pTexto = String(item.precio_venta);
                        const pLimpio = parseFloat(pTexto.replace(/[^0-9.]/g, '')) || 0;
                        const subtotal = (item.cantidad * pLimpio).toFixed(2);

                        return (
                            <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>

                                {/* Fila superior: Nombre y Subtotal */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <div style={{ fontWeight: 'bold' }}>{item.nombre}</div>
                                    <div style={{ fontWeight: 'bold' }}>${subtotal}</div>
                                </div>

                                {/* Fila inferior: Controles de cantidad */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        {/* Botón MENOS */}
                                        <button
                                            onClick={() => ajustarCantidad(item.id, -1)}
                                            style={{ background: '#ddd', border: 'none', width: '30px', height: '30px', borderRadius: '5px', fontSize: '18px', cursor: 'pointer' }}
                                        >-</button>

                                        {/* Input para ESCRIBIR cantidad directa */}
                                        <input
                                            type="number"
                                            value={item.cantidad}
                                            onChange={(e) => cambiarCantidadManual(item.id, e.target.value)}
                                            onBlur={finalizarEdicionCantidad} // Al salir del input, limpia si quedó vacío
                                            style={{ width: '50px', textAlign: 'center', fontSize: '16px', padding: '5px', border: '1px solid #ccc', borderRadius: '5px' }}
                                        />

                                        {/* Botón MAS */}
                                        <button
                                            onClick={() => ajustarCantidad(item.id, 1)}
                                            style={{ background: '#ddd', border: 'none', width: '30px', height: '30px', borderRadius: '5px', fontSize: '18px', cursor: 'pointer' }}
                                        >+</button>
                                    </div>

                                    {/* Botón ELIMINAR */}
                                    <button
                                        onClick={() => eliminarDelCarrito(item.id)}
                                        style={{ color: 'red', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', textDecoration: 'underline' }}
                                    >
                                        Quitar
                                    </button>
                                </div>

                            </div>
                        );
                    })}
                </div>

                <div className="ticket-footer">
                    <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} style={{ padding: '10px', marginBottom: '15px', width: '100%', borderRadius: '5px', border: '1px solid #ccc' }}>
                        <option value="Efectivo">💵 Efectivo</option>
                        <option value="Tarjeta">💳 Tarjeta</option>
                        <option value="QR">📱 QR / Transferencia</option>
                    </select>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '24px', fontWeight: 'bold', marginBottom: '15px' }}>
                        <span>Total:</span>
                        <span>${total.toFixed(2)}</span>
                    </div>

                    <button
                        onClick={handleCobrar}
                        disabled={carrito.length === 0 || procesando}
                        style={{
                            width: '100%', padding: '15px',
                            background: procesando ? '#ccc' : '#28a745',
                            color: 'white', border: 'none', borderRadius: '8px',
                            fontSize: '20px', fontWeight: 'bold', cursor: 'pointer'
                        }}
                    >
                        {procesando ? 'Procesando...' : '💰 COBRAR'}
                    </button>
                </div>
            </div>

            {/* MODAL DE GASTOS */}
            {mostrarModalGasto && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'white', padding: '25px', borderRadius: '10px', width: '90%', maxWidth: '350px' }}>
                        <h3>💸 Registrar Gasto</h3>
                        <input type="text" placeholder="Motivo (ej: Hielo)" value={gastoForm.descripcion} onChange={e => setGastoForm({ ...gastoForm, descripcion: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box' }} />
                        <input type="number" placeholder="Monto (0.00)" value={gastoForm.monto} onChange={e => setGastoForm({ ...gastoForm, monto: e.target.value })} style={{ width: '100%', padding: '10px', marginBottom: '20px', boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={handleRegistrarGasto} style={{ flex: 1, background: '#dc3545', color: 'white', padding: '10px', border: 'none', borderRadius: '5px' }}>Guardar</button>
                            <button onClick={() => setMostrarModalGasto(false)} style={{ flex: 1, background: '#ccc', padding: '10px', border: 'none', borderRadius: '5px' }}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Venta;