import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

function Cuentas() {
    const [deudas, setDeudas] = useState([]);

    useEffect(() => {
        fetchDeudas();
    }, []);

    async function fetchDeudas() {
        // Traemos ventas pendientes unidas con el nombre del cliente
        const { data, error } = await supabase
            .from('ventas')
            .select(`
        id, fecha, total, estado,
        clientes ( nombre, telefono )
      `)
            .eq('estado', 'pendiente')
            .order('fecha', { ascending: false });

        if (error) console.error(error);
        else setDeudas(data);
    }

    const saldarDeuda = async (ventaId, monto) => {
        if (!window.confirm(`¿Confirmar que pagaron esta deuda de $${monto}?`)) return;

        // 1. Marcar venta como pagada
        const { error } = await supabase
            .from('ventas')
            .update({ estado: 'pagado', metodo_pago: 'Efectivo (Deuda Saldada)' })
            .eq('id', ventaId);

        if (!error) {
            // 2. Registrar la entrada de dinero en caja HOY (porque hoy te pagaron)
            await supabase.from('movimientos_caja').insert([{
                tipo: 'entrada',
                monto: monto,
                descripcion: `Pago deuda venta #${ventaId}`
            }]);

            alert("Deuda saldada correctamente 💰");
            fetchDeudas();
        }
    };

    // Calcular total que te deben en la calle
    const totalDeuda = deudas.reduce((acc, item) => acc + item.total, 0);

    return (
        <div className="container">
            <h2>📒 Cuentas por Cobrar (Fiado)</h2>

            <div className="card" style={{ background: '#fff3cd', border: '1px solid #ffeeba' }}>
                <h3>Total en la calle: <span style={{ color: '#d39e00' }}>${totalDeuda.toFixed(2)}</span></h3>
            </div>

            <div className="form-grid">
                {deudas.length === 0 ? <p>¡Nadie te debe nada! 🎉</p> : deudas.map(deuda => (
                    <div key={deuda.id} className="card" style={{ borderLeft: '5px solid #ffc107' }}>
                        <h3>{deuda.clientes?.nombre}</h3>
                        <p style={{ color: '#666' }}>📞 {deuda.clientes?.telefono || 'Sin cel'}</p>
                        <p>Fecha: {new Date(deuda.fecha).toLocaleDateString()}</p>
                        <h2 style={{ margin: '10px 0' }}>${deuda.total}</h2>
                        <button
                            onClick={() => saldarDeuda(deuda.id, deuda.total)}
                            style={{ width: '100%', padding: '10px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                        >
                            ✅ Marcar Pagado
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default Cuentas;