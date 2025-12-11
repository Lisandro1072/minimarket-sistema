import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

function Reportes() {
    const [ventas, setVentas] = useState([]);
    const [resumen, setResumen] = useState({ totalDia: 0, efectivo: 0, tarjeta: 0 });

    useEffect(() => {
        fetchVentas();
    }, []);

    async function fetchVentas() {
        // 1. Pedimos las ventas ordenadas por fecha (las más nuevas arriba)
        const { data, error } = await supabase
            .from('ventas')
            .select('*')
            .order('fecha', { ascending: false });

        if (error) {
            console.error('Error cargando ventas:', error);
        } else {
            setVentas(data);
            calcularResumen(data);
        }
    }

    // 2. Función matemática para calcular cuánto vendiste HOY
    function calcularResumen(datos) {
        const hoy = new Date().toISOString().slice(0, 10); // Obtenemos fecha de hoy "2023-10-25"

        let total = 0;
        let efectivo = 0;
        let tarjeta = 0;

        datos.forEach(venta => {
            // Convertimos la fecha de la venta para compararla
            const fechaVenta = venta.fecha.slice(0, 10);

            if (fechaVenta === hoy) {
                total += venta.total;
                if (venta.metodo_pago === 'Efectivo') efectivo += venta.total;
                else tarjeta += venta.total; // Asumimos tarjeta u otros
            }
        });

        setResumen({ totalDia: total, efectivo, tarjeta });
    }

    // Función para formatear la fecha a algo legible
    const formatearFecha = (fechaISO) => {
        const fecha = new Date(fechaISO);
        return fecha.toLocaleString(); // Ejemplo: 25/10/2023, 14:30:00
    };

    return (
        <div className="container">
            <h2>📊 Reporte de Ventas</h2>

            {/* TARJETAS DE RESUMEN (DASHBOARD) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' }}>

                <div style={{ background: '#28a745', color: 'white', padding: '20px', borderRadius: '10px' }}>
                    <h3>Venta Total Hoy</h3>
                    <h1 style={{ margin: 0 }}>${resumen.totalDia.toFixed(2)}</h1>
                </div>

                <div style={{ background: '#17a2b8', color: 'white', padding: '20px', borderRadius: '10px' }}>
                    <h3>En Efectivo</h3>
                    <h2 style={{ margin: 0 }}>${resumen.efectivo.toFixed(2)}</h2>
                </div>

                <div style={{ background: '#ffc107', color: '#333', padding: '20px', borderRadius: '10px' }}>
                    <h3>En Tarjeta/Otros</h3>
                    <h2 style={{ margin: 0 }}>${resumen.tarjeta.toFixed(2)}</h2>
                </div>

            </div>

            <button onClick={fetchVentas} style={{ marginBottom: '15px', padding: '10px' }}>🔄 Actualizar Datos</button>

            {/* TABLA DE HISTORIAL */}
            <table border="1" style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
                <thead style={{ background: '#333', color: 'white' }}>
                    <tr>
                        <th>ID Venta</th>
                        <th>Fecha y Hora</th>
                        <th>Método Pago</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {ventas.map((venta) => (
                        <tr key={venta.id} style={{ borderBottom: '1px solid #ddd' }}>
                            <td>#{venta.id}</td>
                            <td>{formatearFecha(venta.fecha)}</td>
                            <td>
                                <span style={{
                                    padding: '5px 10px',
                                    borderRadius: '15px',
                                    background: venta.metodo_pago === 'Efectivo' ? '#d4edda' : '#cce5ff',
                                    color: venta.metodo_pago === 'Efectivo' ? '#155724' : '#004085',
                                    fontSize: '12px', fontWeight: 'bold'
                                }}>
                                    {venta.metodo_pago}
                                </span>
                            </td>
                            <td style={{ fontWeight: 'bold' }}>${venta.total}</td>
                        </tr>
                    ))}
                    {ventas.length === 0 && (
                        <tr>
                            <td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>No hay ventas registradas aún.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

export default Reportes;