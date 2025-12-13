import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

function Reportes() {
    const [rango, setRango] = useState('hoy');
    const [ventas, setVentas] = useState([]);
    const [gastos, setGastos] = useState([]);
    const [productosBajoStock, setProductosBajoStock] = useState([]);
    const [datosGrafico, setDatosGrafico] = useState([]);
    const [ocultarMontos, setOcultarMontos] = useState(false); // Para proteger la vista

    // Estados para Cierre Ciego
    const [modalCierre, setModalCierre] = useState(false);
    const [montoContado, setMontoContado] = useState('');
    const [resultadoCierre, setResultadoCierre] = useState(null);

    const [resumen, setResumen] = useState({
        totalVentas: 0, costoCapital: 0, gananciaNeta: 0,
        efectivo: 0, tarjeta: 0, fiado: 0, gastos: 0, cajaReal: 0
    });

    useEffect(() => { fetchDatos(); fetchStockBajo(); }, [rango]);

    const obtenerRangoFechas = () => {
        const ahora = new Date();
        let inicio = new Date(); inicio.setHours(0, 0, 0, 0);
        let fin = new Date(); fin.setHours(23, 59, 59, 999);

        if (rango === 'semana') inicio.setDate(ahora.getDate() - 7);
        else if (rango === 'mes') inicio.setDate(1);

        return { inicioISO: inicio.toISOString(), finISO: fin.toISOString() };
    };

    async function fetchDatos() {
        const { inicioISO, finISO } = obtenerRangoFechas();

        const { data: dataVentas } = await supabase.from('ventas')
            .select(`*, detalle_ventas ( cantidad, precio_momento, producto_id )`)
            .gte('fecha', inicioISO).lte('fecha', finISO).order('fecha', { ascending: false });

        const { data: dataGastos } = await supabase.from('movimientos_caja')
            .select('*').eq('tipo', 'salida').gte('fecha', inicioISO).lte('fecha', finISO);

        const { data: prods } = await supabase.from('productos').select('id, precio_compra');
        const mapCostos = {}; prods?.forEach(p => mapCostos[p.id] = p.precio_compra);

        let tVentas = 0, tCosto = 0, tEfectivo = 0, tTarjeta = 0, tFiado = 0, tGastos = 0;
        const graficoMap = {};

        (dataVentas || []).forEach(v => {
            tVentas += v.total;
            if (v.metodo_pago === 'Efectivo') tEfectivo += v.total;
            else if (v.metodo_pago === 'Fiado') tFiado += v.total;
            else tTarjeta += v.total;

            v.detalle_ventas.forEach(d => tCosto += ((mapCostos[d.producto_id] || 0) * d.cantidad));

            // Gráfico
            const fechaLocal = new Date(v.fecha);
            const dia = v.fecha.slice(8, 10);
            const nombreDia = fechaLocal.toLocaleDateString('es-ES', { weekday: 'short' });
            const label = `${nombreDia} ${dia}`;

            if (!graficoMap[label]) graficoMap[label] = { name: label, Ventas: 0, Ganancia: 0, order: fechaLocal.getTime() };
            graficoMap[label].Ventas += v.total;

            let gananciaVenta = 0;
            v.detalle_ventas.forEach(d => gananciaVenta += (d.precio_momento - (mapCostos[d.producto_id] || 0)) * d.cantidad);
            graficoMap[label].Ganancia += gananciaVenta;
        });

        (dataGastos || []).forEach(g => tGastos += g.monto);

        setVentas(dataVentas || []);
        setGastos(dataGastos || []);
        setResumen({
            totalVentas: tVentas, costoCapital: tCosto, gananciaNeta: tVentas - tCosto,
            efectivo: tEfectivo, tarjeta: tTarjeta, fiado: tFiado, gastos: tGastos,
            cajaReal: tEfectivo - tGastos
        });
        setDatosGrafico(Object.values(graficoMap).sort((a, b) => a.order - b.order));
    }

    async function fetchStockBajo() {
        const { data } = await supabase.from('productos').select('*').eq('activo', true);
        if (data) setProductosBajoStock(data.filter(p => p.stock_actual <= p.stock_minimo));
    }

    // --- 1. FUNCIÓN BACKUP (COPIA DE SEGURIDAD) ---
    const handleBackup = async () => {
        if (!confirm("¿Descargar copia completa de la base de datos?")) return;

        // Descargar TODAS las tablas sin filtros
        const { data: p } = await supabase.from('productos').select('*');
        const { data: v } = await supabase.from('ventas').select('*');
        const { data: d } = await supabase.from('detalle_ventas').select('*');
        const { data: c } = await supabase.from('clientes').select('*');
        const { data: m } = await supabase.from('movimientos_caja').select('*');

        const backupData = {
            fecha: new Date().toISOString(),
            productos: p,
            ventas: v,
            detalle_ventas: d,
            clientes: c,
            movimientos_caja: m
        };

        // Crear archivo blob y descargar
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `backup_minimarket_${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
    };

    // --- 2. FUNCIÓN CIERRE CIEGO ---
    const iniciarCierre = () => {
        setModalCierre(true);
        setResultadoCierre(null);
        setMontoContado('');
    };

    const procesarCierre = (e) => {
        e.preventDefault();
        const contado = parseFloat(montoContado) || 0;
        const esperado = resumen.cajaReal;
        const diferencia = contado - esperado;

        setResultadoCierre({
            esperado,
            contado,
            diferencia,
            estado: Math.abs(diferencia) < 0.5 ? 'OK' : (diferencia < 0 ? 'FALTA' : 'SOBRA')
        });
    };

    // Exportaciones
    const exportarPDF = () => {
        const doc = new jsPDF();
        doc.text(`Reporte (${rango})`, 14, 15);
        doc.text(`Ventas: $${resumen.totalVentas.toFixed(2)} | Ganancia: $${resumen.gananciaNeta.toFixed(2)}`, 14, 25);
        autoTable(doc, {
            head: [['Fecha', 'Método', 'Total']],
            body: ventas.map(v => [v.fecha.slice(0, 16).replace('T', ' '), v.metodo_pago, `$${v.total}`]),
            startY: 35,
        });
        doc.save(`reporte.pdf`);
    };

    const exportarExcel = () => {
        const hoja = XLSX.utils.json_to_sheet(ventas.map(v => ({ Fecha: v.fecha, Total: v.total, Metodo: v.metodo_pago })));
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, "Ventas");
        XLSX.writeFile(libro, `reporte.xlsx`);
    };

    return (
        <div className="container">

            {/* HEADER: BOTONES DE ACCIÓN */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
                <h2>📈 Finanzas</h2>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button onClick={() => setOcultarMontos(!ocultarMontos)} style={{ background: '#6c757d', color: 'white', border: 'none', padding: '10px', borderRadius: '5px', cursor: 'pointer' }}>
                        {ocultarMontos ? '👁️ Mostrar' : '👁️ Ocultar'}
                    </button>
                    <select value={rango} onChange={(e) => setRango(e.target.value)} style={{ padding: '10px', borderRadius: '5px' }}>
                        <option value="hoy">📅 Hoy</option>
                        <option value="semana">📅 Semana</option>
                        <option value="mes">📅 Mes</option>
                    </select>
                    {/* BOTONES NUEVOS */}
                    <button onClick={iniciarCierre} style={{ background: '#6f42c1', color: 'white', border: 'none', padding: '10px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>✂️ Cierre Caja</button>
                    <button onClick={handleBackup} style={{ background: '#17a2b8', color: 'white', border: 'none', padding: '10px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>💾 Backup</button>

                    <button onClick={exportarPDF} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '10px', borderRadius: '5px' }}>PDF</button>
                    <button onClick={exportarExcel} style={{ background: '#28a745', color: 'white', border: 'none', padding: '10px', borderRadius: '5px' }}>Excel</button>
                </div>
            </div>

            {/* ALERTAS STOCK */}
            {productosBajoStock.length > 0 && (
                <div className="card" style={{ borderLeft: '5px solid #dc3545', background: '#fff5f5', padding: '10px', marginBottom: '20px' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#dc3545' }}>⚠️ Reponer Inventario:</h4>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {productosBajoStock.map(p => (
                            <span key={p.id} style={{ background: 'white', border: '1px solid #dc3545', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>{p.nombre} ({p.stock_actual})</span>
                        ))}
                    </div>
                </div>
            )}

            {/* KPIS (CON OPCIÓN DE OCULTAR) */}
            <div className="form-grid" style={{ marginBottom: '20px' }}>
                <div className="card">
                    <small>Ventas Totales</small>
                    <h2 style={{ color: '#007bff', margin: '5px 0' }}>{ocultarMontos ? '****' : `$${resumen.totalVentas.toFixed(2)}`}</h2>
                </div>
                <div className="card" style={{ background: '#f8f9fa' }}>
                    <small>Capital</small>
                    <h2 style={{ color: '#6c757d', margin: '5px 0' }}>{ocultarMontos ? '****' : `$${resumen.costoCapital.toFixed(2)}`}</h2>
                </div>
                <div className="card" style={{ background: '#e8f5e9', border: '1px solid #c3e6cb' }}>
                    <small>Ganancia Neta</small>
                    <h2 style={{ color: '#28a745', margin: '5px 0' }}>{ocultarMontos ? '****' : `$${resumen.gananciaNeta.toFixed(2)}`}</h2>
                </div>
                <div className="card" style={{ background: '#333', color: 'white' }}>
                    <small>Caja Física (Teórico)</small>
                    <h2 style={{ color: '#ffc107', margin: '5px 0' }}>{ocultarMontos ? '****' : `$${resumen.cajaReal.toFixed(2)}`}</h2>
                </div>
            </div>

            {/* GRÁFICO */}
            <div className="card" style={{ height: '300px', marginBottom: '20px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={datosGrafico}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="Ventas" fill="#007bff" />
                        <Bar dataKey="Ganancia" fill="#28a745" />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* MODAL DE CIERRE DE CAJA CIEGO */}
            {modalCierre && (
                <div className="overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card" style={{ width: '400px', textAlign: 'center' }}>
                        {!resultadoCierre ? (
                            <form onSubmit={procesarCierre}>
                                <h3>✂️ Arqueo de Caja</h3>
                                <p>Cuenta los billetes y monedas. No te diremos cuánto debe haber.</p>
                                <input
                                    type="number"
                                    placeholder="Monto contado ($)"
                                    value={montoContado}
                                    onChange={e => setMontoContado(e.target.value)}
                                    style={{ fontSize: '20px', padding: '10px', width: '80%', margin: '20px 0', textAlign: 'center' }}
                                    autoFocus
                                />
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button type="submit" style={{ flex: 1, padding: '15px', background: '#6f42c1', color: 'white', border: 'none', borderRadius: '5px', fontSize: '16px' }}>Verificar</button>
                                    <button type="button" onClick={() => setModalCierre(false)} style={{ flex: 1, padding: '15px', background: '#ccc', border: 'none', borderRadius: '5px' }}>Cancelar</button>
                                </div>
                            </form>
                        ) : (
                            <div>
                                <h3>Resultado del Cierre</h3>
                                <div style={{ fontSize: '3rem', margin: '20px 0' }}>
                                    {resultadoCierre.estado === 'OK' ? '✅' : resultadoCierre.estado === 'FALTA' ? '❌' : '⚠️'}
                                </div>

                                <div style={{ textAlign: 'left', background: '#f8f9fa', padding: '15px', borderRadius: '10px', marginBottom: '20px' }}>
                                    <p><strong>Sistema dice:</strong> ${resultadoCierre.esperado.toFixed(2)}</p>
                                    <p><strong>Tú contaste:</strong> ${resultadoCierre.contado.toFixed(2)}</p>
                                    <hr />
                                    <p style={{ color: resultadoCierre.estado === 'OK' ? 'green' : 'red', fontWeight: 'bold', fontSize: '1.2rem' }}>
                                        {resultadoCierre.estado === 'OK' ? '¡Cuadra Perfecto!' :
                                            resultadoCierre.estado === 'FALTA' ? `Faltan $${Math.abs(resultadoCierre.diferencia).toFixed(2)}` :
                                                `Sobran $${resultadoCierre.diferencia.toFixed(2)}`}
                                    </p>
                                </div>
                                <button onClick={() => setModalCierre(false)} style={{ width: '100%', padding: '15px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px' }}>Cerrar</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Reportes;