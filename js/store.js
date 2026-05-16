/* ========================================================
   PCF - Personal Financial Control
   store.js — Camada de persistência (localStorage) multi-usuário
   ======================================================== */
window.PCF = window.PCF || {};

PCF.Store = (() => {
  /* ---------- helpers internos ---------- */
  const _memory = {};
  const _storageAvailable = (() => {
    try {
      const testKey = '__pcf_storage_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  })();

  const _get = (key) => {
    if (_storageAvailable) {
      try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    }
    try { return JSON.parse(_memory[key]); } catch { return null; }
  };

  const _set = (key, val) => {
    const payload = JSON.stringify(val);
    if (_storageAvailable) {
      try { localStorage.setItem(key, payload); return true; } catch { }
    }
    _memory[key] = payload;
    return false;
  };

  const _del = (key) => {
    if (_storageAvailable) {
      try { localStorage.removeItem(key); return true; } catch { }
    }
    delete _memory[key];
    return false;
  };

  const _uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* ---------- USERS ---------- */
  const getUsers = () => _get('pcf_users') || [];
  const saveUsers = (u) => _set('pcf_users', u);
  const getUserById = (id) => getUsers().find(u => u.id === id);
  const getUserByLogin = (login) => getUsers().find(u => u.login === login);

  const createUser = (data) => {
    const users = getUsers();
    if (users.some(u => u.login === data.login)) return { ok: false, msg: 'Login já existe' };
    if (users.some(u => u.cpf === data.cpf)) return { ok: false, msg: 'CPF já cadastrado' };
    const user = { id: _uid(), dataCadastro: new Date().toISOString().split('T')[0], ...data };
    users.push(user);
    saveUsers(users);
    _seedDefaults(user.id);
    return { ok: true, user };
  };

  const updateUser = (id, data) => {
    const users = getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return { ok: false, msg: 'Usuário não encontrado' };
    if (data.login && data.login !== users[idx].login && users.some(u => u.login === data.login)) return { ok: false, msg: 'Login já existe' };
    users[idx] = { ...users[idx], ...data };
    saveUsers(users);
    return { ok: true };
  };

  const deleteUser = (id) => {
    const users = getUsers().filter(u => u.id !== id);
    saveUsers(users);
    // limpa dados do usuário
    ['transacoes', 'categorias', 'emocoes', 'emocoes_config', 'imc', 'agenda', 'habitos', 'reg_habitos', 'frases'].forEach(k => _del(`pcf_${k}_${id}`));
  };

  /* ---------- SESSÃO ----------
     Usa sessionStorage para que a sessão expire ao fechar a aba/navegador,
     garantindo que o acesso sempre exija usuário e senha em nova abertura.
  ------------------------------------------ */
  const getSession = () => {
    try { return JSON.parse(sessionStorage.getItem('pcf_session')); } catch { return null; }
  };
  const setSession = (userId, login) => {
    try { localStorage.removeItem('pcf_session'); } catch {} // limpa sessão antiga do localStorage
    try { sessionStorage.setItem('pcf_session', JSON.stringify({ userId, login })); } catch {}
  };
  const clearSession = () => {
    try { sessionStorage.removeItem('pcf_session'); } catch {}
    try { localStorage.removeItem('pcf_session'); } catch {}
  };
  const currentUserId = () => { const s = getSession(); return s ? s.userId : null; };

  /* ---------- TRANSAÇÕES ---------- */
  const _tkU = () => `pcf_transacoes_${currentUserId()}`;
  const getTransacoes = () => _get(_tkU()) || [];
  const saveTransacoes = (t) => _set(_tkU(), t);
  const addTransacao = (t) => { const all = getTransacoes(); all.push({ id: _uid(), ...t }); saveTransacoes(all); return all; };
  const updateTransacao = (id, data) => { const all = getTransacoes(); const i = all.findIndex(t => t.id === id); if (i >= 0) { all[i] = { ...all[i], ...data }; saveTransacoes(all); } return all; };
  const deleteTransacao = (id) => { const all = getTransacoes().filter(t => t.id !== id); saveTransacoes(all); return all; };

  /* ---------- CATEGORIAS ---------- */
  const _ckU = () => `pcf_categorias_${currentUserId()}`;
  const getCategorias = () => _get(_ckU()) || [];
  const saveCategorias = (c) => _set(_ckU(), c);
  const addCategoria = (c) => { const all = getCategorias(); all.push({ id: _uid(), ...c }); saveCategorias(all); return all; };
  const updateCategoria = (id, data) => { const all = getCategorias(); const i = all.findIndex(c => c.id === id); if (i >= 0) { all[i] = { ...all[i], ...data }; saveCategorias(all); } return all; };
  const deleteCategoria = (id) => { const all = getCategorias().filter(c => c.id !== id); saveCategorias(all); return all; };

  /* ---------- EMOÇÕES REGISTRO ---------- */
  const _ekU = () => `pcf_emocoes_${currentUserId()}`;
  const getEmocoes = () => _get(_ekU()) || [];
  const saveEmocoes = (e) => _set(_ekU(), e);
  const addEmocao = (e) => { const all = getEmocoes(); all.push({ id: _uid(), ...e }); saveEmocoes(all); return all; };
  const updateEmocao = (id, data) => { const all = getEmocoes(); const i = all.findIndex(e => e.id === id); if (i >= 0) { all[i] = { ...all[i], ...data }; saveEmocoes(all); } return all; };
  const deleteEmocao = (id) => { const all = getEmocoes().filter(e => e.id !== id); saveEmocoes(all); return all; };

  /* ---------- EMOÇÕES CONFIG ---------- */
  const _ecU = () => `pcf_emocoes_config_${currentUserId()}`;
  const getEmocoesConfig = () => _get(_ecU()) || [];
  const saveEmocoesConfig = (c) => _set(_ecU(), c);

  /* ---------- IMC ---------- */
  const _imcU = () => `pcf_imc_${currentUserId()}`;
  const getIMC = () => _get(_imcU()) || { peso: 0, altura: 0 };
  const saveIMC = (d) => _set(_imcU(), d);

  /* ---------- AGENDA / COMPROMISSOS ---------- */
  const _agU = () => `pcf_agenda_${currentUserId()}`;
  const getCompromissos = () => _get(_agU()) || [];
  const saveCompromissos = (c) => _set(_agU(), c);
  const addCompromisso = (c) => { const all = getCompromissos(); all.push({ id: _uid(), ...c }); saveCompromissos(all); return all; };
  const updateCompromisso = (id, data) => { const all = getCompromissos(); const i = all.findIndex(c => c.id === id); if (i >= 0) { all[i] = { ...all[i], ...data }; saveCompromissos(all); } return all; };
  const deleteCompromisso = (id) => { const all = getCompromissos().filter(c => c.id !== id); saveCompromissos(all); return all; };

  /* ---------- SEED DEFAULTS ---------- */
  const _seedDefaults = (userId) => {
    // Categorias padrão
    const cats = [
      { id: _uid(), tipoOperacao: 'RECEITA', categoria: 'Salário Líquido', subcategorias: [] },
      { id: _uid(), tipoOperacao: 'RECEITA', categoria: '13º Salário', subcategorias: [] },
      { id: _uid(), tipoOperacao: 'RECEITA', categoria: 'Férias 1/3', subcategorias: [] },
      { id: _uid(), tipoOperacao: 'RECEITA', categoria: 'Placar', subcategorias: [] },
      { id: _uid(), tipoOperacao: 'RECEITA', categoria: 'IR (Restituição)', subcategorias: [] },
      { id: _uid(), tipoOperacao: 'RECEITA', categoria: 'Renda Extra', subcategorias: [] },
      { id: _uid(), tipoOperacao: 'RECEITA', categoria: 'Saldo mês anterior', subcategorias: [] },
      { id: _uid(), tipoOperacao: 'RECEITA', categoria: 'Outros', subcategorias: [] },
      { id: _uid(), tipoOperacao: 'INVESTIMENTO', categoria: 'Investimentos', subcategorias: ['Aposentadoria / Previdência Oficial (INSS)', 'Previdência Privada', 'Aplicação em fundos / CDB', 'Poupança', 'Outros'] },
      { id: _uid(), tipoOperacao: 'INVESTIMENTO', categoria: 'Sonhos', subcategorias: ['Colchão Financeiro', 'Outros'] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Habitação', subcategorias: ['Aluguel', 'Condomínio', 'IPTU', 'Energia / Luz', 'Água', 'Internet', 'Telefone / Celular', 'Gás', 'Materiais de Construção', 'Seguro do imóvel', 'Assinatura', 'Outros'] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Mercado / Alimentação', subcategorias: ['Mercado / Feira', 'Padaria', 'Restaurante', 'Outros'] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Saúde', subcategorias: ['Médico / Dentista / Laboratório', 'Plano de Saúde', 'Plano Odontológico', 'Medicamentos (farmácia, remédios)', 'Terapia', 'Outros'] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Transporte', subcategorias: ['Seguro de carro', 'Combustível', 'Lavagem', 'IPVA', 'Mecânico', 'Estacionamento / pedágio', 'Transporte (ônibus, metrô, taxi, UBER)', 'Passagem de Avião', 'Outros'] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Educação', subcategorias: ['Escola', 'Cursos', 'Faculdade', 'Seminário', 'Livro', 'Outros'] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Despesas Pessoais', subcategorias: ['Higiene Pessoal', 'Barbeiro, cabeleireiro, manicure', 'Vestuário', 'Academia', 'Seguro de Vida', 'Lazer', 'Diversos'] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Doação', subcategorias: ['Instituição Religiosa', 'Outros'] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Merecimento', subcategorias: ['Dinheiro', 'Diversos'] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Financiamento / Empréstimo', subcategorias: ['Financiamento', 'Empréstimo', 'Consórcio', 'IR (Pagamento - DARF)', 'Outros'] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Compras Evitadas', subcategorias: ['Bolão', 'Diversos'] },
    ];
    _set(`pcf_categorias_${userId}`, cats);

    // Emoções config padrão
    const emoConfig = [
      { id: _uid(), nome: 'Feliz', cor: '#16a34a', icon: '😊', medias: [
        { id: _uid(), nome: 'Brincalhão', cor: '#22c55e', inferiores: [{ id: _uid(), nome: 'Excitado', cor: '#4ade80' }, { id: _uid(), nome: 'Atrevido', cor: '#86efac' }] },
        { id: _uid(), nome: 'Contente', cor: '#22c55e', inferiores: [{ id: _uid(), nome: 'Livre', cor: '#4ade80' }, { id: _uid(), nome: 'Alegre', cor: '#86efac' }] },
        { id: _uid(), nome: 'Interessado', cor: '#22c55e', inferiores: [{ id: _uid(), nome: 'Curioso', cor: '#4ade80' }, { id: _uid(), nome: 'Inquisitivo', cor: '#86efac' }] },
        { id: _uid(), nome: 'Orgulhoso', cor: '#22c55e', inferiores: [{ id: _uid(), nome: 'Bem-sucedido', cor: '#4ade80' }, { id: _uid(), nome: 'Confiante', cor: '#86efac' }] },
        { id: _uid(), nome: 'Aceito', cor: '#22c55e', inferiores: [{ id: _uid(), nome: 'Respeitado', cor: '#4ade80' }, { id: _uid(), nome: 'Valorizado', cor: '#86efac' }] },
      ]},
      { id: _uid(), nome: 'Surpreso', cor: '#f59e0b', icon: '😲', medias: [
        { id: _uid(), nome: 'Assustado', cor: '#fbbf24', inferiores: [{ id: _uid(), nome: 'Chocado', cor: '#fcd34d' }, { id: _uid(), nome: 'Desanimado', cor: '#fde68a' }] },
        { id: _uid(), nome: 'Confuso', cor: '#fbbf24', inferiores: [{ id: _uid(), nome: 'Desiludido', cor: '#fcd34d' }, { id: _uid(), nome: 'Perplexo', cor: '#fde68a' }] },
        { id: _uid(), nome: 'Maravilhado', cor: '#fbbf24', inferiores: [{ id: _uid(), nome: 'Atônito', cor: '#fcd34d' }, { id: _uid(), nome: 'Admirado', cor: '#fde68a' }] },
        { id: _uid(), nome: 'Animado', cor: '#fbbf24', inferiores: [{ id: _uid(), nome: 'Entusiasmado', cor: '#fcd34d' }, { id: _uid(), nome: 'Energético', cor: '#fde68a' }] },
      ]},
      { id: _uid(), nome: 'Mal', cor: '#6b7280', icon: '😰', medias: [
        { id: _uid(), nome: 'Entediado', cor: '#9ca3af', inferiores: [{ id: _uid(), nome: 'Indiferente', cor: '#d1d5db' }, { id: _uid(), nome: 'Apático', cor: '#e5e7eb' }] },
        { id: _uid(), nome: 'Ocupado', cor: '#9ca3af', inferiores: [{ id: _uid(), nome: 'Pressionado', cor: '#d1d5db' }, { id: _uid(), nome: 'Apressado', cor: '#e5e7eb' }] },
        { id: _uid(), nome: 'Estressado', cor: '#9ca3af', inferiores: [{ id: _uid(), nome: 'Sobrecarregado', cor: '#d1d5db' }, { id: _uid(), nome: 'Fora de Controle', cor: '#e5e7eb' }] },
        { id: _uid(), nome: 'Cansado', cor: '#9ca3af', inferiores: [{ id: _uid(), nome: 'Com sono', cor: '#d1d5db' }, { id: _uid(), nome: 'Desconcentrado', cor: '#e5e7eb' }] },
      ]},
      { id: _uid(), nome: 'Triste', cor: '#3b82f6', icon: '😢', medias: [
        { id: _uid(), nome: 'Solitário', cor: '#60a5fa', inferiores: [{ id: _uid(), nome: 'Isolado', cor: '#93c5fd' }, { id: _uid(), nome: 'Abandonado', cor: '#bfdbfe' }] },
        { id: _uid(), nome: 'Vulnerável', cor: '#60a5fa', inferiores: [{ id: _uid(), nome: 'Frágil', cor: '#93c5fd' }, { id: _uid(), nome: 'Vitimizado', cor: '#bfdbfe' }] },
        { id: _uid(), nome: 'Culpado', cor: '#60a5fa', inferiores: [{ id: _uid(), nome: 'Arrependido', cor: '#93c5fd' }, { id: _uid(), nome: 'Envergonhado', cor: '#bfdbfe' }] },
        { id: _uid(), nome: 'Deprimido', cor: '#60a5fa', inferiores: [{ id: _uid(), nome: 'Vazio', cor: '#93c5fd' }, { id: _uid(), nome: 'Inferior', cor: '#bfdbfe' }] },
        { id: _uid(), nome: 'Magoado', cor: '#60a5fa', inferiores: [{ id: _uid(), nome: 'Decepcionado', cor: '#93c5fd' }, { id: _uid(), nome: 'Traído', cor: '#bfdbfe' }] },
      ]},
      { id: _uid(), nome: 'Temeroso', cor: '#8b5cf6', icon: '😨', medias: [
        { id: _uid(), nome: 'Assustado', cor: '#a78bfa', inferiores: [{ id: _uid(), nome: 'Apavorado', cor: '#c4b5fd' }, { id: _uid(), nome: 'Aterrorizado', cor: '#ddd6fe' }] },
        { id: _uid(), nome: 'Ansioso', cor: '#a78bfa', inferiores: [{ id: _uid(), nome: 'Sobrecarregado', cor: '#c4b5fd' }, { id: _uid(), nome: 'Preocupado', cor: '#ddd6fe' }] },
        { id: _uid(), nome: 'Inseguro', cor: '#a78bfa', inferiores: [{ id: _uid(), nome: 'Inadequado', cor: '#c4b5fd' }, { id: _uid(), nome: 'Inferiorizado', cor: '#ddd6fe' }] },
        { id: _uid(), nome: 'Rejeitado', cor: '#a78bfa', inferiores: [{ id: _uid(), nome: 'Excluído', cor: '#c4b5fd' }, { id: _uid(), nome: 'Perseguido', cor: '#ddd6fe' }] },
      ]},
      { id: _uid(), nome: 'Irritado', cor: '#dc2626', icon: '😠', medias: [
        { id: _uid(), nome: 'Crítico', cor: '#ef4444', inferiores: [{ id: _uid(), nome: 'Cético', cor: '#f87171' }, { id: _uid(), nome: 'Sarcástico', cor: '#fca5a5' }] },
        { id: _uid(), nome: 'Frustrado', cor: '#ef4444', inferiores: [{ id: _uid(), nome: 'Infurioso', cor: '#f87171' }, { id: _uid(), nome: 'Irritadiço', cor: '#fca5a5' }] },
        { id: _uid(), nome: 'Distante', cor: '#ef4444', inferiores: [{ id: _uid(), nome: 'Indiferente', cor: '#f87171' }, { id: _uid(), nome: 'Reservado', cor: '#fca5a5' }] },
        { id: _uid(), nome: 'Agressivo', cor: '#ef4444', inferiores: [{ id: _uid(), nome: 'Provocado', cor: '#f87171' }, { id: _uid(), nome: 'Hostil', cor: '#fca5a5' }] },
      ]},
    ];
    _set(`pcf_emocoes_config_${userId}`, emoConfig);

    // Hábitos padrão
    const habitos = [
      { id: _uid(), dataCriacao: new Date().toISOString().split('T')[0], nome: 'Beber 2L de água', descricao: 'Hidratação diária', categoria: 'Saúde', meta: 'Diário', icone: '💧', cor: '#3b82f6', ativo: true },
      { id: _uid(), dataCriacao: new Date().toISOString().split('T')[0], nome: 'Exercício físico', descricao: 'Pelo menos 30 minutos', categoria: 'Exercício', meta: '5x/semana', icone: '🏃', cor: '#16a34a', ativo: true },
      { id: _uid(), dataCriacao: new Date().toISOString().split('T')[0], nome: 'Leitura', descricao: '20 minutos de leitura', categoria: 'Mente', meta: 'Diário', icone: '📚', cor: '#8b5cf6', ativo: true },
      { id: _uid(), dataCriacao: new Date().toISOString().split('T')[0], nome: 'Meditação / Oração', descricao: 'Momento de reflexão e gratidão', categoria: 'Mente', meta: 'Diário', icone: '🧘', cor: '#f59e0b', ativo: true },
      { id: _uid(), dataCriacao: new Date().toISOString().split('T')[0], nome: 'Alimentação saudável', descricao: 'Evitar ultraprocessados', categoria: 'Alimentação', meta: 'Diário', icone: '🍎', cor: '#dc2626', ativo: true },
      { id: _uid(), dataCriacao: new Date().toISOString().split('T')[0], nome: 'Dormir 7–8 horas', descricao: 'Qualidade do sono', categoria: 'Sono', meta: 'Diário', icone: '😴', cor: '#0ea5e9', ativo: true },
      { id: _uid(), dataCriacao: new Date().toISOString().split('T')[0], nome: 'Gratidão', descricao: 'Anotar 3 coisas pelas quais sou grato', categoria: 'Mente', meta: 'Diário', icone: '🙏', cor: '#ec4899', ativo: true },
    ];
    _set(`pcf_habitos_${userId}`, habitos);

    // Frases motivacionais padrão
    const frases = [
      { id: _uid(), texto: 'O sucesso é a soma de pequenos esforços repetidos dia após dia.', autor: 'Robert Collier', categoria: 'Motivação', ativo: true },
      { id: _uid(), texto: 'Você não precisa ser ótimo para começar, mas precisa começar para ser ótimo.', autor: 'Zig Ziglar', categoria: 'Motivação', ativo: true },
      { id: _uid(), texto: 'Cuide do seu corpo. É o único lugar que você tem para viver.', autor: 'Jim Rohn', categoria: 'Saúde', ativo: true },
      { id: _uid(), texto: 'A disciplina é a ponte entre metas e realizações.', autor: 'Jim Rohn', categoria: 'Produtividade', ativo: true },
      { id: _uid(), texto: 'Pequenas ações diárias constroem grandes resultados ao longo do tempo.', autor: '', categoria: 'Motivação', ativo: true },
      { id: _uid(), texto: 'Não importa o quão devagar você vá, desde que não pare.', autor: 'Confúcio', categoria: 'Motivação', ativo: true },
      { id: _uid(), texto: 'A saúde é a maior riqueza que um homem pode possuir.', autor: 'Virgílio', categoria: 'Saúde', ativo: true },
      { id: _uid(), texto: 'Invista em você mesmo. Seu retorno é garantido.', autor: '', categoria: 'Finanças', ativo: true },
      { id: _uid(), texto: 'O hábito é o segundo natureza e dez vezes mais forte.', autor: 'Epicteto', categoria: 'Motivação', ativo: true },
      { id: _uid(), texto: 'Somos o que fazemos repetidamente. A excelência não é um ato, mas um hábito.', autor: 'Aristóteles', categoria: 'Produtividade', ativo: true },
      { id: _uid(), texto: 'A persistência é o caminho do êxito.', autor: 'Charles Chaplin', categoria: 'Motivação', ativo: true },
      { id: _uid(), texto: 'Acredite que você pode e você já está no meio do caminho.', autor: 'Theodore Roosevelt', categoria: 'Motivação', ativo: true },
      { id: _uid(), texto: 'Quanto melhor você cuida de si mesmo, melhor você serve ao mundo.', autor: '', categoria: 'Saúde', ativo: true },
      { id: _uid(), texto: 'Uma hora de leitura por dia é capaz de mudar toda a sua vida.', autor: '', categoria: 'Produtividade', ativo: true },
      { id: _uid(), texto: 'O segredo de ir adiante é começar.', autor: 'Mark Twain', categoria: 'Motivação', ativo: true },
      { id: _uid(), texto: 'Cada dia é uma nova oportunidade de crescer e melhorar.', autor: '', categoria: 'Motivação', ativo: true },
      { id: _uid(), texto: 'Mente sã em corpo são é o fundamento da felicidade.', autor: '', categoria: 'Saúde', ativo: true },
      { id: _uid(), texto: 'A gratidão transforma o que temos em suficiente.', autor: '', categoria: 'Espiritualidade', ativo: true },
      { id: _uid(), texto: 'Seu futuro é criado pelo que você faz hoje, não amanhã.', autor: 'Robert Kiyosaki', categoria: 'Finanças', ativo: true },
      { id: _uid(), texto: 'Comece onde você está. Use o que você tem. Faça o que você pode.', autor: 'Arthur Ashe', categoria: 'Motivação', ativo: true },
    ];
    _set(`pcf_frases_${userId}`, frases);
  };

  /* ---------- HÁBITOS ---------- */
  const _hkU = () => `pcf_habitos_${currentUserId()}`;
  const getHabitos = () => _get(_hkU()) || [];
  const saveHabitos = (h) => _set(_hkU(), h);
  const addHabito = (h) => { const all = getHabitos(); all.push({ id: _uid(), dataCriacao: new Date().toISOString().split('T')[0], ...h }); saveHabitos(all); return all; };
  const updateHabito = (id, data) => { const all = getHabitos(); const i = all.findIndex(h => h.id === id); if (i >= 0) { all[i] = { ...all[i], ...data }; saveHabitos(all); } return all; };
  const deleteHabito = (id) => { const all = getHabitos().filter(h => h.id !== id); saveHabitos(all); return all; };

  /* ---------- REGISTROS DIÁRIOS DE HÁBITOS ---------- */
  const _rhkU = () => `pcf_reg_habitos_${currentUserId()}`;
  const getRegistrosHabitos = () => _get(_rhkU()) || [];
  const saveRegistrosHabitos = (r) => _set(_rhkU(), r);
  const upsertRegistroHabito = (r) => {
    const all = getRegistrosHabitos();
    const i = all.findIndex(x => x.habitoId === r.habitoId && x.data === r.data);
    if (i >= 0) { all[i] = { ...all[i], ...r }; } else { all.push({ id: _uid(), ...r }); }
    saveRegistrosHabitos(all);
    return all;
  };

  /* ---------- FRASES / MENSAGENS DO DIA ---------- */
  const _fkU = () => `pcf_frases_${currentUserId()}`;
  const getFrases = () => _get(_fkU()) || [];
  const saveFrases = (f) => _set(_fkU(), f);
  const addFrase = (f) => { const all = getFrases(); all.push({ id: _uid(), ...f }); saveFrases(all); return all; };
  const updateFrase = (id, data) => { const all = getFrases(); const i = all.findIndex(f => f.id === id); if (i >= 0) { all[i] = { ...all[i], ...data }; saveFrases(all); } return all; };
  const deleteFrase = (id) => { const all = getFrases().filter(f => f.id !== id); saveFrases(all); return all; };

  /* ---------- IMPORT / EXPORT ---------- */
  const exportData = (userId) => {
    const uid = userId || currentUserId();
    return {
      transacoes: _get(`pcf_transacoes_${uid}`) || [],
      categorias: _get(`pcf_categorias_${uid}`) || [],
      emocoes: _get(`pcf_emocoes_${uid}`) || [],
      emocoes_config: _get(`pcf_emocoes_config_${uid}`) || [],
      imc: _get(`pcf_imc_${uid}`) || { peso: 0, altura: 0 },
      habitos: _get(`pcf_habitos_${uid}`) || [],
      reg_habitos: _get(`pcf_reg_habitos_${uid}`) || [],
      frases: _get(`pcf_frases_${uid}`) || [],
    };
  };

  const importTransacoes = (data) => { _set(_tkU(), data); };
  const importCategorias = (data) => { _set(_ckU(), data); };

  return {
    getUsers, saveUsers, getUserById, getUserByLogin, createUser, updateUser, deleteUser,
    getSession, setSession, clearSession, currentUserId,
    getTransacoes, saveTransacoes, addTransacao, updateTransacao, deleteTransacao,
    getCategorias, saveCategorias, addCategoria, updateCategoria, deleteCategoria,
    getEmocoes, saveEmocoes, addEmocao, updateEmocao, deleteEmocao,
    getEmocoesConfig, saveEmocoesConfig,
    getIMC, saveIMC,
    getCompromissos, saveCompromissos, addCompromisso, updateCompromisso, deleteCompromisso,
    getHabitos, saveHabitos, addHabito, updateHabito, deleteHabito,
    getRegistrosHabitos, saveRegistrosHabitos, upsertRegistroHabito,
    getFrases, saveFrases, addFrase, updateFrase, deleteFrase,
    exportData, importTransacoes, importCategorias,
    _uid,
  };
})();
