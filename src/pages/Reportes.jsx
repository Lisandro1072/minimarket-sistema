import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

function Reportes() {
    const [ventas, setVentas] = useState([]);
    const [gastos, setGastos] = useState([]); // Nuevo estado para gastos
    const [resumen, setResumen] = useState({
        totalVentas: 0,
        efectivoVentas: 0,
        otrosPagos: 0,
        totalGastos: 0,
        cajaFinal: 0
    });

    useEffect(() => {
        fetchDatos();
    }, []);

    async function fetchDatos() {
        const hoy = new Date().toISOString().slice(0, 10); // Fecha "YYYY-MM-DD"

        // 1. Obtener Ventas
        const { data: dataVentas } = await supabase
            .from('ventas')
            .select('*')
            .order('fecha', { ascending: false });

        // 2. Obtener Gastos
        const { data: dataGastos } = await supabase
            .from('movimientos_caja')
            .select('*')
            .eq('tipo', 'salida') // Solo salidas
            .order('fecha', { ascending: false });

        setVentas(dataVentas || []);
        setGastos(dataGastos || []);

        calcularResumen(dataVentas || [], dataGastos || [], hoy);
    }

    function calcularResumen(listaVentas, listaGastos, fechaHoy) {
        let totalV = 0;
        let efectivo = 0;
        let tarjeta = 0;
        let totalG = 0;

        // Sumar Ventas de HOY
        listaVentas.forEach(v => {
            if (v.fecha.startsWith(fechaHoy)) {
                totalV += v.total;
                if (v.metodo_pago === 'Efectivo') efectivo += v.total;
                else tarjeta += v.total;
            }
        });

        // Sumar Gastos de HOY
        listaGastos.forEach(g => {
            if (g.fecha.startsWith(fechaHoy)) {
                totalG += g.monto;
            }
        });

        setResumen({
            totalVentas: totalV,
            efectivoVentas: efectivo,
            otrosPagos: tarjeta,
            totalGastos: totalG,
            cajaFinal: efectivo - totalG // Lo que debería haber en billetes físicos
        });
    }

    return (
        <div className="container">
            <h2>📊 Corte de Caja (Día de Hoy)</h2>

            {/* DASHBOARD PRINCIPAL */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>

                {/* Ventas Totales */}
                <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                    <h4 style={{ margin: 0, color: '#666' }}>Ventas Totales</h4>
                    <h2 style={{ margin: '10px 0', color: '#28a745' }}>${resumen.totalVentas.toFixed(2)}</h2>
                    <small>Efectivo: ${resumen.efectivoVentas} | Otros: ${resumen.otrosPagos}</small>
                </div>

                {/* Gastos */}
                <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', borderLeft: '5px solid #dc3545' }}>
                    <h4 style={{ margin: 0, color: '#666' }}>Salidas / Gastos</h4>
                    <h2 style={{ margin: '10px 0', color: '#dc3545' }}>-${resumen.totalGastos.toFixed(2)}</h2>
                    <small>Dinero que salió de caja</small>
                </div>

                {/* CAJA FINAL (Lo importante) */}
                <div style={{ background: '#333', color: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
                    <h4 style={{ margin: 0, color: '#ccc' }}>💰 EFECTIVO EN CAJA</h4>
                    <h1 style={{ margin: '10px 0', color: '#ffc107' }}>${resumen.cajaFinal.toFixed(2)}</h1>
                    <small>Debes tener esto en billetes</small>
                </div>

            </div>

            <button onClick={fetchDatos} style={{ marginBottom: '20px', padding: '10px' }}>🔄 Actualizar Datos</button>

            {/* TABLA COMBINADA DE MOVIMIENTOS RECIENTES */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

                {/* Tabla Ventas */}
                <div>
                    <h3>Últimas Ventas</h3>
                    <table style={{ width: '100%', fontSize: '14px', background: 'white' }}>
                        <thead><tr style={{ background: '#eee' }}><th>Hora</th><th>Pago</th><th>Total</th></tr></thead>
                        <tbody>
                            {ventas.slice(0, 5).map(v => (
                                <tr key={v.id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td>{v.fecha.slice(11, 16)}</td>
                                    <td>{v.metodo_pago}</td>
                                    <td style={{ color: 'green' }}>+${v.total}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Tabla Gastos */}
                <div>
                    <h3>Últimos Gastos</h3>
                    <table style={{ width: '100%', fontSize: '14px', background: 'white' }}>
                        <thead><tr style={{ background: '#eee' }}><th>Hora</th><th>Motivo</th><th>Monto</th></tr></thead>
                        <tbody>
                            {gastos.length === 0 ? <tr><td colSpan="3">Sin gastos hoy</td></tr> :
                                gastos.slice(0, 5).map(g => (
                                    <tr key={g.id} style={{ borderBottom: '1px solid #eee' }}>
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
    );
}

export default Reportes;