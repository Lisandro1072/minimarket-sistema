import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

function Venta() {
    const [productos, setProductos] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [carrito, setCarrito] = useState([]);
    const [total, setTotal] = useState(0);
    const [metodoPago, setMetodoPago] = useState('Efectivo'); // Nuevo estado
    const [procesando, setProcesando] = useState(false); // Para evitar doble clic

    // 1. Cargar productos (Solo los activos y con stock > 0 opcionalmente)
    useEffect(() => {
        fetchProductos();
    }, []);

    async function fetchProductos() {
        const { data } = await supabase
            .from('productos')
            .select('*')
            .eq('activo', true)
            .order('nombre', { ascending: true });
        setProductos(data || []);
    }

    // 2. Calcular total
    useEffect(() => {
        const nuevoTotal = carrito.reduce((sum, item) => sum + (item.precio_venta * item.cantidad), 0);
        setTotal(nuevoTotal);
    }, [carrito]);

    // --- LÓGICA DEL CARRITO ---
    const agregarAlCarrito = (producto) => {
        const existe = carrito.find(item => item.id === producto.id);
        if (existe) {
            if (existe.cantidad < producto.stock_actual) { // Validación simple de stock
                ajustarCantidad(producto.id, 1);
            } else {
                alert("¡No hay suficiente stock!");
            }
        } else {
            setCarrito([...carrito, { ...producto, cantidad: 1 }]);
        }
    };

    const ajustarCantidad = (id, cantidadAjuste) => {
        setCarrito(carrito => {
            return carrito.map(item => {
                if (item.id === id) {
                    // Validar que no supere el stock real al sumar
                    const prodOriginal = productos.find(p => p.id === id);
                    if (cantidadAjuste > 0 && item.cantidad >= prodOriginal.stock_actual) {
                        alert(`Solo hay ${prodOriginal.stock_actual} unidades disponibles.`);
                        return item;
                    }
                    return { ...item, cantidad: item.cantidad + cantidadAjuste };
                }
                return item;
            }).filter(item => item.cantidad > 0);
        });
    };

    const eliminarDelCarrito = (id) => {
        setCarrito(carrito.filter(item => item.id !== id));
    };

    // --- LÓGICA DE COBRO (NUEVO) ---
    const handleCobrar = async () => {
        if (carrito.length === 0) return;
        if (!window.confirm(`¿Confirmar venta por $${total.toFixed(2)} con ${metodoPago}?`)) return;

        setProcesando(true);

        try {
            // PASO 1: Guardar la cabecera de la venta
            const { data: ventaData, error: errorVenta } = await supabase
                .from('ventas')
                .insert([{
                    total: total,
                    metodo_pago: metodoPago,
                    usuario_id: null // Por ahora null, luego pondremos el ID del cajero logueado
                }])
                .select() // Importante para recuperar el ID generado
                .single();

            if (errorVenta) throw errorVenta;
            const ventaId = ventaData.id;

            // PASO 2: Guardar los detalles y Actualizar Stock
            // Lo hacemos en un bucle (Nota: En sistemas mas grandes se usa RPC, aquí lo hacemos paso a paso)
            for (const item of carrito) {
                // a. Guardar detalle
                const { error: errorDetalle } = await supabase
                    .from('detalle_ventas')
                    .insert([{
                        venta_id: ventaId,
                        producto_id: item.id,
                        cantidad: item.cantidad,
                        precio_momento: item.precio_venta
                    }]);

                if (errorDetalle) throw errorDetalle;

                // b. Descontar Stock
                const nuevoStock = item.stock_actual - item.cantidad;
                const { error: errorStock } = await supabase
                    .from('productos')
                    .update({ stock_actual: nuevoStock })
                    .eq('id', item.id);

                if (errorStock) throw errorStock;
            }

            // PASO 3: Finalizar
            alert('¡Venta Exitosa! ✅');
            setCarrito([]); // Limpiar carrito
            setMetodoPago('Efectivo');
            fetchProductos(); // Recargar productos para ver el nuevo stock actualizado

        } catch (error) {
            console.error('Error al cobrar:', error);
            alert('Hubo un error al procesar la venta. Revisa la consola.');
        } finally {
            setProcesando(false);
        }
    };

    const productosFiltrados = productos.filter(p =>
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.codigo_barras.includes(busqueda)
    );

    return (
        <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

            {/* IZQUIERDA: BUSCADOR */}
            <div>
                <h2>🔍 Buscar Producto</h2>
                <input
                    type="text"
                    placeholder="Escanear código o escribir nombre..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    style={{ width: '100%', padding: '15px', marginBottom: '20px' }}
                    autoFocus
                />

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                    {productosFiltrados.map(prod => (
                        <div
                            key={prod.id}
                            onClick={() => agregarAlCarrito(prod)}
                            style={{ border: '1px solid #ddd', padding: '10px', borderRadius: '8px', cursor: 'pointer', background: 'white', userSelect: 'none', opacity: prod.stock_actual === 0 ? 0.5 : 1 }}
                        >
                            <strong>{prod.nombre}</strong>
                            <div style={{ color: '#28a745', fontWeight: 'bold' }}>${prod.precio_venta}</div>
                            <small style={{ color: prod.stock_actual < prod.stock_minimo ? 'red' : 'black' }}>
                                Stock: {prod.stock_actual}
                            </small>
                        </div>
                    ))}
                </div>
            </div>

            {/* DERECHA: TICKET */}
            <div style={{ background: '#fff', padding: '20px', borderLeft: '2px solid #eee', height: '80vh', display: 'flex', flexDirection: 'column' }}>
                <h2>🛒 Ticket de Venta</h2>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {carrito.length === 0 ? (
                        <p style={{ color: '#999', textAlign: 'center' }}>Carrito vacío</p>
                    ) : (
                        carrito.map(item => (
                            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', padding: '10px 0' }}>
                                <div style={{ flex: 1 }}>
                                    <div>{item.nombre}</div>
                                    <small className="text-muted">${item.precio_venta} x {item.cantidad}</small>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <button onClick={() => ajustarCantidad(item.id, -1)}>➖</button>
                                    <span>{item.cantidad}</span>
                                    <button onClick={() => ajustarCantidad(item.id, 1)}>➕</button>
                                    <strong>${(item.cantidad * item.precio_venta).toFixed(2)}</strong>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div style={{ borderTop: '2px dashed #333', paddingTop: '20px' }}>
                    {/* SELECTOR DE PAGO */}
                    <div style={{ marginBottom: '10px' }}>
                        <label style={{ marginRight: '10px', fontWeight: 'bold' }}>Método de Pago:</label>
                        <select
                            value={metodoPago}
                            onChange={(e) => setMetodoPago(e.target.value)}
                            style={{ padding: '5px', fontSize: '16px' }}
                        >
                            <option value="Efectivo">💵 Efectivo</option>
                            <option value="Tarjeta">💳 Tarjeta</option>
                            <option value="QR">📱 QR / Transferencia</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '24px', fontWeight: 'bold' }}>
                        <span>TOTAL:</span>
                        <span>${total.toFixed(2)}</span>
                    </div>

                    <button
                        onClick={handleCobrar}
                        disabled={carrito.length === 0 || procesando}
                        style={{
                            width: '100%', padding: '20px', marginTop: '20px', border: 'none', borderRadius: '8px', fontSize: '20px', color: 'white',
                            background: procesando ? '#ccc' : '#28a745', cursor: procesando ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {procesando ? 'Procesando...' : '💰 COBRAR'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Venta;