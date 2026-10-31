/* ========================================================
   PCF - helpers.js — Utilitários, formatação, CSV
   ======================================================== */
window.PCF = window.PCF || {};

PCF.Helpers = (() => {
  const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const DIAS_SEMANA = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];

  const PGTO_CARTAO_COMPRA = 'Cartão de Crédito (Compra)';
  const PGTO_CARTAO_PAGAMENTO = 'Cartão de Crédito (Pagamento)';
  const CAT_PAGAMENTO_FATURA = 'Pagamento de Fatura de Cartão';
  const FORMAS_PAGAMENTO = ['Dinheiro','PIX','Boleto','Cartão Débito',PGTO_CARTAO_COMPRA,PGTO_CARTAO_PAGAMENTO,'Transferência/TED','Outros'];
  const ICONES_PAGAMENTO = {
    'Dinheiro': 'Img/icons/pgto-dinheiro.svg',
    'PIX': 'Img/icons/pgto-pix.svg',
    'Boleto': 'Img/icons/pgto-boleto.svg',
    'Cartão Débito': 'Img/icons/pgto-cartao-debito.svg',
    [PGTO_CARTAO_COMPRA]: 'Img/icons/cartao-compra.png',
    [PGTO_CARTAO_PAGAMENTO]: 'Img/icons/cartao-pagamento.png',
    'Transferência/TED': 'Img/icons/pgto-transferencia.svg',
    'Outros': 'Img/icons/pgto-outros.svg',
  };
  /* Máscara do ícone no style do próprio elemento: url() dentro de variável CSS
     seria resolvida relativa a css/styles.css, e o ícone não carregaria. */
  const estiloIconePgto = (forma) => {
    const path = ICONES_PAGAMENTO[forma];
    if (!path) return '';
    const url = new URL(path, document.baseURI).href;
    return `-webkit-mask-image:url('${url}');mask-image:url('${url}')`;
  };
  const TIPOS_DESPESA = ['Fixo','Variável'];

  /* O pagamento da fatura apenas quita compras já lançadas como despesa
     (Cartão de Crédito (Compra)); somá-lo de novo contaria o mesmo gasto duas vezes. */
  const ehPagamentoFatura = (t) => t?.tipoOperacao === 'DESPESA' && t?.categoria === CAT_PAGAMENTO_FATURA;
  const semPagamentoFatura = (transacoes) => (transacoes || []).filter(t => !ehPagamentoFatura(t));

  /* Sufixo de parcelamento no Item/Descrição: "À vista" ou "Parcela 1/X" */
  const SUFIXO_PARCELA_RE = /\s*(?:-\s*)?(?:À vista|Parcela \d+\/\d+)\s*$/i;
  const aplicarSufixoParcela = (item, parcelas) => {
    const base = String(item || '').replace(SUFIXO_PARCELA_RE, '').trim();
    if (parcelas === null) return base;
    const sufixo = parcelas > 1 ? `Parcela 1/${parcelas}` : 'À vista';
    return base ? `${base} - ${sufixo}` : sufixo;
  };

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

  // Datas sempre no fuso local do aparelho (toISOString usa UTC e vira o dia às 21h no Brasil)
  const dataISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hoje = () => dataISO();
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

  /* ---- Medicamentos: frequência e doses ---- */
  const FREQUENCIAS_MEDICAMENTO = ['Uso contínuo', 'Diário', 'A cada 4 horas', 'A cada 6 horas', 'A cada 8 horas', 'A cada 12 horas', 'Semanal', 'Conforme necessidade', 'Outro'];
  const normalizarFrequencia = (f) => ({ 'Uso continuo': 'Uso contínuo', 'Diario': 'Diário' }[f] || f || FREQUENCIAS_MEDICAMENTO[0]);
  const intervaloFrequencia = (f) => {
    const m = String(f || '').match(/^A cada (\d+) horas$/);
    return m ? parseInt(m[1], 10) : null;
  };
  // A partir do horário inicial, define os demais horários do dia conforme o intervalo
  const gerarHorariosDose = (inicial, frequencia) => {
    const base = normalizarHora(inicial);
    if (!base) return [];
    const intervalo = intervaloFrequencia(frequencia);
    if (!intervalo) return [base];
    const [h, m] = base.split(':');
    return Array.from({ length: Math.floor(24 / intervalo) }, (_, i) =>
      `${String((parseInt(h, 10) + i * intervalo) % 24).padStart(2, '0')}:${m}`);
  };
  const horariosMedicamento = (med) => {
    if (Array.isArray(med.horariosParsed) && med.horariosParsed.length) {
      return [...new Set(med.horariosParsed.map(normalizarHora).filter(Boolean))].sort();
    }
    return extrairHorarios(med.horarios);
  };
  const diaSemanaMedicamento = (med) => {
    if (med.diaSemana !== undefined && med.diaSemana !== null && med.diaSemana !== '') return Number(med.diaSemana);
    return med.dataInicio ? new Date(`${med.dataInicio}T12:00:00`).getDay() : null;
  };
  // Horários previstos do medicamento em uma data (não considera o status)
  const dosesDoDia = (med, data) => {
    if (!med.dataInicio || data < med.dataInicio) return [];
    if (med.dataFim && data > med.dataFim) return [];
    const frequencia = normalizarFrequencia(med.frequencia);
    if (frequencia === 'Conforme necessidade') return [];
    if (frequencia === 'Semanal' && new Date(`${data}T12:00:00`).getDay() !== diaSemanaMedicamento(med)) return [];
    let horarios = horariosMedicamento(med);
    if (data === med.dataInicio && med.horarioInicial) horarios = horarios.filter(h => h >= med.horarioInicial);
    if (med.criadoEm) {
      const criado = new Date(med.criadoEm);
      if (dataISO(criado) === data) horarios = horarios.filter(h => h >= criado.toTimeString().slice(0, 5));
    }
    return horarios;
  };
  // Dias de estoque restantes; null quando o estoque não é controlado ou não há previsão de consumo
  const diasEstoqueMedicamento = (med) => {
    if (typeof med.estoqueQtd !== 'number') return null;
    const frequencia = normalizarFrequencia(med.frequencia);
    if (frequencia === 'Conforme necessidade') return null;
    const dosesPorDia = horariosMedicamento(med).length / (frequencia === 'Semanal' ? 7 : 1);
    const qtd = Number(med.qtdPorDose) > 0 ? Number(med.qtdPorDose) : 1;
    return dosesPorDia > 0 ? Math.floor(med.estoqueQtd / (qtd * dosesPorDia)) : null;
  };

  // Adesão no período: doses tomadas ÷ doses previstas até agora; null quando não havia dose prevista
  const adesaoPeriodo = (medicamentos, doses, de, ate) => {
    const hojeISO = hoje();
    const agoraHora = horaAtual();
    let previstas = 0;
    let tomadas = 0;
    medicamentos.filter(m => m.status === 'Em uso').forEach(med => {
      const dosesMed = doses.filter(d => d.medId === med.id);
      // Medicamentos anteriores ao registro de doses só contam a partir da primeira dose registrada
      const desde = med.criadoEm ? dataISO(new Date(med.criadoEm)) : (dosesMed.map(d => d.data).sort()[0] || hojeISO);
      const d = new Date(`${de}T12:00:00`);
      for (let data = de; data <= ate; d.setDate(d.getDate() + 1), data = dataISO(d)) {
        if (data < desde) continue;
        dosesDoDia(med, data).forEach(hora => {
          if (data > hojeISO || (data === hojeISO && hora > agoraHora)) return;
          previstas += 1;
          if (dosesMed.some(r => r.data === data && r.hora === hora && r.status === 'tomado')) tomadas += 1;
        });
      }
    });
    return previstas ? Math.round((tomadas / previstas) * 100) : null;
  };

  /* ---- Hábitos: regras usadas na tela de hábitos e no painel Hoje ---- */
  const tipoHabito = (habito) =>
    habito.tipoExecucao || (/água|agua/i.test(habito.nome || '') ? 'ocorrencias' : 'duracao');
  const metaOcorrencias = (habito) =>
    Math.max(1, parseInt(habito.metaDiaria, 10) || (/água|agua/i.test(habito.nome || '') ? 8 : 1));
  const alternarHabito = (habitoId, data) => {
    const S = PCF.Store;
    const reg = S.getRegistrosHabitos().find(r => r.habitoId === habitoId && r.data === data);
    const execucao = reg?.execucao?.status === 'executando'
      ? { ...reg.execucao, status: 'cancelado', canceladoEm: Date.now() }
      : reg?.execucao;
    S.upsertRegistroHabito({
      habitoId, data, completo: !reg?.completo,
      intensidade: reg && 'intensidade' in reg ? reg.intensidade : 100,
      modoRegistro: 'manual',
      ...(execucao ? { execucao } : {}),
    });
  };
  const registrarOcorrenciaHabito = (habitoId, data, resultado) => {
    const S = PCF.Store;
    const habito = S.getHabitos().find(h => h.id === habitoId);
    if (!habito) return;
    const reg = S.getRegistrosHabitos().find(r => r.habitoId === habitoId && r.data === data);
    const ocorrencias = [...(reg?.ocorrencias || []), { id: S._uid(), resultado, registradoEm: new Date().toISOString() }];
    const ok = ocorrencias.filter(o => o.resultado === 'ok').length;
    const meta = metaOcorrencias(habito);
    S.upsertRegistroHabito({
      habitoId, data, ocorrencias,
      completo: ok >= meta,
      momento: reg?.momento || 'ao_longo_dia',
      intensidade: Math.min(100, Math.round((ok / meta) * 100)),
      modoRegistro: 'execucao',
    });
  };

  /* ---- Formulário recolhido: mostra primeiro os dados e abre com um botão ---- */
  let _abrirProximoFormulario = false;
  const pedirAbrirFormulario = () => { _abrirProximoFormulario = true; };
  const formRecolhivel = (card, rotulo, aberto = false) => {
    const barra = document.createElement('div');
    barra.className = 'form-recolhivel-barra';
    barra.innerHTML = `<button type="button" class="btn btn-primary"><i data-lucide="plus"></i> ${esc(rotulo)}</button>`;
    card.before(barra);
    if (window.lucide) lucide.createIcons();
    const abrir = (rolar = true) => {
      card.hidden = false;
      barra.hidden = true;
      if (rolar) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const fechar = () => { card.hidden = true; barra.hidden = false; };
    barra.firstElementChild.onclick = () => abrir();
    if (aberto || _abrirProximoFormulario) abrir(false); else fechar();
    _abrirProximoFormulario = false;
    return { abrir, fechar };
  };

  /* ---- Como você está se sentindo: humores do Diário ↔ Emoções ---- */
  const HUMORES = [
    { id: 'feliz', icon: '😊', label: 'Feliz' },
    { id: 'triste', icon: '😢', label: 'Triste' },
    { id: 'estressado', icon: '😓', label: 'Estressado' },
    { id: 'calmo', icon: '😌', label: 'Calmo' },
    { id: 'animado', icon: '🤩', label: 'Animado' },
    { id: 'irritado', icon: '😠', label: 'Irritado' },
    { id: 'grato', icon: '🙏', label: 'Grato' },
    { id: 'ansioso', icon: '😰', label: 'Ansioso' },
    { id: 'surpreso', icon: '😲', label: 'Surpreso' },
    { id: 'amoroso', icon: '🥰', label: 'Amoroso' },
  ];
  const HUMORES_SONHO = [
    { id: 'assustado', icon: '😱', label: 'Assustado (com medo)' },
    { id: 'confuso', icon: '😕', label: 'Confuso' },
    { id: 'neutro', icon: '😐', label: 'Neutro' },
    { id: 'agitado', icon: '😵‍💫', label: 'Agitado' },
  ];
  // Humores unificados por redundância; mantém registros antigos legíveis
  const HUMOR_ALIASES = { com_medo: 'assustado', tranquilo: 'calmo' };
  const getHumor = (id) => [...HUMORES, ...HUMORES_SONHO].find(h => h.id === (HUMOR_ALIASES[id] || id));

  // Caminho na Configuração de emoções: [principal, nível médio, nível inferior]
  const HUMOR_EMOCAO = {
    feliz: ['Feliz'],
    triste: ['Triste'],
    irritado: ['Irritado'],
    surpreso: ['Surpreso'],
    amoroso: ['Amoroso'],
    animado: ['Feliz', 'Animado'],
    grato: ['Feliz', 'Otimista', 'Agradecido'],
    estressado: ['Mal', 'Estressado'],
    ansioso: ['Temeroso', 'Ansioso'],
    calmo: ['Amoroso', 'Pacífico'],
    assustado: ['Temeroso', 'Assustado'],
    confuso: ['Surpreso', 'Confuso'],
  };
  const HUMOR_PADRAO_POR_PRINCIPAL = { mal: 'estressado', temeroso: 'ansioso' };
  const EMOCOES_POSITIVAS = new Set(['feliz', 'surpreso', 'amoroso']);
  // Compara pela primeira palavra: "Triste (Tristeza)" e "Triste" são a mesma emoção
  const chaveEmocao = (nome) => String(nome || '').trim().split(/[\s(]/)[0]
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const emocaoDeHumor = (humorId, config) => {
    const caminho = HUMOR_EMOCAO[HUMOR_ALIASES[humorId] || humorId];
    if (!caminho) return null;
    const achar = (lista, nome) => nome ? (lista || []).find(i => chaveEmocao(i.nome) === chaveEmocao(nome)) : null;
    const superior = achar(config, caminho[0]);
    if (!superior) return null;
    const media = achar(superior.medias, caminho[1]);
    const inferior = media ? achar(media.inferiores, caminho[2]) : null;
    return { superior: superior.nome, media: media?.nome || '', inferior: inferior?.nome || '' };
  };
  const humorDeEmocao = ({ superior, media, inferior }) => {
    const chaves = [superior, media, inferior].map(chaveEmocao);
    const candidatos = HUMORES.filter(h => {
      const caminho = HUMOR_EMOCAO[h.id];
      return caminho && caminho.every((nome, i) => chaveEmocao(nome) === chaves[i]);
    }).sort((a, b) => HUMOR_EMOCAO[b.id].length - HUMOR_EMOCAO[a.id].length);
    return candidatos[0]?.id || HUMOR_PADRAO_POR_PRINCIPAL[chaves[0]] || null;
  };

  const emocaoPositiva = (nome) => EMOCOES_POSITIVAS.has(chaveEmocao(nome));

  // Grava só o humor do dia no Diário, preservando o texto já escrito
  const salvarHumorDiario = (data, humor) => {
    const S = PCF.Store;
    const eDoDia = (e) => e.data === data && (e.tipo || 'diario') === 'diario';
    const todas = S.getDiario();
    const atual = todas.find(eDoDia);
    const novo = { ...(atual || { data, texto: '' }) };
    if (humor) novo.humor = humor; else delete novo.humor;
    const resto = todas.filter(e => !eDoDia(e));
    S.saveDiario((novo.humor || (novo.texto || '').trim()) ? [...resto, novo] : resto);
    compartilharSentimento(data, null);
  };

  // Escolha ainda não salva: vale em memória até salvar em uma das telas
  let _sentimentoPendente = null;
  const compartilharSentimento = (data, escolha) => {
    _sentimentoPendente = escolha ? { uid: PCF.Store.currentUserId(), data, ...escolha } : null;
  };
  const _pendenteDa = (data) =>
    (_sentimentoPendente && _sentimentoPendente.data === data && _sentimentoPendente.uid === PCF.Store.currentUserId())
      ? _sentimentoPendente : null;
  const sentimentoParaDiario = (data) => {
    const pendente = _pendenteDa(data);
    if (pendente) return pendente.humor || humorDeEmocao(pendente.emocao);
    const ultima = PCF.Store.getEmocoes().filter(e => e.data === data)
      .sort((a, b) => (a.hora || '').localeCompare(b.hora || '')).pop();
    return ultima ? humorDeEmocao({ superior: ultima.emocaoSuperior, media: ultima.emocaoMedia, inferior: ultima.emocaoInferior }) : null;
  };
  const sentimentoParaEmocao = (data, config) => {
    const pendente = _pendenteDa(data);
    if (pendente?.emocao) return { ...pendente.emocao, origem: 'emocoes' };
    const humor = pendente?.humor || PCF.Store.getDiario().find(e => e.data === data && (e.tipo || 'diario') === 'diario')?.humor;
    const emocao = humor ? emocaoDeHumor(humor, config) : null;
    return emocao ? { ...emocao, origem: 'diario' } : null;
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
    MESES, DIAS_SEMANA, FORMAS_PAGAMENTO, TIPOS_DESPESA, ICONES_PAGAMENTO,
    PGTO_CARTAO_COMPRA, PGTO_CARTAO_PAGAMENTO, CAT_PAGAMENTO_FATURA,
    ehPagamentoFatura, semPagamentoFatura, aplicarSufixoParcela, estiloIconePgto,
    formatarMoeda, formatarData, extrairInfoData, dataISO, hoje, horaAtual,
    FREQUENCIAS_MEDICAMENTO, normalizarFrequencia, gerarHorariosDose, horariosMedicamento, diaSemanaMedicamento, dosesDoDia, diasEstoqueMedicamento,
    HUMORES, HUMORES_SONHO, getHumor, humorDeEmocao, emocaoDeHumor, emocaoPositiva, salvarHumorDiario, compartilharSentimento, sentimentoParaDiario, sentimentoParaEmocao,
    adesaoPeriodo, tipoHabito, metaOcorrencias, alternarHabito, registrarOcorrenciaHabito, formRecolhivel, pedirAbrirFormulario,
    hashSenha, formatarCPF, formatarTelefone,
    calcularResumo, agruparPorCategoria, agruparPorMes, calcularIMC, IMC_CLASS,
    toCSV, parseCSV, downloadCSV, parseValorBR, parseDateBR, normalizarHora, extrairHorarios, readFileAutoEncoding, esc,
    makeTableResizable, initResizableTables,
  };
})();
