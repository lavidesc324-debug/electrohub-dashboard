import React, { useState, useEffect, useMemo } from "react";
import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Switch } from './components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, RotateCcw, Info, CheckCircle2, XCircle } from 'lucide-react';
import './styles/electrohub.css';
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * ElectroHub — Fase 1 (Dashboard Interactivo)
 *
 * Mejora: Se etiquetan explícitamente los cálculos por **Área** (Cargas, Trafo/Subestación,
 * Alimentadores/ΔV, Cortocircuito/TCC, Armónicos, Tierras, Cumplimiento). Las etiquetas aparecen
 * en cada pestaña, en KPIs y se integran al JSON exportado para trazabilidad.
 */

// ===================== Helpers numéricos ===================== //
const SQRT3 = Math.sqrt(3);
const PI = Math.PI;
// sin anotaciones TS
const toNum = (v, d = 0) => (v === "" || v === null || Number.isNaN(Number(v)) ? d : Number(v));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const cosPhi = (fp) => clamp(fp, 0, 1);
const sinPhi = (fp) => Math.sqrt(Math.max(0, 1 - Math.pow(clamp(fp, 0, 1), 2)));

// ===================== Mapeo de Áreas ===================== //
const AREA = {
  cargas: "Área: Cargas y Demanda",
  trafo: "Área: Transformador y Subestación (MT/BT)",
  dv: "Área: Alimentadores y Caída de Tensión",
  icc: "Área: Cortocircuito y Coordinación (TCC)",
  harm: "Área: Calidad de Energía — Armónicos",
  tierras: "Área: Sistema de Puesta a Tierra",
  compliance: "Área: Cumplimiento Código de Red / NOM"
};

// ===================== Defaults (Proyecto) ===================== //
const DEFAULTS = {
  VLL: 480,  reservePct: 25,  zPercentTrafo: 6,  sccPCC_kVA: "",  V1_FaseN: 277,  targetPF: 0.95,  targetTHD: 5,  targetDV: 3,  targetRg: 5
};

// --- ALIASES (evitan ReferenceError como "defaultVLL") ---
const {
  VLL: defaultVLL,
  reservePct: defaultReservePct,
  zPercentTrafo: defaultZPercentTrafo,
  sccPCC_kVA: defaultSccPCC_kVA,
  V1_FaseN: defaultV1_FaseN,
  targetPF: defaultTargetPF,
  targetTHD: defaultTargetTHD,
  targetDV: defaultTargetDV,
  targetRg: defaultTargetRg
} = DEFAULTS;

// Tabla mínima de ampacidades (aprox.) para dimensionamiento por criterio (NOM-001-SEDE Art. 310)
// Nota: valores referenciales, sustituir por tabla oficial para la entrega.
const AMPACITY_CATALOG = [
  { material: "Cu", temp: "75C", size: "#3 AWG",   method: "Tuberia", amp: 85  },
  { material: "Cu", temp: "75C", size: "1/0 AWG",  method: "Tuberia", amp: 150 },
  { material: "Cu", temp: "75C", size: "2/0 AWG",  method: "Tuberia", amp: 175 },
  { material: "Cu", temp: "75C", size: "3/0 AWG",  method: "Tuberia", amp: 200 },
  { material: "Cu", temp: "90C", size: "250 kcmil",method: "Charola", amp: 290 },
  { material: "Cu", temp: "90C", size: "500 kcmil",method: "Charola", amp: 430 },
  { material: "Al", temp: "75C", size: "#3 AWG",   method: "Tuberia", amp: 65  },
  { material: "Al", temp: "75C", size: "3/0 AWG",  method: "Tuberia", amp: 155 },
  { material: "Al", temp: "90C", size: "250 kcmil",method: "Charola", amp: 210 },
  { material: "Al", temp: "90C", size: "500 kcmil",method: "Charola", amp: 320 },
];

// Cargas (por grupo)
const defaultLoads = [
  { name: "DCFC_1..4", qty: 4, kW: 150, DF_A: 0.65, FP: 0.98, DF_B: 0.25 },
  { name: "AC_1..6", qty: 6, kW: 22, DF_A: 0.5, FP: 0.99, DF_B: 0.25 },
  { name: "Electrolizador", qty: 1, kW: 600, DF_A: 0.58, FP: 0.98, DF_B: 1.0 },
  { name: "Compresion_H2", qty: 1, kW: 150, DF_A: 0.2, FP: 0.95, DF_B: 1.0 },
  { name: "Auxiliares", qty: 1, kW: 60, DF_A: 0.8, FP: 0.9, DF_B: 0.8 },
];

// Catálogo referencial R/X (Ω/km) — Sustituir por Tabla 9 NOM-001 para entrega oficial
const rxCatalog = [
  { material:"Cu", temp:"75C", size:"#3 AWG", method:"Tuberia", R:0.67, X:0.08 },
  { material:"Cu", temp:"75C", size:"1/0 AWG", method:"Tuberia", R:0.33, X:0.08 },
  { material:"Cu", temp:"75C", size:"2/0 AWG", method:"Tuberia", R:0.26, X:0.08 },
  { material:"Cu", temp:"75C", size:"3/0 AWG", method:"Tuberia", R:0.21, X:0.08 },
  { material:"Cu", temp:"90C", size:"250 kcmil", method:"Charola", R:0.10, X:0.07 },
  { material:"Cu", temp:"90C", size:"500 kcmil", method:"Charola", R:0.05, X:0.07 },
  { material:"Al", temp:"75C", size:"#3 AWG", method:"Tuberia", R:1.05, X:0.08 },
  { material:"Al", temp:"75C", size:"3/0 AWG", method:"Tuberia", R:0.42, X:0.08 },
  { material:"Al", temp:"90C", size:"250 kcmil", method:"Charola", R:0.17, X:0.07 },
  { material:"Al", temp:"90C", size:"500 kcmil", method:"Charola", R:0.09, X:0.07 },
];

// Alimentadores principales (para ΔV e Icc extremo)
const defaultFeeders = [
  { name: "DCFC_Cluster_1", area: "Electrolinera – Rápidos (1–2)", PkW: 300, FP: 0.98, VLL: 480, L_m: 80,  material: "Cu", temp: "75C", size: "3/0 AWG",   method: "Tuberia", parallel: 1, R_ohm_km: "", X_ohm_km: "", useCatalog: true },
  { name: "DCFC_Cluster_2", area: "Electrolinera – Rápidos (3–4)", PkW: 300, FP: 0.98, VLL: 480, L_m: 80,  material: "Cu", temp: "75C", size: "3/0 AWG",   method: "Tuberia", parallel: 1, R_ohm_km: "", X_ohm_km: "", useCatalog: true },
  { name: "AC_6x22",        area: "Electrolinera – AC (6 x 22 kW)", PkW: 132, FP: 0.99, VLL: 480, L_m: 60,  material: "Cu", temp: "75C", size: "3/0 AWG",   method: "Tuberia", parallel: 1, R_ohm_km: "", X_ohm_km: "", useCatalog: true },
  { name: "Electrolizador", area: "Planta H₂ – Electrólisis",      PkW: 600, FP: 0.98, VLL: 480, L_m: 100, material: "Cu", temp: "90C", size: "500 kcmil", method: "Charola", parallel: 2, R_ohm_km: "", X_ohm_km: "", useCatalog: true },
  { name: "Compresor_H2",   area: "Planta H₂ – Compresión",        PkW: 150, FP: 0.95, VLL: 480, L_m: 80,  material: "Cu", temp: "75C", size: "3/0 AWG",   method: "Tuberia", parallel: 1, R_ohm_km: "", X_ohm_km: "", useCatalog: true },
  { name: "Auxiliares",     area: "Servicios Auxiliares",          PkW:  60, FP: 0.90, VLL: 480, L_m: 50,  material: "Cu", temp: "75C", size: "#3 AWG",    method: "Tuberia", parallel: 1, R_ohm_km: "", X_ohm_km: "", useCatalog: true },
];

// Armónicos (Zth e Ih)
const defaultHarmonics = [
  { h: 5, Zth_ohm: "", Ih_A: "" },
  { h: 7, Zth_ohm: "", Ih_A: "" },
  { h: 11, Zth_ohm: "", Ih_A: "" },
  { h: 13, Zth_ohm: "", Ih_A: "" },
];

// ===================== Componente Principal ===================== //
export default function ElectroHubDashboard() {
  // Parámetros globales (sin tipos TS)
  const [scenario, setScenario] = useState("A");
  const [VLL, setVLL] = useState(defaultVLL);
  const [reservePct, setReservePct] = useState(defaultReservePct);
  const [ZpctTrafo, setZpctTrafo] = useState(defaultZPercentTrafo);
  const [SccPCC, setSccPCC] = useState(defaultSccPCC_kVA);
  const [V1, setV1] = useState(defaultV1_FaseN);
  const [targetPF, setTargetPF] = useState(defaultTargetPF);
  const [targetTHD, setTargetTHD] = useState(defaultTargetTHD);
  const [targetDV, setTargetDV] = useState(defaultTargetDV);
  const [targetRg, setTargetRg] = useState(defaultTargetRg);

  const [loads, setLoads] = useState(JSON.parse(JSON.stringify(defaultLoads)));
  const [feeders, setFeeders] = useState(JSON.parse(JSON.stringify(defaultFeeders)));
  const [harm, setHarm] = useState(JSON.parse(JSON.stringify(defaultHarmonics || [])));
  const [wenner, setWenner] = useState([{a:1,R:""},{a:2,R:""},{a:4,R:""},{a:8,R:""},{a:16,R:""},{a:32,R:""}]);
  const [rodDesign, setRodDesign] = useState({ rhoOverride:"", L:2.4, d_mm:16, n:8, s:2.4, RgTarget: DEFAULTS.targetRg });

  // Añadir tema oscuro/claro
  const [theme, setTheme] = useState('dark');

  // Añadir búsqueda en tablas
  const [searchTerm, setSearchTerm] = useState('');

  // Añadir ordenamiento de columnas
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });

  // Añadir filtros rápidos
  const [filters, setFilters] = useState({
    showWarnings: false,
    showSuggestions: false
  });

  // --------- Self-tests (básicos) ---------
  useEffect(()=>{ runSelfTests(); },[]);

  // Demanda por escenario y PF total (Área: Cargas)
  const demanda = useMemo(() => {
    let rows = loads.map((r) => {
      const DF = scenario === "A" ? r.DF_A : r.DF_B;
      const kW = r.qty * r.kW * DF;
      const kVA = kW / cosPhi(r.FP);
      return { name: r.name, kW, kVA };
    });
    const sumkW = rows.reduce((a, b) => a + b.kW, 0);
    const sumkVA = rows.reduce((a, b) => a + b.kVA, 0);
    const PF_total = sumkVA>0 ? sumkW/sumkVA : 1;
    return { rows, sumkW, sumkVA, PF_total };
  }, [loads, scenario]);

  // Trafo y corto en TG (Área: Trafo/Subestación)
  const trafo = useMemo(() => {
    const S_kVA = demanda.sumkVA * (1 + reservePct / 100);
    const I_FL = S_kVA * 1000 / (SQRT3 * VLL);
    const Icc_trafo = I_FL * (100 / ZpctTrafo);
    const Scc = toNum(SccPCC, 0); // kVA
    const Zred = Scc > 0 ? (VLL * VLL) / (Scc * 1000) : 0; // Ω referida a BT
    const Ztrafo = VLL / (SQRT3 * Icc_trafo); // Ω
    const Icc_origen = (Zred + Ztrafo) > 0 ? (VLL / (SQRT3 * (Zred + Ztrafo))) : Icc_trafo;
    return { S_kVA, I_FL, Icc_trafo, Zred, Ztrafo, Icc_origen };
  }, [demanda.sumkVA, reservePct, VLL, ZpctTrafo, SccPCC]);

  // ΔV e Icc extremo (Área: Alimentadores / Cortocircuito)
  const feedersCalc = useMemo(() => {
    return feeders.map((f) => {
      const PkW = toNum(f.PkW, 0);
      const FP = cosPhi(toNum(f.FP, 0.95));
      const Lkm = toNum(f.L_m, 0) / 1000;
      const V = toNum(f.VLL, VLL);
      const I = PkW * 1000 / (SQRT3 * V * FP);
      const nPar = Number(f.parallel) || 1;
      const I_num = Number(I) || 0;
      const V_num = Number(V) || defaultVLL;
      const FP_clamped = clamp(Number(FP) || 1, 0, 1);
      const Lkm_num = Number(Lkm) || 0;

      // Asegurar Rkm/Xkm usados (si ya los calculaste más arriba, se reusa; si no, los obtenemos del catálogo)
      const Rkm_used = (typeof Rkm !== 'undefined' && Rkm !== null)
        ? Number(Rkm)
        : (Number(lookupRX(f.material, f.temp, f.size, f.method).R) || 0) / Math.max(1, nPar);

      const Xkm_used = (typeof Xkm !== 'undefined' && Xkm !== null)
        ? Number(Xkm)
        : (Number(lookupRX(f.material, f.temp, f.size, f.method).X) || 0) / Math.max(1, nPar);

      const dV = (SQRT3 * I * (Rkm_used * FP + Xkm_used * sinPhi(FP)) * Lkm) / V * 100;
      const Zline = Math.sqrt(Math.pow(Rkm_used * (Lkm), 2) + Math.pow(Xkm_used * (Lkm), 2));
      const Zsource = V / (SQRT3 * trafo.Icc_origen);
      const Icc_end = V / (SQRT3 * (Zsource + Zline || 1e-9));
      const suggestion = suggestSize({
        I: I_num,
        V: V_num,
        FP: FP_clamped,
        Lkm: Lkm_num,
        mat: f.material,
        temp: f.temp,
        size: f.size,
        method: f.method,
        nPar
      });

      return {
        ...f,
        I: I_num,
        dV,
        Icc_end,
        Rkm_used,
        Xkm_used,
        warnDV: dV > targetDV,
        sugg: suggestion || null
      };
    });
  }, [feeders, VLL, trafo.Icc_origen]);

  // THD de tensión (Área: Armónicos)
  const harmCalc = useMemo(() => {
    const rows = harm.map((h) => {
      const Z = Math.abs(toNum(h.Zth_ohm, 0));
      const I = Math.abs(toNum(h.Ih_A, 0));
      const Vh = Z * I;
      return { h: h.h, Z, I, Vh };
    });
    const sumV2 = rows.reduce((a, b) => a + b.Vh * b.Vh, 0);
    const THD_V = V1 > 0 ? Math.sqrt(sumV2) / V1 * 100 : 0;
    return { rows, THD_V };
  }, [harm, V1]);

  // Wenner y Dwight (Área: Tierras)
  const wennerCalc = useMemo(()=>{
    const rows = wenner.map(w=>{
      const R = toNum(w.R, 0);
      const rho = 2*PI*w.a*R; // Ω·m
      return { ...w, rho };
    });
    const valid = rows.filter(r=>r.rho>0);
    const rhoAvg = valid.length? valid.reduce((a,b)=>a+b.rho,0)/valid.length : 0;
    return { rows, rhoAvg };
  }, [wenner]);

  const rodsCalc = useMemo(()=>{
    const rho = toNum(rodDesign.rhoOverride, 0) || wennerCalc.rhoAvg; // Ω·m
    const L = toNum(rodDesign.L, 2.4); // m
    const d = Math.max(0.004, toNum(rodDesign.d_mm,16)/1000); // m
    const n = Math.max(1, Math.floor(toNum(rodDesign.n, 8)));
    const s = Math.max(0.5, toNum(rodDesign.s, 2.4));
    const R1 = rho/(2*PI*L) * (Math.log(8*L/d) - 1);
    const k = 1/(1 + 1.6*(L/s)); // 0<k<=1
    const Rtot = R1 / (n * k);
    return { rho, R1, n, s, k, Rtot };
  }, [rodDesign, wennerCalc.rhoAvg]);

  // Lookup R/X por catálogo (sin tipos)
  function lookupRX(mat, t, size, method){
    const hit = rxCatalog.find(x=>x.material===mat && x.temp===t && x.size===size && x.method===method);
    if(!hit) return {R:NaN, X:NaN};
    return {R:hit.R, X:hit.X};
  }

  // Sugerir tamaño (moved inside component so it can access lookupRX y targetDV)
  function suggestSize({ I, V, FP, Lkm, mat, temp, size, method, nPar }) {
     const I_num = Number(I) || 0;
     const V_num = Number(V) || 1;
     const FP_clamped = clamp(Number(FP) || 1, 0, 1);
     const Lkm_num = Number(Lkm) || 0;
     const nPar_num = Math.max(1, Number(nPar) || 1);

     const candidates = AMPACITY_CATALOG.filter(c => c.material === mat && c.temp === temp && c.method === method);
     const list = candidates.length ? candidates : AMPACITY_CATALOG.filter(c => c.material === mat);
     if (!list.length) return null;

     let best = null;

     for (const c of list) {
       const rxNew = lookupRX(mat, temp, c.size, method);
       const rxRef = lookupRX(mat, temp, size, method);

       const Rnew = Number(rxNew?.R);
       const Xnew = Number(rxNew?.X);
       const Rref = Number(rxRef?.R) || 0;
       const Xref = Number(rxRef?.X) || 0;

       const Rkm = (Number.isFinite(Rnew) && !Number.isNaN(Rnew) ? Rnew : Rref) / nPar_num;
       const Xkm = (Number.isFinite(Xnew) && !Number.isNaN(Xnew) ? Xnew : Xref) / nPar_num;

       const dV = (SQRT3 * I_num * (Rkm * FP_clamped + Xkm * sinPhi(FP_clamped)) * Lkm_num) / V_num * 100;
       const ampOK = (c.amp * nPar_num) >= I_num;

       const candidate = { size: c.size, dV: Number(dV.toFixed(3)), amp: c.amp, Rkm, Xkm };

       if (dV <= targetDV && ampOK) {
         best = candidate;
         break;
       }

       if (!best || candidate.dV < best.dV) {
         best = candidate;
       }
     }

     return best;
 }

  // Reset y Export JSON (incluye metadatos de Área)
  const resetAll = () => {
    setScenario("A"); 
    setVLL(DEFAULTS.VLL); 
    setReservePct(DEFAULTS.reservePct); 
    setZpctTrafo(DEFAULTS.zPercentTrafo); // Corregir el punto y coma faltante
    setSccPCC(DEFAULTS.sccPCC_kVA); 
    setV1(DEFAULTS.V1_FaseN);
    setTargetPF(DEFAULTS.targetPF);
    setTargetTHD(DEFAULTS.targetTHD);
    setTargetDV(DEFAULTS.targetDV);
    setTargetRg(DEFAULTS.targetRg);
    setLoads(JSON.parse(JSON.stringify(defaultLoads)));
    setFeeders(JSON.parse(JSON.stringify(defaultFeeders)));
    setHarm(JSON.parse(JSON.stringify(defaultHarmonics)));
    setWenner([{a:1,R:""},{a:2,R:""},{a:4,R:""},{a:8,R:""},{a:16,R:""},{a:32,R:""}]);
    setRodDesign({ rhoOverride:"", L:2.4, d_mm:16, n:8, s:2.4, RgTarget:DEFAULTS.targetRg });
  };

  const exportJSON = () => {
    try {
      const payload = {
        meta: { proyecto: "ElectroHub", fase: 1, areas: AREA },
        scenario,
        params: { VLL, reservePct, ZpctTrafo, SccPCC, V1 },
        datasets: { loads, feeders, harm, wenner, rodDesign },
        resultados: {
          cargas: demanda,
          trafo,
          alimentadores: feedersCalc,
          armonicos: { filas: harmCalc.rows, THD_V: harmCalc.THD_V },
          tierras: { wenner: wennerCalc, varillas: rodsCalc },
          cumplimiento: {
            dvMax, okDV, okPF, okTHD, okRg,
            metas: { targetDV, targetPF, targetTHD, targetRg }
          }
        }
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `ElectroHub_Fase1_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export JSON failed", e);
      try { const url = URL.createObjectURL(new Blob(["{}"], { type: "application/json" })); window.open(url, "_blank"); } catch(_){}
    }
  };

  // Cumplimiento
  const dvMax = Math.max(...feedersCalc.map(f=>f.dV||0), 0);
  const okDV = dvMax <= targetDV;
  const okPF = demanda.PF_total >= targetPF;
  const okTHD = harmCalc.THD_V <= targetTHD || harmCalc.THD_V===0; // si no hay datos, no marcar en rojo
  const okRg = rodsCalc.Rtot <= targetRg && rodsCalc.Rtot>0;

  return (
    <div className="eh-root min-h-screen p-8 max-w-7xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between header">
        <h1 className="text-2xl font-semibold tracking-tight text-white">ElectroHub — Fase 1</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={exportJSON}><Download className="mr-2 h-4 w-4"/>Exportar JSON</Button>
          <Button variant="outline" onClick={resetAll}><RotateCcw className="mr-2 h-4 w-4"/>Reset</Button>
        </div>
      </div>

      {/* MANUAL PARA INGENIEROS (explicación integrada) */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-lg font-semibold">Manual para ingenieros — Cómo usar esta herramienta</div>
              <ol className="list-decimal ml-5 mt-2 text-sm space-y-1">
                <li><b>Parámetros globales:</b> fije V_LL, % de reserva y Z% del transformador; si CFE entrega Scc_PCC, introdúzcalo para calcular la impedancia de la red.</li>
                <li><b>Pestaña Cargas:</b> edite Cant, kW, DF y FP por grupo. Verifique kW y kVA escalados y el PF_total (impacta selección de trafo).</li>
                <li><b>Pestaña Trafo:</b> revisa S_kVA sugerido, I_FL e Icc (solo trafo y con red). Ajuste reserva o Z% si el trafo no cumple requisitos térmicos/TCC.</li>
                <li><b>Pestaña Alimentadores (ΔV):</b> para cada circuito defina P[kW], FP, L[m] y conductor; active "usar catálogo" o capture R/X desde Tabla 9 (NOM‑001). Revise ΔV[%] y sugerencias de calibre.</li>
                <li><b>Pestaña Icc:</b> use Icc extremo para coordinar protección (curvas TCC) y validar Icu/Ics de interruptores.</li>
                <li><b>Pestaña Armónicos:</b> capture |Zth(h)| e Ih(h) por armónico; la app calcula |Vh| y THD_V respecto a V1.</li>
                <li><b>Pestaña Tierras:</b> introduzca lecturas Wenner (a,R) para estimar ρ; use la sección de varillas para calcular Rg (fórmula de Dwight).</li>
                <li><b>Export/Report:</b> - JSON: traza completa con metadatos (áreas). - CSV: tablas por entidad. - Reporte (PDF): genera el reporte extendido con tablas y gráficas.</li>
                <li className="text-xs text-gray-500">Notas: tablas R/X y ampacidades son referenciales; para entrega oficial sustituya por tabla NOM‑001 y valide medidas in‑situ (IEEE 81 para tierras).</li>
              </ol>
            </div>
            <div className="flex flex-col gap-2 shrink-0 ml-4">
              <Button variant="outline" onClick={()=>{navigator.clipboard?.writeText(window.location.href); alert('URL copiada al portapapeles');}}>Copiar URL</Button>
              <Button onClick={openReport}>Generar PDF</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="shadow-sm"><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">Escenario</div>
            <AreaBadge text={AREA.cargas} />
          </div>
          <div className="flex items-center gap-3 mt-2">
            <Button variant={scenario === "A" ? "default" : "outline"} onClick={() => setScenario("A")}>A</Button>
            <Button variant={scenario === "B" ? "default" : "outline"} onClick={() => setScenario("B")}>B</Button>
          </div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">Demanda total</div>
            <AreaBadge text={AREA.cargas} />
          </div>
          <div className="text-xl font-semibold">{demanda.sumkW.toFixed(1)} kW / {demanda.sumkVA.toFixed(1)} kVA</div>
          <div className="text-xs text-gray-500">PF total: <b>{demanda.PF_total.toFixed(3)}</b> (meta ≥ {targetPF})</div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">Trafo & Corto (TG 480 V)</div>
            <AreaBadge text={AREA.trafo} />
          </div>
          <div className="text-sm">I_FL: <b>{trafo.I_FL.toFixed(0)}</b> A</div>
          <div className="text-sm">Icc (solo trafo): <b>{trafo.Icc_trafo.toFixed(0)}</b> A</div>
          <div className="text-sm">Icc (con red): <b>{trafo.Icc_origen.toFixed(0)}</b> A</div>
        </CardContent></Card>
      </div>

      {/* PARÁMETROS GLOBALES */}
      <Card className="shadow-sm"><CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm text-gray-600">Parámetros globales</div>
          <AreaBadge text="Áreas: Global → impacta Cargas, Trafo, ΔV, Icc, Armónicos" />
        </div>
        <div className="grid md:grid-cols-5 gap-4">
          <div><Label>V_LL [V]</Label>
            {/* Input global VLL */}
            <Input
              type="number"
              min={200}
              max={600}
              step={1}
              value={VLL}
              onChange={e => setVLL(toNum(e.target.value, defaultVLL))}
            /></div>
          <div><Label>Reserva [%]</Label><Input type="number" value={reservePct} onChange={e=>setReservePct(toNum(e.target.value, reservePct))}/></div>
          <div><Label>Z% Trafo</Label><Input type="number" value={ZpctTrafo} onChange={e=>setZpctTrafo(toNum(e.target.value, ZpctTrafo))}/></div>
          <div><Label>Scc_PCC [kVA] (CFE)</Label><Input placeholder="p.ej. 200000" value={SccPCC} onChange={e=>setSccPCC(e.target.value)}/></div>
          <div><Label>V1 (fase-N) para THD [V]</Label><Input type="number" value={V1} onChange={e=>setV1(toNum(e.target.value, V1))}/></div>
        </div>
      </CardContent></Card>

      <Tabs defaultValue="cargas" className="w-full">
        <TabsList className="grid lg:grid-cols-7 w-full">
          <TabsTrigger value="cargas">Cargas <SmallAreaTag>Área</SmallAreaTag></TabsTrigger>
          <TabsTrigger value="trafo">Trafo <SmallAreaTag>Área</SmallAreaTag></TabsTrigger>
          <TabsTrigger value="dv">Caída V <SmallAreaTag>Área</SmallAreaTag></TabsTrigger>
          <TabsTrigger value="icc">Icc Extremo <SmallAreaTag>Área</SmallAreaTag></TabsTrigger>
          <TabsTrigger value="harm">Armónicos <SmallAreaTag>Área</SmallAreaTag></TabsTrigger>
          <TabsTrigger value="tierras">Tierras <SmallAreaTag>Área</SmallAreaTag></TabsTrigger>
          <TabsTrigger value="compliance">Cumplimiento <SmallAreaTag>Área</SmallAreaTag></TabsTrigger>
        </TabsList>

        {/* CARGAS */}
        <TabsContent value="cargas" className="mt-4">
          <SectionHeader title="Cargas y Demanda" area={AREA.cargas} />
          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="shadow-sm lg:col-span-2">
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b"><th>Grupo</th><th>Cant</th><th>kW</th><th>DF_A</th><th>DF_B</th><th>FP</th><th>kW esc</th><th>kVA esc</th></tr>
                    </thead>
                    <tbody>
                      {loads.map((r,idx)=>{
                        const DF = scenario === "A" ? r.DF_A : r.DF_B;
                        const kW = r.qty*r.kW*DF; const kVA = kW/cosPhi(r.FP);
                        return (
                          <tr key={idx} className="border-b hover:bg-muted/30">
                            <td>{r.name}</td>
                            <td><Input className="h-8" type="number" value={r.qty} onChange={e=>{const v=[...loads]; v[idx].qty=toNum(e.target.value, r.qty); setLoads(v);}}/></td>
                            <td><Input className="h-8" type="number" value={r.kW} onChange={e=>{const v=[...loads]; v[idx].kW=toNum(e.target.value, r.kW); setLoads(v);}}/></td>
                            <td><Input className="h-8" type="number" value={r.DF_A} onChange={e=>{const v=[...loads]; v[idx].DF_A=toNum(e.target.value, r.DF_A); setLoads(v);}}/></td>
                            <td><Input className="h-8" type="number" value={r.DF_B} onChange={e=>{const v=[...loads]; v[idx].DF_B=toNum(e.target.value, r.DF_B); setLoads(v);}}/></td>
                            <td><Input className="h-8" type="number" value={r.FP} onChange={e=>{const v=[...loads]; v[idx].FP=toNum(e.target.value, r.FP); setLoads(v);}}/></td>
                            <td className="font-medium">{kW.toFixed(1)}</td>
                            <td className="font-medium">{kVA.toFixed(1)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="text-sm text-gray-600 flex items-center justify-between">
                  <span>Demanda por grupo (kW/kVA)</span>
                  <AreaBadge text={AREA.cargas} />
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={demanda.rows.map((r)=>({name:r.name,kW:Number(r.kW.toFixed(1)),kVA:Number(r.kVA.toFixed(1))}))} margin={{ left: 8, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" fontSize={12}/>
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Bar dataKey="kW" />
                      <Bar dataKey="kVA" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TRAFO */}
        <TabsContent value="trafo" className="mt-4">
          <SectionHeader title="Transformador y Subestación (MT/BT)" area={AREA.trafo} />
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="shadow-sm md:col-span-2"><CardContent className="p-4 space-y-2 text-sm">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="Demanda (kVA) esc" value={demanda.sumkVA.toFixed(1)} />
                <Field label="Reserva [%]" value={reservePct} onChange={(v)=>setReservePct(toNum(v, reservePct))} editable />
                <Field label="Trafo sugerido [kVA]" value={trafo.S_kVA.toFixed(0)} highlight />
                <Field label="I_FL [A]" value={trafo.I_FL.toFixed(0)} />
                <Field label="Z% Trafo" value={ZpctTrafo} onChange={(v)=>setZpctTrafo(toNum(v, ZpctTrafo))} editable />
                <Field label="Icc (solo trafo) [A]" value={trafo.Icc_trafo.toFixed(0)} />
                <Field label="Scc_PCC [kVA]" value={SccPCC} onChange={setSccPCC} editable />
                <Field label="Z_red [Ω] (BT)" value={trafo.Zred.toFixed(6)} />
                <Field label="Z_trafo [Ω]" value={trafo.Ztrafo.toFixed(6)} />
                <Field label="Icc origen (con red) [A]" value={trafo.Icc_origen.toFixed(0)} highlight />
              </div>
              <div className="text-xs text-gray-500 mt-2 flex items-center gap-2"><Info className="h-3 w-3"/>Fórmulas: S=Σ(kW/FP)·(1+Res), I_FL=S·1000/(√3·V), Icc=I_FL·(100/Z%), Z_red=V²/(Scc·1000), Z_traf=V/(√3·Icc), Icc_origen=V/(√3·(Z_red+Z_traf)).</div>
            </CardContent></Card>

            <Card className="shadow-sm"><CardContent className="p-4 text-sm space-y-2">
              <p className="text-gray-600">Checklist de selección</p>
              <ul className="list-disc ml-5">
                <li>kVA ≥ demanda con reserva</li>
                <li>Tap-changer acorde a perfil</li>
                <li>Clase térmica y ambiente</li>
                <li>Corriente de cortocircuito compatible con BT</li>
              </ul>
            </CardContent></Card>
          </div>
        </TabsContent>

        {/* CAIDA DE TENSION */}
        <TabsContent value="dv" className="mt-4">
          <SectionHeader title="Alimentadores y Caída de Tensión" area={AREA.dv} />
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b"><th>Circuito</th><th>P[kW]</th><th>FP</th><th>V_LL</th><th>L[m]</th><th>Material</th><th>T°</th><th>Calibre</th><th>Método</th><th>Catálogo</th><th>R [Ω/km]</th><th>X [Ω/km]</th><th>Paralelo</th><th>I [A]</th><th>ΔV[%]</th></tr>
                  </thead>
                  <tbody>
                    {feedersCalc.map((f,idx)=>{
                      const row = feeders[idx];
                      return (
                        <tr key={idx} className="border-b hover:bg-muted/30">
                          <td className="font-medium">{f.name}</td>
                          <td><Input className="h-8" type="number" value={row.PkW} onChange={e=>{const v=[...feeders]; v[idx].PkW=toNum(e.target.value,row.PkW); setFeeders(v);}}/></td>
                          <td><Input className="h-8" type="number" value={row.FP} onChange={e=>{const v=[...feeders]; v[idx].FP=toNum(e.target.value,row.FP); setFeeders(v);}}/></td>
                          <td><Input className="h-8" type="number" value={row.VLL} onChange={e=>{const v=[...feeders]; v[idx].VLL=toNum(e.target.value,row.VLL); setFeeders(v);}}/></td>
                          <td><Input className="h-8" type="number" value={row.L_m} onChange={e=>{const v=[...feeders]; v[idx].L_m=toNum(e.target.value,row.L_m); setFeeders(v);}}/></td>
                          <td><Input className="h-8" value={row.material} onChange={e=>{const v=[...feeders]; v[idx].material=e.target.value; setFeeders(v);}}/></td>
                          <td><Input className="h-8" value={row.temp} onChange={e=>{const v=[...feeders]; v[idx].temp=e.target.value; setFeeders(v);}}/></td>
                          <td><Input className="h-8" value={row.size} onChange={e=>{const v=[...feeders]; v[idx].size=e.target.value; setFeeders(v);}}/></td>
                          <td><Input className="h-8" value={row.method} onChange={e=>{const v=[...feeders]; v[idx].method=e.target.value; setFeeders(v);}}/></td>
                          <td>
                            <div className="flex items-center gap-2">
                              <Switch checked={!!row.useCatalog} onCheckedChange={(val)=>{const v=[...feeders]; v[idx].useCatalog=val; setFeeders(v);}}/>
                              <span className="text-xs">usar catálogo</span>
                            </div>
                          </td>
                          <td><Input className="h-8" value={row.R_ohm_km} onChange={e=>{const v=[...feeders]; v[idx].R_ohm_km=e.target.value; setFeeders(v);}} placeholder="Tabla 9 NOM"/></td>
                          <td><Input className="h-8" value={row.X_ohm_km} onChange={e=>{const v=[...feeders]; v[idx].X_ohm_km=e.target.value; setFeeders(v);}} placeholder="Tabla 9 NOM"/></td>
                          <td><Input className="h-8" type="number" value={row.parallel} onChange={e=>{const v=[...feeders]; v[idx].parallel=toNum(e.target.value,row.parallel); setFeeders(v);}}/></td>
                          <td className="text-right">{f.I.toFixed(0)}</td>
                          <td className={f.warnDV?"text-red-600 font-semibold":""}>{f.dV.toFixed(2)}</td>
                          <td className="text-xs">{f.sugg?.size || "—"}</td>
                          <td className="text-xs">{typeof f.sugg?.dV === 'number' ? f.sugg.dV.toFixed(2) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-gray-500 mt-2">ΔV criterio: ≤ 3% alimentador, ≤ 5% total. El catálogo R/X es referencial; valida con NOM‑001‑SEDE Tabla 9.</div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ICC EXTREMO */}
        <TabsContent value="icc" className="mt-4">
          <SectionHeader title="Cortocircuito (extremo de alimentador) y TCC" area={AREA.icc} />
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b"><th>Circuito</th><th>V_LL</th><th>L[m]</th><th>R[Ω/km]</th><th>X[Ω/km]</th><th>Icc @ extremo [A]</th></tr>
                  </thead>
                  <tbody>
                    {feedersCalc.map((f,idx)=>{
                      const row = feeders[idx];
                      return (
                        <tr key={idx} className="border-b">
                          <td>{f.name}</td>
                          <td>{row.VLL}</td>
                          <td>{row.L_m}</td>
                          <td>{(row.useCatalog? f.Rkm_used : toNum(row.R_ohm_km,0)).toFixed(3)}</td>
                          <td>{(row.useCatalog? f.Xkm_used : toNum(row.X_ohm_km,0)).toFixed(3)}</td>
                          <td className="font-medium">{f.Icc_end.toFixed(0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bloque separado que estaba mal ubicado dentro del map */}
              <div className="grid md:grid-cols-2 gap-6">
                <Card className="shadow-sm"><CardContent className="p-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b"><th>h</th><th>|Zth(h)| [Ω]</th><th>Ih_total [A]</th><th>|Vh| [V]</th></tr>
                      </thead>
                      <tbody>
                        {harmCalc.rows.map((r,idx)=> (
                          <tr key={idx} className="border-b hover:bg-muted/30">
                            <td className="font-medium">{r.h}</td>
                            <td><Input className="h-8" value={harm[idx].Zth_ohm} onChange={e=>{const v=[...harm]; v[idx].Zth_ohm=e.target.value; setHarm(v);}}/></td>
                            <td><Input className="h-8" value={harm[idx].Ih_A} onChange={e=>{const v=[...harm]; v[idx].Ih_A=e.target.value; setHarm(v);}}/></td>
                            <td className="font-medium">{r.Vh.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <Label>V1 (fase-N) [V]</Label>
                      <Input type="number" value={V1} onChange={e=>setV1(toNum(e.target.value, V1))}/>
                    </div>
                    <div className="flex items-end"><div className="text-lg font-semibold">THD_V: {harmCalc.THD_V.toFixed(2)} %</div></div>
                  </div>
                </CardContent></Card>

                <Card className="shadow-sm"><CardContent className="p-4">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={harmCalc.rows.map((r)=>({ name: `${r.h}ª`, Vh: Number(r.Vh.toFixed(2)) }))} margin={{ left: 8, right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" fontSize={12}/>
                        <YAxis fontSize={12} />
                        <Tooltip />
                        <Bar dataKey="Vh" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent></Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TIERRAS */}
        <TabsContent value="tierras" className="mt-4">
          <SectionHeader title="Sistema de Puesta a Tierra" area={AREA.tierras} />
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="shadow-sm"><CardContent className="p-4">
              <div className="text-sm text-gray-600 mb-2">Wenner (4 puntas): ingresa R[Ω] por espaciamiento a[m]. ρ = 2πaR</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left border-b"><th>a [m]</th><th>R [Ω]</th><th>ρ [Ω·m]</th></tr></thead>
                  <tbody>
                    {wenner.map((w,idx)=>{
                      const R = toNum(w.R,0); const rho = 2*PI*w.a*R;
                      return (
                        <tr key={idx} className="border-b hover:bg-muted/30">
                          <td className="font-medium">{w.a}</td>
                          <td><Input className="h-8" value={w.R} onChange={e=>{const v=[...wenner]; v[idx].R=e.target.value; setWenner(v);}}/></td>
                          <td className="font-medium">{rho>0?rho.toFixed(1):""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-sm">ρ promedio: <b>{wennerCalc.rhoAvg>0?wennerCalc.rhoAvg.toFixed(1):""}</b> Ω·m</div>
            </CardContent></Card>

            <Card className="shadow-sm"><CardContent className="p-4 space-y-3">
              <div className="text-sm text-gray-600">Diseño de varillas (Dwight aprox.)</div>
              <div className="grid md:grid-cols-3 gap-3 text-sm">
                <div><Label>ρ [Ω·m] (override)</Label><Input value={rodDesign.rhoOverride} onChange={e=>setRodDesign({...rodDesign, rhoOverride:e.target.value})} placeholder={wennerCalc.rhoAvg>0?`≈ ${wennerCalc.rhoAvg.toFixed(1)}`:""}/></div>
                <div><Label>L varilla [m]</Label><Input type="number" value={rodDesign.L} onChange={e=>setRodDesign({...rodDesign, L:toNum(e.target.value, rodDesign.L)})}/></div>
                <div><Label>Diámetro [mm]</Label><Input type="number" value={rodDesign.d_mm} onChange={e=>setRodDesign({...rodDesign, d_mm:toNum(e.target.value, rodDesign.d_mm)})}/></div>
                <div><Label>N° varillas</Label><Input type="number" value={rodDesign.n} onChange={e=>setRodDesign({...rodDesign, n:toNum(e.target.value, rodDesign.n)})}/></div>
                <div><Label>Espaciamiento s [m]</Label><Input type="number" value={rodDesign.s} onChange={e=>setRodDesign({...rodDesign, s:toNum(e.target.value, rodDesign.s)})}/></div>
                <div><Label>Rg objetivo [Ω]</Label><Input type="number" value={rodDesign.RgTarget} onChange={e=>setRodDesign({...rodDesign, RgTarget:toNum(e.target.value, rodDesign.RgTarget)})}/></div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Field label="R1 varilla [Ω]" value={rodsCalc.R1.toFixed(2)} />
                <Field label="Factor k (mutua)" value={rodsCalc.k.toFixed(2)} />
                <Field label="Rg estimada [Ω]" value={rodsCalc.Rtot.toFixed(2)} highlight />
                <Field label="ρ usado [Ω·m]" value={rodsCalc.rho.toFixed(1)} />
              </div>
              <div className="text-xs text-gray-500">Nota: fórmula de Dwight, y factor de paralelismo aproximado k≈1/(1+1.6·L/s). Si s≥L, las varillas se comportan casi independientes. Verificar in-situ con medición de caída de potencial (IEEE 81).</div>
            </CardContent></Card>
          </div>
        </TabsContent>

        {/* CUMPLIMIENTO */}
        <TabsContent value="compliance" className="mt-4">
          <SectionHeader title="Semáforo de Cumplimiento" area={AREA.compliance} />
          <div className="grid md:grid-cols-4 gap-4">
            <ComplianceTile ok={okDV} label={`ΔV max ≤ ${targetDV}%`} value={`${dvMax.toFixed(2)} %`} />
            <ComplianceTile ok={okPF} label={`PF ≥ ${targetPF}`} value={demanda.PF_total.toFixed(3)} />
            <ComplianceTile ok={okTHD} label={`THD_V ≤ ${targetTHD}%`} value={`${harmCalc.THD_V.toFixed(2)} %`} />
            <ComplianceTile ok={okRg} label={`Rg ≤ ${targetRg} Ω`} value={`${rodsCalc.Rtot>0?rodsCalc.Rtot.toFixed(2):"—"} Ω`} />
          </div>
          <div className="text-xs text-gray-500 mt-3">Semáforos calculados con los parámetros actuales. Para entrega oficial: validar R/X con NOM‑001‑SEDE, ρ con medición (IEEE 81) y THD/FP en PCC conforme a criterios del proyecto.</div>
        </TabsContent>
      </Tabs>

      {/* UTILIDADES (import/export/snapshots) */}
      <div className="mt-4 grid md:grid-cols-3 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="font-medium">Snapshots</div>
            <div className="flex gap-2">
              <Input id="snapName" placeholder="Nombre del snapshot (p.ej. Escenario C)" />
              <Button onClick={() => {
                const input = document.getElementById('snapName');
                const name = (input && input.value) ? input.value : `snapshot_${Date.now()}`;
                try {
                  const raw = localStorage.getItem('electrohub_fase1_state');
                  if (raw) {
                    localStorage.setItem(`electrohub_snap_${name}`, raw);
                    alert(`Guardado: ${name}`);
                  } else {
                    alert('No hay estado actual para guardar.');
                  }
                } catch (e) {
                  console.error(e);
                  alert('Error al guardar snapshot.');
                }
              }}>Guardar</Button>

              <Button variant="outline" onClick={() => {
                try {
                  const keys = Object.keys(localStorage).filter(k => k.startsWith('electrohub_snap_'));
                  if (!keys.length) { alert('No hay snapshots'); return; }
                  const last = keys[keys.length - 1];
                  const raw = localStorage.getItem(last);
                  if (!raw) { alert('Snapshot corrupto'); return; }
                  const s = JSON.parse(raw);
                  if (s.params) {
                    setVLL(s.params.VLL ?? defaultVLL);
                    setReservePct(s.params.reservePct ?? defaultReservePct);
                    setZpctTrafo(s.params.ZpctTrafo ?? defaultZPercentTrafo);
                    setSccPCC(s.params.SccPCC ?? defaultSccPCC_kVA);
                    setV1(s.params.V1 ?? defaultV1_FaseN);
                  }
                  if (s.scenario) setScenario(s.scenario);
                  if (s.datasets?.loads) setLoads(s.datasets.loads);
                  if (s.datasets?.feeders) setFeeders(s.datasets.feeders);
                  if (s.datasets?.harm) setHarm(s.datasets.harm);
                  if (s.datasets?.wenner) setWenner(s.datasets.wenner);
                  if (s.datasets?.rodDesign) setRodDesign(s.datasets.rodDesign);
                  alert(`Cargado: ${last.replace('electrohub_snap_','')}`);
                } catch (e) {
                  console.error(e);
                  alert('Error al cargar snapshot.');
                }
              }}>Cargar último</Button>
            </div>
          </CardContent>
        </Card>

        {/* IMPORT / EXPORT CSV */}
        <Card className="shadow-sm">
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="font-medium">Importar CSV</div>
            <div className="text-xs text-gray-500">Cargas: name,qty,kW,DF_A,DF_B,FP</div>
            <input type="file" accept=".csv" onChange={(e)=>csvImport(e,'loads')} />
            <Button variant="outline" onClick={()=>{
              const rows = window.__EH__IMPORT_LOADS || [];
              if (!rows.length) { alert('Primero selecciona el CSV de cargas.'); return; }
              setLoads(rows.map((r)=>{
                return {
                  name: r.name,
                  qty: toNum(r.qty,1),
                  kW: toNum(r.kW,0),
                  DF_A: toNum(r.DF_A,1),
                  DF_B: toNum(r.DF_B,1),
                  FP: toNum(r.FP,1)
                };
              }));
              delete window.__EH__IMPORT_LOADS;
              alert('Cargas importadas.');
            }}>Aplicar cargas</Button>

            <div className="text-xs text-gray-500 mt-2">
              Alimentadores: name,area,PkW,FP,VLL,L_m,material,temp,size,method,parallel,R_ohm_km,X_ohm_km,useCatalog
            </div>
            <input type="file" accept=".csv" onChange={(e)=>csvImport(e,'feeders')} />
            <Button variant="outline" onClick={()=>{
              const rows = window.__EH__IMPORT_FEEDERS || [];
              if (!rows.length) { alert('Primero selecciona el CSV de alimentadores.'); return; }
              setFeeders(rows.map((r)=>({
                name: r.name,
                area: r.area,
                PkW: toNum(r.PkW,0),
                FP: toNum(r.FP,1),
                VLL: toNum(r.VLL, defaultVLL),
                L_m: toNum(r.L_m,0),
                material: r.material || 'Cu',
                temp: r.temp || '75C',
                size: r.size || '#3 AWG',
                method: r.method || 'Tuberia',
                parallel: toNum(r.parallel,1),
                R_ohm_km: r.R_ohm_km || '',
                X_ohm_km: r.X_ohm_km || '',
                useCatalog: String(r.useCatalog).toLowerCase() !== 'false'
              })));
              delete window.__EH__IMPORT_FEEDERS;
              alert('Alimentadores importados.');
            }}>Aplicar alimentadores</Button>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="font-medium">Exportar</div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={exportJSON}><Download className="mr-2 h-4 w-4"/>JSON</Button>
              <Button variant="outline" onClick={()=>exportCSV('Cargas', demanda?.rows || [])}>CSV Cargas</Button>
              <Button variant="outline" onClick={()=>exportCSV('Alimentadores', feedersCalc || [])}>CSV Alimentadores</Button>
              <Button variant="outline" onClick={openReport}>Reporte extendido (PDF)</Button>
            </div>
          </CardContent>
        </Card>

        {/* Snapshot list quick view */}
        <Card className="shadow-sm">
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="font-medium">Snapshots guardados</div>
            <div className="max-h-40 overflow-auto">
              {Object.keys(localStorage).filter(k => k.startsWith('electrohub_snap_')).length === 0 ? (
                <div className="text-sm text-gray-400">Ninguno</div>
              ) : (
                Object.keys(localStorage).filter(k => k.startsWith('electrohub_snap_')).map(key => (
                  <div key={key} className="flex items-center justify-between py-1">
                    <div className="text-sm">{key.replace('electrohub_snap_','')}</div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => {
                        const raw = localStorage.getItem(key);
                        if (!raw) return alert('Snapshot no disponible');
                        const s = JSON.parse(raw);
                        if (s.params) {
                          setVLL(s.params.VLL ?? defaultVLL);
                          setReservePct(s.params.reservePct ?? defaultReservePct);
                          setZpctTrafo(s.params.ZpctTrafo ?? defaultZPercentTrafo);
                          setSccPCC(s.params.SccPCC ?? defaultSccPCC_kVA);
                          setV1(s.params.V1 ?? defaultV1_FaseN);
                        }
                        if (s.scenario) setScenario(s.scenario);
                        if (s.datasets?.loads) setLoads(s.datasets.loads);
                        if (s.datasets?.feeders) setFeeders(s.datasets.feeders);
                        if (s.datasets?.harm) setHarm(s.datasets.harm);
                        if (s.datasets?.wenner) setWenner(s.datasets.wenner);
                        if (s.datasets?.rodDesign) setRodDesign(s.datasets.rodDesign);
                        alert(`Cargado: ${key.replace('electrohub_snap_','')}`);
                      }}>Cargar</Button>
                      <Button variant="outline" onClick={() => {
                        localStorage.removeItem(key);
                        // Forzar re-render simple: actualizar estado dummy
                        setScenario(prev => prev);
                      }}>Borrar</Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Botones flotantes para subir y tema */}
      <div className="fixed bottom-4 right-4 flex gap-2">
        <Button 
          variant="outline" 
          onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}
        >
          ↑
        </Button>
        
        <Button
          variant={theme === 'dark' ? 'default' : 'outline'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </Button>
      </div>

      {/* Barra de búsqueda */}
      <div className="mb-4">
        <Input
          placeholder="Buscar..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-sm"
        />
      </div>
    </div>
  );
}

function Field({ label, value, onChange, editable = false, highlight = false }){
  return (
    <div className={`p-3 rounded-2xl ${highlight?"bg-emerald-50 border border-emerald-200":"bg-muted/20"}`}>
      <div className="text-xs text-gray-500">{label}</div>
      {editable ? (
        <Input className="mt-1 h-8" value={value} onChange={e=>onChange && onChange(e.target.value)} />
      ) : (
        <div className="mt-1 font-medium">{value}</div>
      )}
    </div>
  );
}

function ComplianceTile({ok,label,value}){
  return (
    <Card className={`shadow-sm ${ok?"bg-emerald-50 border-emerald-200":"bg-rose-50 border-rose-200"}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm">
          {ok? <CheckCircle2 className="h-4 w-4"/> : <XCircle className="h-4 w-4"/>}
          <span className="font-medium">{label}</span>
        </div>
        <div className="text-xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function AreaBadge({ text }){
  return <span className="px-2 py-0.5 text-[10px] rounded-full bg-slate-900 text-white">{text}</span>;
}

function SmallAreaTag({ children }){
  return <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 border">{children}</span>;
}

function SectionHeader({ title, area }){
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <AreaBadge text={area} />
    </div>
  );
}

// ===================== Self-tests (no UI) ===================== //
function runSelfTests(){
  const tests = [];
  tests.push({ name:"cosPhi clamp", pass: cosPhi(1.2)===1 && cosPhi(-0.1)===0 });
  const S_kVA = 1000; const VLL_test = 480; const Ifl = S_kVA*1000/(Math.sqrt(3)*VLL_test);
  tests.push({ name:"I_FL formula", pass: Math.abs(Ifl - 1202.81) < 0.5, detail:`I_FL=${Ifl.toFixed(2)}` });
  const rho=100, L1=2.4, L2=3.0, d=0.016;
  const R1=(rho/(2*Math.PI*L1))*(Math.log(8*L1/d)-1);
  const R2=(rho/(2*Math.PI*L2))*(Math.log(8*L2/d)-1);
  tests.push({ name:"Dwight R1 vs L", pass: R2 < R1 });
  const failed = tests.filter(t=>!t.pass);
  if(failed.length){ console.warn("Self-tests FAILED:", failed); } else { console.info("Self-tests passed (", tests.length, ")"); }
}

/**
 * Exportar filas a CSV
 * name: nombre base del archivo (sin extensión)
 * rows: array de objetos (las claves serán encabezados)
 */
function exportCSV(name, rows) {
  try {
    if (!rows || !rows.length) throw new Error('no rows');
    const header = Object.keys(rows[0] || {});
    const csv = [header.join(",")]
      .concat(
        rows.map(r =>
          header.map(h => {
            const v = (r[h] === undefined || r[h] === null) ? "" : String(r[h]);
            // escapar comillas dobles duplicándolas y envolver en comillas si hay comas/enter
            const needsQuote = /[",\r\n]/.test(v);
            const escaped = v.replace(/"/g, '""');
            return needsQuote ? `"${escaped}"` : escaped;
          }).join(",")
        )
      )
      .join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${name}.csv`; a.click();
    URL.revokeObjectURL(url);
  } catch {
    alert('No hay datos para exportar');
  }
}

/**
 * Importar CSV (coloca resultado en window.__EH__IMPORT_{kind})
 * e: evento de input file
 * kind: 'loads' | 'feeders'
 */
function csvImport(e, kind) {
  const file = e.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '');
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return;
    const header = lines.shift().split(',').map(s => s.trim());
    const rows = lines.map(l => {
      // split respetando comillas simples/dobles (simple parser)
      const cols = [];
      let cur = '', inQuotes = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (ch === '"' ) {
          if (inQuotes && l[i+1] === '"') { cur += '"'; i++; continue; }
          inQuotes = !inQuotes;
          continue;
        }
        if (ch === ',' && !inQuotes) { cols.push(cur); cur = ''; continue; }
        cur += ch;
      }
      cols.push(cur);
      const obj = {};
      header.forEach((h, i) => obj[h] = (cols[i] ?? '').trim());
      return obj;
    });
    if (kind === 'loads') {
      window.__EH__IMPORT_LOADS = rows;
    }
    if (kind === 'feeders') {
      window.__EH__IMPORT_FEEDERS = rows;
    }
    // señal simple para el UI: despachar evento personalizado
    window.dispatchEvent(new CustomEvent('eh:import-ready', { detail: { kind } }));
  };
  reader.readAsText(file);
}

/**
 * Función para abrir y generar el reporte en una nueva ventana
 */
function openReport() {
  // Genera el HTML (igual que antes)
  const now = new Date().toLocaleString();
  const style = `<style>
    body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto;line-height:1.4;padding:24px;color:#111}
    h1,h2{margin:0 0 8px}
    table{border-collapse:collapse;width:100%;margin:8px 0}
    th,td{border:1px solid #ddd;padding:6px;font-size:12px}
    small{color:#555}
    thead th{background:#f3f4f6}
  </style>`;

  // Usa las mismas variables defensivas del openReport original
  const fmt = (n, d = 2) => (Number.isFinite(Number(n)) ? Number(n).toFixed(d) : '');
   const D = typeof demanda !== 'undefined' ? demanda : { rows: [], sumkW: 0, sumkVA: 0, PF_total: 0 };
  const FC = Array.isArray(feedersCalc) ? feedersCalc : [];
  const H = typeof harmCalc !== 'undefined' ? harmCalc : { rows: [], THD_V: 0 };
  const W = typeof wennerCalc !== 'undefined' ? wennerCalc : { rows: [] };
  const T = typeof trafo !== 'undefined' ? trafo : { S_kVA: 0, Icc_origen: 0 };
  const R = typeof rodsCalc !== 'undefined' ? rodsCalc : { Rtot: 0 };

  const cargasRows = (D.rows || []).map(r =>
    `<tr><td>${r.name||''}</td><td style="text-align:right">${fmt(r.kW,2)}</td><td style="text-align:right">${fmt(r.kVA,2)}</td></tr>`
  ).join('');

  const feedersRows = FC.map(f =>
    `<tr>
      <td>${f.name||''}</td>
      <td>${f.area||''}</td>
      <td style="text-align:right">${fmt(f.I,0)}</td>
      <td style="text-align:right">${fmt(f.dV,2)}</td>
      <td style="text-align:center">${f.sugg?.size||''}</td>
      <td style="text-align:right">${typeof f.sugg?.dV === 'number' ? fmt(f.sugg.dV,2) : ''}</td>
      <td style="text-align:right">${fmt(f.Icc_end,0)}</td>
    </tr>`
  ).join('');

  const harmRows = (H.rows || []).map(r =>
    `<tr><td>${r.h||''}</td><td style="text-align:right">${fmt(r.Z,3)}</td><td style="text-align:right">${fmt(r.I,1)}</td><td style="text-align:right">${fmt(r.Vh,2)}</td></tr>`
  ).join('');

  const wenRows = (W.rows || []).map(r =>
    `<tr><td style="text-align:right">${r.a||''}</td><td style="text-align:right">${r.R||''}</td><td style="text-align:right">${fmt(r.rho,1)}</td></tr>`
  ).join('');

  const maxDV = FC.length ? Math.max(...FC.map(f => Number(f.dV || 0))) : 0;

  const html = `<!doctype html><html><head><meta charset='utf-8'><title>ElectroHub — Reporte Fase 1</title>${style}</head><body>
    <h1>ElectroHub — Reporte Fase 1</h1>
    <small>${now}</small>
    <h2>Resumen ejecutivo</h2>
    <p>
      Demanda: <b>${fmt(D.sumkW,1)} kW / ${fmt(D.sumkVA,1)} kVA</b>.
      PF=${fmt(D.PF_total,3)}.
      Trafo sugerido: <b>${fmt(T.S_kVA,0)} kVA</b>.
      Icc origen: <b>${fmt(T.Icc_origen,0)} A</b>.
      ΔV_max=${fmt(maxDV,2)}%.
      THD_V=${fmt(H.THD_V,2)}%.
      Rg≈${fmt(R.Rtot,2)} Ω.
    </p>

    <h2>Cargas</h2>
    <table><thead><tr><th>Grupo</th><th style="text-align:right">kW</th><th style="text-align:right">kVA</th></tr></thead><tbody>${cargasRows}</tbody></table>

    <h2>Alimentadores</h2>
    <table><thead><tr><th>Circuito</th><th>Área</th><th style="text-align:right">I [A]</th><th style="text-align:right">ΔV[%]</th><th>Calibre sug.</th><th style="text-align:right">ΔV sug.[%]</th><th style="text-align:right">Icc @ extremo [A]</th></tr></thead><tbody>${feedersRows}</tbody></table>

    <h2>Armónicos</h2>
    <table><thead><tr><th>h</th><th style="text-align:right">|Zth| [Ω]</th><th style="text-align:right">Ih [A]</th><th style="text-align:right">|Vh| [V]</th></tr></thead><tbody>${harmRows}</tbody></table>

    <h2>Tierras</h2>
    <table><thead><tr><th>a [m]</th><th>R [Ω]</th><th style="text-align:right">ρ [Ω·m]</th></tr></thead><tbody>${wenRows}</tbody></table>

    </body></html>`;

  // Crea contenedor oculto, añádelo al DOM
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '1000px'; // ancho de render (ajustable)
  container.innerHTML = html;
  document.body.appendChild(container);

  // Espera a que el layout se aplique antes de capturar
  setTimeout(async () => {
    try {
      const canvas = await html2canvas(container, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      // Dimensiones de la imagen en mm
      const imgProps = { width: canvas.width, height: canvas.height };
      const imgRatio = imgProps.width / imgProps.height;
      const imgHeightMm = pdfWidth / imgRatio;

      if (imgHeightMm <= pdfHeight) {
        // entra en una sola página
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeightMm);
      } else {
        // multipágina: dividir por altura de página
        let remainingHeight = canvas.height;
        const pageCanvasHeight = Math.floor(canvas.width * (pdfHeight / pdfWidth)); // px por página
        let y = 0;
        while (remainingHeight > 0) {
          const slice = document.createElement('canvas');
          slice.width = canvas.width;
          slice.height = Math.min(pageCanvasHeight, remainingHeight);
          const ctx = slice.getContext('2d');
          ctx.drawImage(canvas, 0, y, slice.width, slice.height, 0, 0, slice.width, slice.height);
          const sliceData = slice.toDataURL('image/png');
          const sliceHeightMm = (slice.height * pdfWidth) / slice.width;
          pdf.addImage(sliceData, 'PNG', 0, 0, pdfWidth, sliceHeightMm);
          remainingHeight -= slice.height;
          y += slice.height;
          if (remainingHeight > 0) pdf.addPage();
        }
      }

      pdf.save(`ElectroHub_Reporte_${Date.now()}.pdf`);
    } catch (err) {
      console.error("PDF export error:", err);
      alert("Error al generar PDF. Intenta actualizar la página o usa imprimir (Ctrl+P).");
    } finally {
      // limpiar
      document.body.removeChild(container);
    }
  }, 150);
}
