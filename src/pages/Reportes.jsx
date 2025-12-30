import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Función auxiliar para hora Bolivia
const formatoBolivia = (fechaISO) => {
    if (!fechaISO) return '-';
    const fecha = new Date(fechaISO);
    return fecha.toLocaleString('es-BO', { timeZone: 'America/La_Paz', year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

function Reportes() {
    const [rango, setRango] = useState('hoy');
    const [ventas, setVentas] = useState([]);
    const [gastos, setGastos] = useState([]);
    const [productosBajoStock, setProductosBajoStock] = useState([]);
    const [datosGrafico, setDatosGrafico] = useState([]);
    const [ocultarMontos, setOcultarMontos] = useState(false);

    // Estado para agrupar faltantes por categoría
    const [faltantesPorCategoria, setFaltantesPorCategoria] = useState({});

    // Cierre Caja
    const [modalCierre, setModalCierre] = useState(false);
    const [montoContado, setMontoContado] = useState('');
    const [resultadoCierre, setResultadoCierre] = useState(null);

    const [resumen, setResumen] = useState({ totalVentas: 0, costoCapital: 0, gananciaNeta: 0, efectivo: 0, tarjeta: 0, fiado: 0, gastos: 0, cajaReal: 0 });

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
        const { data: dataVentas } = await supabase.from('ventas').select(`*, detalle_ventas ( cantidad, precio_momento, producto_id )`).gte('fecha', inicioISO).lte('fecha', finISO).order('fecha', { ascending: false });
        const { data: dataGastos } = await supabase.from('movimientos_caja').select('*').eq('tipo', 'salida').gte('fecha', inicioISO).lte('fecha', finISO);
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
        setVentas(dataVentas || []); setGastos(dataGastos || []);
        setResumen({ totalVentas: tVentas, costoCapital: tCosto, gananciaNeta: tVentas - tCosto, efectivo: tEfectivo, tarjeta: tTarjeta, fiado: tFiado, gastos: tGastos, cajaReal: tEfectivo - tGastos });
        setDatosGrafico(Object.values(graficoMap).sort((a, b) => a.order - b.order));
    }

    async function fetchStockBajo() {
        const { data } = await supabase.from('productos').select('*').eq('activo', true);
        if (data) {
            const bajos = data.filter(p => p.controlar_stock && p.stock_actual <= p.stock_minimo);
            setProductosBajoStock(bajos);

            // --- AGRUPAR POR CATEGORÍA ---
            const agrupados = bajos.reduce((acc, prod) => {
                const cat = prod.categoria || 'Sin Categoría';
                if (!acc[cat]) acc[cat] = [];
                acc[cat].push(prod);
                return acc;
            }, {});
            setFaltantesPorCategoria(agrupados);
        }
    }

    // --- NUEVA FUNCIÓN: IMPRIMIR LISTA DE COMPRA ---
    const imprimirListaCompra = () => {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text("Lista de Reposición / Compras", 14, 15);
        doc.setFontSize(10);
        doc.text(`Generado: ${new Date().toLocaleDateString()}`, 14, 22);

        let dataBody = [];
        Object.keys(faltantesPorCategoria).forEach(cat => {
            // Fila de encabezado de categoría
            dataBody.push([{ content: cat.toUpperCase(), colSpan: 3, styles: { fillColor: [220, 220, 220], fontStyle: 'bold' } }]);
            // Productos de esa categoría
            faltantesPorCategoria[cat].forEach(p => {
                dataBody.push([
                    p.nombre,
                    `${p.stock_actual} ${p.unidad}`,
                    `Sugerido: ${p.stock_minimo * 3} ${p.unidad}` // Sugerencia simple
                ]);
            });
        });

        autoTable(doc, {
            head: [['Producto', 'Stock Actual', 'A Comprar']],
            body: dataBody,
            startY: 25,
        });
        doc.save('lista_compras.pdf');
    };

    // --- BACKUP ---
    const handleBackup = async () => {
        if (!confirm("¿Descargar copia completa de la base de datos?")) return;
        const { data: p } = await supabase.from('productos').select('*');
        const { data: v } = await supabase.from('ventas').select('*');
        const { data: d } = await supabase.from('detalle_ventas').select('*');
        const { data: c } = await supabase.from('clientes').select('*');
        const { data: m } = await supabase.from('movimientos_caja').select('*');
        const blob = new Blob([JSON.stringify({ fecha: new Date(), productos: p, ventas: v, detalle_ventas: d, clientes: c, movimientos_caja: m }, null, 2)], { type: "application/json" });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `backup_${new Date().toISOString().slice(0, 10)}.json`; link.click();
    };

    // --- CIERRE CIEGO ---
    const iniciarCierre = () => { setModalCierre(true); setResultadoCierre(null); setMontoContado(''); };
    const procesarCierre = (e) => { e.preventDefault(); const c = parseFloat(montoContado) || 0; const d = c - resumen.cajaReal; setResultadoCierre({ esperado: resumen.cajaReal, contado: c, diferencia: d, estado: Math.abs(d) < 0.5 ? 'OK' : (d < 0 ? 'FALTA' : 'SOBRA') }); };

    // --- EXPORTAR REPORTES ---
    const exportarPDF = () => {
        const doc = new jsPDF(); doc.text(`Reporte (${rango})`, 14, 15); doc.text(`Ventas: $${resumen.totalVentas.toFixed(2)} | Ganancia: $${resumen.gananciaNeta.toFixed(2)}`, 14, 25);
        autoTable(doc, { head: [['Fecha', 'Método', 'Total']], body: ventas.map(v => [formatoBolivia(v.fecha), v.metodo_pago, `$${v.total}`]), startY: 35 });
        doc.save(`reporte.pdf`);
    };
    const exportarExcel = () => {
        const hoja = XLSX.utils.json_to_sheet(ventas.map(v => ({ Fecha: formatoBolivia(v.fecha), Total: v.total, Metodo: v.metodo_pago })));
        const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, hoja, "Ventas"); XLSX.writeFile(libro, `reporte.xlsx`);
    };

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
                <h2>📈 Finanzas</h2>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button onClick={() => setOcultarMontos(!ocultarMontos)} style={{ background: '#6c757d', color: 'white', border: 'none', padding: '10px', borderRadius: '5px', cursor: 'pointer' }}>{ocultarMontos ? '👁️' : '👁️ Ocultar'}</button>
                    <select value={rango} onChange={(e) => setRango(e.target.value)} style={{ padding: '10px', borderRadius: '5px' }}><option value="hoy">📅 Hoy</option><option value="semana">📅 Semana</option><option value="mes">📅 Mes</option></select>
                    <button onClick={iniciarCierre} style={{ background: '#6f42c1', color: 'white', border: 'none', padding: '10px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>✂️ Cierre</button>
                    <button onClick={handleBackup} style={{ background: '#17a2b8', color: 'white', border: 'none', padding: '10px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>💾 Backup</button>
                    <button onClick={exportarPDF} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '10px', borderRadius: '5px' }}>PDF</button>
                    <button onClick={exportarExcel} style={{ background: '#28a745', color: 'white', border: 'none', padding: '10px', borderRadius: '5px' }}>Excel</button>
                </div>
            </div>

            {/* --- SECCIÓN NUEVA: FALTANTES POR CATEGORÍA --- */}
            {productosBajoStock.length > 0 && (
                <div style={{ marginBottom: '30px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h3 style={{ margin: 0, color: '#dc3545' }}>⚠️ Reponer Inventario</h3>
                        <button onClick={imprimirListaCompra} style={{ background: 'white', color: '#dc3545', border: '2px solid #dc3545', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                            📄 Imprimir Lista de Compra
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
                        {Object.keys(faltantesPorCategoria).map(cat => (
                            <div key={cat} className="card" style={{ borderLeft: '5px solid #dc3545', padding: '10px' }}>
                                <h4 style={{ marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '5px' }}>{cat}</h4>
                                <ul style={{ paddingLeft: '20px', margin: 0 }}>
                                    {faltantesPorCategoria[cat].map(p => (
                                        <li key={p.id} style={{ marginBottom: '5px', fontSize: '14px' }}>
                                            <strong>{p.nombre}</strong>
                                            <br />
                                            <span style={{ color: '#dc3545', fontSize: '12px' }}>
                                                Quedan: {p.stock_actual} {p.unidad}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* KPIS */}
            <div className="form-grid" style={{ marginBottom: '20px' }}>
                <div className="card"><small>Ventas</small><h2 style={{ color: '#007bff', margin: '5px 0' }}>{ocultarMontos ? '****' : `$${resumen.totalVentas.toFixed(2)}`}</h2></div>
                <div className="card" style={{ background: '#f8f9fa' }}><small>Capital</small><h2 style={{ color: '#6c757d', margin: '5px 0' }}>{ocultarMontos ? '****' : `$${resumen.costoCapital.toFixed(2)}`}</h2></div>
                <div className="card" style={{ background: '#e8f5e9', border: '1px solid #c3e6cb' }}><small>Ganancia</small><h2 style={{ color: '#28a745', margin: '5px 0' }}>{ocultarMontos ? '****' : `$${resumen.gananciaNeta.toFixed(2)}`}</h2></div>
                <div className="card" style={{ background: '#333', color: 'white' }}><small>Caja Física</small><h2 style={{ color: '#ffc107', margin: '5px 0' }}>{ocultarMontos ? '****' : `$${resumen.cajaReal.toFixed(2)}`}</h2></div>
            </div>

            <div className="card" style={{ height: '300px', marginBottom: '20px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={datosGrafico}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Bar dataKey="Ventas" fill="#007bff" /><Bar dataKey="Ganancia" fill="#28a745" /></BarChart>
                </ResponsiveContainer>
            </div>

            {/* MODAL CIERRE */}
            {modalCierre && (
                <div className="overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
                    <div className="card" style={{ width: '400px', textAlign: 'center' }}>
                        {!resultadoCierre ? (
                            <form onSubmit={procesarCierre}><h3>✂️ Arqueo</h3><input type="number" placeholder="Monto contado" value={montoContado} onChange={e => setMontoContado(e.target.value)} style={{ fontSize: '20px', padding: '10px', width: '80%', margin: '20px 0', textAlign: 'center' }} autoFocus /><div style={{ display: 'flex', gap: '10px' }}><button type="submit" style={{ flex: 1, padding: '15px', background: '#6f42c1', color: 'white', border: 'none', borderRadius: '5px' }}>Verificar</button><button type="button" onClick={() => setModalCierre(false)} style={{ flex: 1, background: '#ccc', border: 'none', borderRadius: '5px' }}>Cancelar</button></div></form>
                        ) : (
                            <div><div style={{ fontSize: '3rem', margin: '20px 0' }}>{resultadoCierre.estado === 'OK' ? '✅' : resultadoCierre.estado === 'FALTA' ? '❌' : '⚠️'}</div><p>Sistema: ${resultadoCierre.esperado.toFixed(2)} | Tú: ${resultadoCierre.contado.toFixed(2)}</p><button onClick={() => setModalCierre(false)} style={{ width: '100%', padding: '15px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px' }}>Cerrar</button></div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Reportes;