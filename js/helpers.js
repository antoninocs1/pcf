/* ========================================================
   PCF - helpers.js — Utilitários, formatação, CSV
   ======================================================== */
window.PCF = window.PCF || {};

PCF.Helpers = (() => {
  const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const DIAS_SEMANA = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];

  const FORMAS_PAGAMENTO = ['Dinheiro','PIX','Boleto','Cartão Débito','Cartão Crédito','Transferência/TED','Outros'];
  const TIPOS_DESPESA = ['Fixo','Variável'];

  const formatarMoeda = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatarData = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  const extrairInfoData = (iso) => {
    const d = new Date(iso + 'T12:00:00');
    return { dia: d.getDate(), mes: MESES[d.getMonth()], ano: d.getFullYear(), diaSemana: DIAS_SEMANA[d.getDay()] };
  };

  const hoje = () => new Date().toISOString().split('T')[0];
  const horaAtual = () => new Date().toTimeString().slice(0, 5);

  /* Hash simples para senha (NÃO é criptograficamente seguro - uso local apenas) */
  const hashSenha = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return 'h' + Math.abs(h).toString(36);
  };

  const formatarCPF = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0,3) + '.' + d.slice(3);
    if (d.length <= 9) return d.slice(0,3) + '.' + d.slice(3,6) + '.' + d.slice(6);
    return d.slice(0,3) + '.' + d.slice(3,6) + '.' + d.slice(6,9) + '-' + d.slice(9);
  };

  const formatarTelefone = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d.length ? '(' + d : '';
    if (d.length <= 7) return '(' + d.slice(0,2) + ') ' + d.slice(2);
    return '(' + d.slice(0,2) + ') ' + d.slice(2,7) + '-' + d.slice(7);
  };

  /* ---- Cálculos financeiros ---- */
  const calcularResumo = (transacoes, mes, ano) => {
    let f = transacoes;
    if (mes) f = f.filter(t => t.mes === mes);
    if (ano) f = f.filter(t => t.ano === Number(ano));
    const totalReceitas = f.filter(t => t.tipoOperacao === 'RECEITA').reduce((s, t) => s + t.valor, 0);
    const totalDespesas = f.filter(t => t.tipoOperacao === 'DESPESA').reduce((s, t) => s + t.valor, 0);
    const totalInvestimentos = f.filter(t => t.tipoOperacao === 'INVESTIMENTO').reduce((s, t) => s + t.valor, 0);
    return { totalReceitas, totalDespesas, saldo: totalReceitas - totalDespesas, totalInvestimentos };
  };

  const agruparPorCategoria = (transacoes, tipo) => {
    const f = tipo ? transacoes.filter(t => t.tipoOperacao === tipo) : transacoes;
    const g = {};
    f.forEach(t => { g[t.categoria] = (g[t.categoria] || 0) + t.valor; });
    return Object.entries(g).map(([c, v]) => ({ categoria: c, valor: v })).sort((a, b) => b.valor - a.valor);
  };

  const agruparPorMes = (transacoes) => {
    const g = {};
    transacoes.forEach(t => {
      const k = `${t.mes}/${t.ano}`;
      if (!g[k]) g[k] = { receitas: 0, despesas: 0, investimentos: 0 };
      if (t.tipoOperacao === 'RECEITA') g[k].receitas += t.valor;
      else if (t.tipoOperacao === 'DESPESA') g[k].despesas += t.valor;
      else g[k].investimentos += t.valor;
    });
    return Object.entries(g).map(([m, d]) => ({ mes: m, ...d }));
  };

  const calcularIMC = (peso, altura) => (altura > 0 && peso > 0) ? peso / (altura * altura) : 0;

  const IMC_CLASS = [
    { min: 0, max: 18.5, nome: 'Magreza', grau: 0 },
    { min: 18.5, max: 24.9, nome: 'Normal', grau: 0 },
    { min: 25, max: 29.9, nome: 'Sobrepeso', grau: 1 },
    { min: 30, max: 39.9, nome: 'Obesidade', grau: 2 },
    { min: 40, max: Infinity, nome: 'Obesidade Grave', grau: 3 },
  ];

  /* ---- CSV ---- */
  const _detectDelimiter = (headerLine) => {
    const semicolons = (headerLine.match(/;/g) || []).length;
    const commas = (headerLine.match(/,/g) || []).length;
    return semicolons >= commas ? ';' : ',';
  };

  const toCSV = (rows, headers, sep) => {
    const d = sep || ';';
    const escape = (v) => {
      const s = v == null ? '' : String(v);
      return s.includes(d) || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.join(d)];
    rows.forEach(r => lines.push(headers.map(h => escape(r[h])).join(d)));
    return lines.join('\r\n');
  };

  const _splitCSVLine = (line, d) => {
    const vals = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === d && !inQuotes) { vals.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    vals.push(current.trim());
    return vals;
  };

  const parseCSV = (text, fallbackHeaders) => {
    if (!text || !text.trim()) return [];

    // Detecta delimitador usando apenas a 1ª linha
    const firstNewline = text.indexOf('\n');
    const firstLine = firstNewline === -1 ? text : text.slice(0, firstNewline);
    const delim = _detectDelimiter(firstLine);

    // Parser RFC 4180: respeita campos multi-linha entre aspas (CR/LF dentro de "" fazem parte do campo)
    const records = [];
    let field = '';
    let fields = [];
    let inQuotes = false;
    let pos = 0;
    const len = text.length;

    while (pos < len) {
      const ch = text[pos];

      if (inQuotes) {
        if (ch === '"') {
          if (text[pos + 1] === '"') { // aspas escapadas ""
            field += '"';
            pos += 2;
          } else {
            inQuotes = false;
            pos++;
          }
        } else {
          field += ch; // CR/LF dentro de campo entre aspas: preserva como parte do valor
          pos++;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
          pos++;
        } else if (ch === delim) {
          fields.push(field.trim());
          field = '';
          pos++;
        } else if (ch === '\r' && text[pos + 1] === '\n') {
          fields.push(field.trim());
          field = '';
          if (fields.some(f => f !== '')) records.push(fields);
          fields = [];
          pos += 2;
        } else if (ch === '\n') {
          fields.push(field.trim());
          field = '';
          if (fields.some(f => f !== '')) records.push(fields);
          fields = [];
          pos++;
        } else {
          field += ch;
          pos++;
        }
      }
    }
    // último campo / linha sem newline final
    if (field !== '' || fields.length > 0) {
      fields.push(field.trim());
      if (fields.some(f => f !== '')) records.push(fields);
    }

    if (records.length === 0) return [];

    let headers, startIdx;
    if (fallbackHeaders) {
      // Verifica se a 1ª linha parece ser cabeçalho (contém pelo menos 2 nomes esperados)
      const matches = fallbackHeaders.filter(h => records[0].includes(h)).length;
      if (matches >= 2) {
        headers = records[0];
        startIdx = 1;
      } else {
        headers = fallbackHeaders;
        startIdx = 0;
      }
    } else {
      if (records.length < 2) return [];
      headers = records[0];
      startIdx = 1;
    }

    const rows = [];
    for (let i = startIdx; i < records.length; i++) {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = records[i][idx] || ''; });
      rows.push(obj);
    }
    return rows;
  };

  const downloadCSV = (content, filename) => {
    const bom = '\uFEFF';
    const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ---- Parsing brasileiro ---- */
  const parseValorBR = (str) => {
    if (!str) return 0;
    let s = String(str).replace(/^R\$\s*/i, '').trim();
    // Formato brasileiro: 1.234,56 → remove pontos de milhar, troca vírgula por ponto
    if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    }
    return parseFloat(s) || 0;
  };

  const parseDateBR = (str) => {
    if (!str) return '';
    const s = str.trim();
    // Se já está em ISO yyyy-mm-dd, retorna direto
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // dd/mm/yyyy → yyyy-mm-dd
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    return s;
  };

  const normalizarHora = (raw) => {
    const s = String(raw || '').trim().toLowerCase();
    const m = s.match(/^([01]?\d|2[0-3])(?:\s*(?::|h|\.)\s*([0-5]\d))?\s*([ap]\.?\s*m\.?|am|pm)?$/i);
    if (!m) return '';
    let hora = parseInt(m[1], 10);
    const minuto = m[2] || '00';
    const periodo = (m[3] || '').replace(/[\s.]/g, '').toLowerCase();
    if (periodo === 'pm' && hora < 12) hora += 12;
    if (periodo === 'am' && hora === 12) hora = 0;
    if (hora > 23) return '';
    return `${String(hora).padStart(2, '0')}:${minuto}`;
  };

  const extrairHorarios = (texto) => {
    const matches = String(texto || '').match(/\b(?:[01]?\d|2[0-3])(?:\s*(?::|h|\.)\s*[0-5]\d)?\s*(?:[ap]\.?\s*m\.?|am|pm)?\b/gi) || [];
    return [...new Set(matches.map(normalizarHora).filter(Boolean))].sort();
  };

  /* ---- Leitura de arquivo com fallback de encoding ---- */
  const readFileAutoEncoding = (file, callback) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      if (text.includes('\uFFFD')) {
        const reader2 = new FileReader();
        reader2.onload = (e2) => callback(e2.target.result);
        reader2.readAsText(file, 'windows-1252');
      } else {
        callback(text);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  /* ---- Redimensionamento de colunas ---- */
  const makeTableResizable = (table) => {
    if (table.dataset.resizable === '1') return;
    table.dataset.resizable = '1';
    const ths = Array.from(table.querySelectorAll('thead th'));
    if (ths.length === 0) return;
    ths.forEach((th, i) => {
      if (i === ths.length - 1) return; // sem handle na última coluna
      const handle = document.createElement('div');
      handle.className = 'col-resize-handle';
      th.appendChild(handle);
      let startX, startW;
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Congela larguras para table-layout:fixed funcionar
        if (table.style.tableLayout !== 'fixed') {
          ths.forEach(t => { t.style.width = t.offsetWidth + 'px'; });
          table.style.tableLayout = 'fixed';
          table.style.width = table.offsetWidth + 'px';
        }
        startX = e.clientX;
        startW = th.offsetWidth;
        document.body.classList.add('col-resizing');
        const onMove = (ev) => {
          const newW = Math.max(40, startW + (ev.clientX - startX));
          th.style.width = newW + 'px';
        };
        const onUp = () => {
          document.body.classList.remove('col-resizing');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  };

  const initResizableTables = (container) => {
    (container || document).querySelectorAll('.table').forEach(makeTableResizable);
  };

  /* ---- Escape HTML ---- */
  const esc = (s) => {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  };

  return {
    MESES, DIAS_SEMANA, FORMAS_PAGAMENTO, TIPOS_DESPESA,
    formatarMoeda, formatarData, extrairInfoData, hoje, horaAtual,
    hashSenha, formatarCPF, formatarTelefone,
    calcularResumo, agruparPorCategoria, agruparPorMes, calcularIMC, IMC_CLASS,
    toCSV, parseCSV, downloadCSV, parseValorBR, parseDateBR, normalizarHora, extrairHorarios, readFileAutoEncoding, esc,
    makeTableResizable, initResizableTables,
  };
})();
