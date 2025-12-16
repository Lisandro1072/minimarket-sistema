import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

function Cuentas() {
    const [clientesDeudores, setClientesDeudores] = useState([]);
    const [detalleCliente, setDetalleCliente] = useState(null); // Para ver las deudas de uno solo
    const [totalGeneral, setTotalGeneral] = useState(0);

    useEffect(() => {
        fetchDeudas();
    }, []);

    async function fetchDeudas() {
        // Traemos todas las ventas pendientes
        const { data, error } = await supabase
            .from('ventas')
            .select(`
        id, fecha, total, garantia,
        clientes ( id, nombre, telefono )
      `)
            .eq('estado', 'pendiente')
            .order('fecha', { ascending: false });

        if (error) return console.error(error);

        // --- AGRUPAR POR CLIENTE (LÓGICA JS) ---
        const agrupado = {};
        let sumaTotal = 0;

        data.forEach(venta => {
            const clienteId = venta.clientes?.id || 'anon';
            const nombre = venta.clientes?.nombre || 'Desconocido';
            const telefono = venta.clientes?.telefono || '';

            if (!agrupado[clienteId]) {
                agrupado[clienteId] = {
                    id: clienteId,
                    nombre,
                    telefono,
                    totalDeuda: 0,
                    ventas: []
                };
            }

            // Sumar al total del cliente
            agrupado[clienteId].totalDeuda += venta.total;
            // Guardar la venta individual
            agrupado[clienteId].ventas.push(venta);

            sumaTotal += venta.total;
        });

        setTotalGeneral(sumaTotal);
        setClientesDeudores(Object.values(agrupado));
    }

    const saldarDeuda = async (ventaId, monto) => {
        if (!window.confirm(`¿Confirmar pago de $${monto}?`)) return;

        const { error } = await supabase.from('ventas').update({ estado: 'pagado', metodo_pago: 'Efectivo (Fiado Pagado)' }).eq('id', ventaId);

        if (!error) {
            await supabase.from('movimientos_caja').insert([{ tipo: 'entrada', monto: monto, descripcion: `Pago deuda #${ventaId}` }]);
            alert("Pagado ✅");
            setDetalleCliente(null); // Cerrar modal
            fetchDeudas(); // Recargar
        }
    };

    return (
        <div className="container">
            <h2>📒 Gestión de Créditos</h2>

            <div className="card" style={{ background: '#fff3cd', border: '1px solid #ffeeba', marginBottom: '20px' }}>
                <h3>Total en la calle: <span style={{ color: '#d39e00' }}>${totalGeneral.toFixed(2)}</span></h3>
            </div>

            {/* LISTA DE CLIENTES (AGRUPADA) */}
            <div className="form-grid">
                {clientesDeudores.length === 0 ? <p>No hay deudas pendientes.</p> :
                    clientesDeudores.map(c => (
                        <div key={c.id} className="card" style={{ borderLeft: '5px solid #dc3545', cursor: 'pointer' }} onClick={() => setDetalleCliente(c)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0 }}>{c.nombre}</h3>
                                <span style={{ background: '#dc3545', color: 'white', padding: '5px 10px', borderRadius: '15px', fontSize: '12px' }}>
                                    {c.ventas.length} préstamos
                                </span>
                            </div>
                            <p style={{ color: '#666', margin: '5px 0' }}>📞 {c.telefono || 'Sin cel'}</p>
                            <h2 style={{ margin: '10px 0', color: '#dc3545' }}>${c.totalDeuda.toFixed(2)}</h2>
                            <small style={{ color: '#007bff' }}>Ver detalles &rarr;</small>
                        </div>
                    ))}
            </div>

            {/* MODAL DETALLE DE UN CLIENTE */}
            {detalleCliente && (
                <div className="overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
                    <div className="card" style={{ width: '90%', maxWidth: '500px', maxHeight: '80vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3>Deudas de: {detalleCliente.nombre}</h3>
                            <button onClick={() => setDetalleCliente(null)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>✕</button>
                        </div>

                        {detalleCliente.ventas.map(v => (
                            <div key={v.id} style={{ border: '1px solid #ddd', padding: '10px', borderRadius: '8px', marginBottom: '10px', background: '#f9f9f9' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <strong>📅 {formatoBolivia(v.fecha)}</strong>
                                    <strong style={{ color: '#dc3545' }}>${v.total.toFixed(2)}</strong>
                                </div>

                                {/* SECCIÓN DE GARANTÍA / BOLSA */}
                                <div style={{ marginTop: '5px', padding: '5px', background: '#e2e3e5', borderRadius: '5px', fontSize: '14px' }}>
                                    {v.garantia ? (
                                        <>
                                            <span>🔒 Garantía: <strong>{v.garantia}</strong></span>
                                            <br />
                                            <span>🏷️ ID BOLSA: <strong>#{v.id}</strong></span>
                                        </>
                                    ) : (
                                        <span style={{ color: '#666' }}>Sin garantía</span>
                                    )}
                                </div>

                                <button
                                    onClick={(e) => { e.stopPropagation(); saldarDeuda(v.id, v.total); }}
                                    style={{ width: '100%', marginTop: '10px', padding: '8px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                                >
                                    Cobrar Esta Nota
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Cuentas;