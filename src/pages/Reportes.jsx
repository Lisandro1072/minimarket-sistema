import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

function Reportes() {
    const [ventas, setVentas] = useState([]);
    const [gastos, setGastos] = useState([]);
    const [resumen, setResumen] = useState({ totalVentas: 0, efectivo: 0, gastos: 0, caja: 0 });

    useEffect(() => { fetchDatos(); }, []);

    async function fetchDatos() {
        const hoy = new Date().toISOString().slice(0, 10);

        const { data: v } = await supabase.from('ventas').select('*').order('fecha', { ascending: false });
        const { data: g } = await supabase.from('movimientos_caja').select('*').eq('tipo', 'salida').order('fecha', { ascending: false });

        setVentas(v || []);
        setGastos(g || []);

        // Calcular totales de HOY
        let tVentas = 0, tEfectivo = 0, tGastos = 0;

        (v || []).forEach(x => {
            if (x.fecha.startsWith(hoy)) {
                tVentas += x.total;
                if (x.metodo_pago === 'Efectivo') tEfectivo += x.total;
            }
        });

        (g || []).forEach(x => {
            if (x.fecha.startsWith(hoy)) {
                tGastos += x.monto;
            }
        });

        setResumen({ totalVentas: tVentas, efectivo: tEfectivo, gastos: tGastos, caja: tEfectivo - tGastos });
    }

    return (
        <div className="container">
            <h2>📊 Reporte Diario</h2>

            {/* DASHBOARD GRID */}
            <div className="form-grid" style={{ marginBottom: '30px' }}>
                <div className="card" style={{ borderLeft: '5px solid #28a745' }}>
                    <h4>Ventas Hoy</h4>
                    <h2 style={{ color: '#28a745' }}>${resumen.totalVentas.toFixed(2)}</h2>
                </div>
                <div className="card" style={{ borderLeft: '5px solid #dc3545' }}>
                    <h4>Gastos Hoy</h4>
                    <h2 style={{ color: '#dc3545' }}>-${resumen.gastos.toFixed(2)}</h2>
                </div>
                <div className="card" style={{ background: '#333', color: 'white' }}>
                    <h4>💰 En Caja (Efectivo)</h4>
                    <h1 style={{ color: '#ffc107', margin: '10px 0' }}>${resumen.caja.toFixed(2)}</h1>
                </div>
            </div>

            <button onClick={fetchDatos} style={{ padding: '10px 20px', marginBottom: '20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>🔄 Actualizar</button>

            <div className="form-grid">
                {/* TABLA VENTAS */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '15px', background: '#eee', fontWeight: 'bold' }}>Últimas Ventas</div>
                    <div className="table-responsive">
                        <table>
                            <thead><tr><th>Hora</th><th>Pago</th><th>Total</th></tr></thead>
                            <tbody>
                                {ventas.slice(0, 10).map(v => (
                                    <tr key={v.id}>
                                        <td>{v.fecha.slice(11, 16)}</td>
                                        <td>{v.metodo_pago}</td>
                                        <td style={{ fontWeight: 'bold' }}>${v.total}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* TABLA GASTOS */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '15px', background: '#eee', fontWeight: 'bold' }}>Últimos Gastos</div>
                    <div className="table-responsive">
                        <table>
                            <thead><tr><th>Hora</th><th>Motivo</th><th>Monto</th></tr></thead>
                            <tbody>
                                {gastos.length === 0 ? <tr><td colSpan="3">Sin gastos</td></tr> :
                                    gastos.slice(0, 10).map(g => (
                                        <tr key={g.id}>
                                            <td>{g.fecha.slice(11, 16)}</td>
                                            <td>{g.descripcion}</td>
                                            <td style={{ color: 'red', fontWeight: 'bold' }}>-${g.monto}</td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Reportes;