/* ========================================================
   PCF - Personal Financial Control
   store.js — Camada de persistência: Firebase Firestore + Firebase Auth
   ======================================================== */
window.PCF = window.PCF || {};

PCF.Store = (() => {
  /* ---------- Referências Firebase ---------- */
  const _auth = () => PCF.Firebase.auth;
  const _db   = () => PCF.Firebase.db;

  /* ---------- Cache em memória (mantém API síncrona das páginas) ---------- */
  const _cache = {};

  /* ---------- Colunas de dados por usuário ---------- */
  const DATA_COLS = [
    'transacoes', 'categorias', 'emocoes', 'emocoes_config', 'imc', 'agenda',
    'habitos', 'reg_habitos', 'frases', 'contatos', 'diario', 'diario_tabs',
    'rodavida_reg', 'rodavida_config', 'plano_acao', 'saude_eventos',
    'virtudes_config', 'virtudes_reg', 'linha_tempo', 'uso_funcionalidades', 'atividades',
    'jogo_palavras_estado'
  ];

  /* ---------- Resolve chave de cache → {col, uid} ---------- */
  const _parseKey = (key) => {
    for (const col of DATA_COLS) {
      const prefix = `pcf_${col}_`;
      if (key.startsWith(prefix)) {
        const uid = key.slice(prefix.length);
        if (uid) return { col, uid };
      }
    }
    return null;
  };

  /* ---------- Primitivos: cache síncrono + Firestore assíncrono ---------- */
  const _get = (key) => {
    const v = _cache[key];
    return v !== undefined ? v : null;
  };

  const _set = (key, val) => {
    _cache[key] = val;
    const parsed = _parseKey(key);
    if (parsed && _auth().currentUser) {
      _db().collection('users').doc(parsed.uid).collection('data').doc(parsed.col)
        .set({ value: val })
        .catch(err => console.warn('[PCF] Firestore write:', parsed.col, err.message));
    }
  };

  const _del = (key) => {
    delete _cache[key];
    const parsed = _parseKey(key);
    if (parsed) {
      _db().collection('users').doc(parsed.uid).collection('data').doc(parsed.col)
        .delete().catch(() => {});
    }
  };

  const _uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const HABITOS_DEFAULT_ADMIN = 'Antonino Costa da Silva';
  const HABITOS_DEFAULT_DOC = 'habitos_defaults';
  const EMOCOES_DEFAULT_DOC = 'emocoes_defaults';
  const EMOCOES_SYNC_VERSION = 2;

  /* ---------- USERS ---------- */
  const getUsers = () => _cache['pcf_users'] || [];
  const saveUsers = () => {}; // noop — gerenciado individualmente no Firestore
  const getUserById = (id) => getUsers().find(u => u.id === id);
  const getUserByLogin = (login) => getUsers().find(u => u.login === login);

  /* ---- loadAll: popula cache com dados do Firestore após login ---- */
  const loadAll = async (uid) => {
    let profileSnap = await _db().collection('users').doc(uid).get();
    // Retry único: novo usuário (Google ou e-mail) pode ter race condition entre
    // a criação do perfil e o disparo do onAuthStateChanged
    if (!profileSnap.exists) {
      await new Promise(r => setTimeout(r, 1400));
      profileSnap = await _db().collection('users').doc(uid).get();
    }
    const profile = profileSnap.exists ? profileSnap.data() : {};
    const [habitosDefaultSnap, emocoesDefaultSnap] = await Promise.all([
      _db().collection('meta').doc(HABITOS_DEFAULT_DOC).get(),
      _db().collection('meta').doc(EMOCOES_DEFAULT_DOC).get(),
    ]);
    _cache['pcf_habitos_defaults'] = habitosDefaultSnap.exists
      ? (habitosDefaultSnap.data().value || null)
      : null;
    _cache['pcf_emocoes_defaults'] = emocoesDefaultSnap.exists
      ? (emocoesDefaultSnap.data().value || null)
      : null;
    if (profile.isAdmin) {
      const snap = await _db().collection('users').get();
      const users = [];
      snap.forEach(d => users.push({ id: d.id, ...d.data() }));
      _cache['pcf_users'] = users;
    } else {
      _cache['pcf_users'] = [{ id: uid, ...profile }];
    }
    const snaps = await Promise.all(
      DATA_COLS.map(col => _db().collection('users').doc(uid).collection('data').doc(col).get())
    );
    DATA_COLS.forEach((col, i) => {
      _cache[`pcf_${col}_${uid}`] = snaps[i].exists ? snaps[i].data().value : null;
    });
    _seedDefaults(uid);
    // Publica também hábitos que já estavam cadastrados antes desta versão.
    if (_currentUserControlsHabitosDefault()) _publishHabitosDefault(getHabitos());
    if (_currentUserControlsEmocoesDefault()) {
      const catalogoCodigo = _cache['pcf_emocoes_catalogo_codigo'];
      const configPadrao = Array.isArray(catalogoCodigo)
        ? _criarEmocoesDoModelo(catalogoCodigo)
        : getEmocoesConfig();
      const migrou = await _syncEmocoesDefaultForAllUsers(configPadrao);
      _publishEmocoesDefault(migrou ? configPadrao : getEmocoesConfig());
    }
  };

  /* ---- loginWithGoogle: entrar ou cadastrar via conta Google ---- */
  const loginWithGoogle = async () => {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const result = await _auth().signInWithPopup(provider);
      // Cria perfil no Firestore apenas se for o primeiro acesso do usuário
      if (result.additionalUserInfo.isNewUser) {
        const bootstrapSnap = await _db().collection('meta').doc('bootstrap').get();
        const isFirst = !bootstrapSnap.exists;
        const fbUser = result.user;
        const profile = {
          nome: fbUser.displayName || '',
          email: fbUser.email || '',
          cpf: '', telefone: '', dataNascimento: '',
          login: fbUser.email || '',
          isAdmin: isFirst,
          dataCadastro: new Date().toISOString().split('T')[0],
        };
        await _db().collection('users').doc(fbUser.uid).set(profile);
        await registrarAtividade(fbUser.uid, 'conta_criada');
        if (isFirst) {
          await _db().collection('meta').doc('bootstrap')
            .set({ createdAt: new Date().toISOString() }).catch(() => {});
        }
      }
      await registrarAtividade(result.user.uid, 'login');
      return { ok: true };
    } catch (err) {
      if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(err.code))
        return { ok: false, msg: '' }; // usuário fechou o popup — sem mensagem de erro
      return { ok: false, msg: err.message };
    }
  };

  /* ---- registerSelf: auto-cadastro via Firebase Auth ---- */
  const registerSelf = async (data, password) => {
    try {
      // Verifica se já existe algum usuário via doc público — sem exigir permissão de admin
      // (substituiu list() que bloqueava antes do documento do usuário existir)
      const bootstrapSnap = await _db().collection('meta').doc('bootstrap').get();
      const isFirst = !bootstrapSnap.exists;

      const cred = await _auth().createUserWithEmailAndPassword(data.email, password);
      const profile = {
        nome: data.nome || '', cpf: data.cpf || '', email: data.email,
        telefone: data.telefone || '', dataNascimento: data.dataNascimento || '',
        login: data.login || data.email,
        isAdmin: isFirst,
        dataCadastro: new Date().toISOString().split('T')[0],
      };
      // O create é permitido pela regra request.auth.uid == userId (usuário recém autenticado)
      await _db().collection('users').doc(cred.user.uid).set(profile);
      await registrarAtividade(cred.user.uid, 'conta_criada');
      // Marca que já existe pelo menos um usuário
      if (isFirst) {
        await _db().collection('meta').doc('bootstrap').set({ createdAt: new Date().toISOString() }).catch(() => {});
      }
      return { ok: true };
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') return { ok: false, msg: 'E-mail já cadastrado' };
      if (err.code === 'auth/weak-password')        return { ok: false, msg: 'Senha fraca (mín. 6 caracteres)' };
      return { ok: false, msg: err.message };
    }
  };

  /* ---- createUser: admin cria usuário via app Firebase secundário ---- */
  const createUser = async (data, password) => {
    if (!data.email) return { ok: false, msg: 'E-mail é obrigatório' };
    if (!password)   return { ok: false, msg: 'Senha é obrigatória' };
    const users = getUsers();
    if (data.login && users.some(u => u.login === data.login)) return { ok: false, msg: 'Login já existe' };
    if (data.cpf   && users.some(u => u.cpf   === data.cpf))   return { ok: false, msg: 'CPF já cadastrado' };
    try {
      const secApp  = firebase.initializeApp(PCF.Firebase.config, 'pcf_sec_' + Date.now());
      const secAuth = firebase.auth(secApp);
      let cred;
      try   { cred = await secAuth.createUserWithEmailAndPassword(data.email, password); }
      finally { await secAuth.signOut().catch(() => {}); await secApp.delete().catch(() => {}); }
      const profile = {
        nome: data.nome || '', cpf: data.cpf || '', email: data.email,
        telefone: data.telefone || '', dataNascimento: data.dataNascimento || '',
        login: data.login || data.email,
        isAdmin: !!data.isAdmin,
        dataCadastro: new Date().toISOString().split('T')[0],
      };
      await _db().collection('users').doc(cred.user.uid).set(profile);
      await registrarAtividade(cred.user.uid, 'conta_criada');
      DATA_COLS.forEach(col => { _cache[`pcf_${col}_${cred.user.uid}`] = null; });
      _seedDefaults(cred.user.uid);
      const user = { id: cred.user.uid, ...profile };
      _cache['pcf_users'] = [...getUsers(), user];
      return { ok: true, user };
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') return { ok: false, msg: 'E-mail já cadastrado' };
      if (err.code === 'auth/weak-password')        return { ok: false, msg: 'Senha fraca (mín. 6 caracteres)' };
      return { ok: false, msg: err.message };
    }
  };

  const updateUser = async (id, data) => {
    const users = getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return { ok: false, msg: 'Usuário não encontrado' };
    if (data.login && data.login !== users[idx].login && users.some(u => u.login === data.login))
      return { ok: false, msg: 'Login já existe' };
    const { newPassword, senhaHash, ...profileData } = data;
    // Apenas admin pode alterar o campo isAdmin (defesa em código + regras Firestore)
    if (!currentUserIsAdmin()) delete profileData.isAdmin;
    users[idx] = { ...users[idx], ...profileData };
    _cache['pcf_users'] = users;
    await _db().collection('users').doc(id).update(profileData);
    await registrarAtividade(id, 'perfil_atualizado');
    if (newPassword && id === currentUserId()) {
      try { await _auth().currentUser.updatePassword(newPassword); }
      catch (e) { console.warn('[PCF] Falha ao alterar senha:', e.message); }
    }
    return { ok: true };
  };

  const deleteUser = async (id) => {
    await _db().collection('users').doc(id).delete();
    await Promise.all(DATA_COLS.map(col =>
      _db().collection('users').doc(id).collection('data').doc(col).delete().catch(() => {})
    ));
    _cache['pcf_users'] = getUsers().filter(u => u.id !== id);
    DATA_COLS.forEach(col => { delete _cache[`pcf_${col}_${id}`]; });
  };

  /* ---------- SESSÃO (gerenciada pelo Firebase Auth) ---------- */
  const getSession = () => {
    const u = _auth().currentUser;
    if (!u) return null;
    const profile = getUserById(u.uid) || {};
    return { userId: u.uid, login: profile.login || u.email };
  };
  const setSession = () => {}; // noop — Firebase Auth gerencia a sessão
  const clearSession = () => {
    const uid = currentUserId();
    if (uid) registrarAtividade(uid, 'logout');
    Object.keys(_cache).forEach(k => delete _cache[k]);
    return _auth().signOut();
  };
  const currentUserId = () => _auth().currentUser?.uid || null;
  const currentUserIsAdmin = () => {
    const uid = currentUserId();
    if (!uid) return false;
    return !!(getUserById(uid)?.isAdmin);
  };

  const getAtividadesUsuario = async (userId) => {
    if (!userId || (!currentUserIsAdmin() && userId !== currentUserId())) return [];
    const key = `pcf_atividades_${userId}`;
    let atividades = _cache[key];
    if (!Array.isArray(atividades)) {
      const snap = await _db().collection('users').doc(userId).collection('data').doc('atividades').get();
      atividades = snap.exists ? (snap.data().value || []) : [];
      _cache[key] = atividades;
    }
    return [...atividades].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  };

  const registrarAtividade = async (userId, tipo, detalhes = {}) => {
    if (!userId) return;
    const key = `pcf_atividades_${userId}`;
    let atividades = _cache[key];
    if (!Array.isArray(atividades)) {
      try {
        const snap = await _db().collection('users').doc(userId).collection('data').doc('atividades').get();
        atividades = snap.exists ? (snap.data().value || []) : [];
      } catch {
        atividades = [];
      }
    }
    const nova = [{ id: _uid(), tipo, data: new Date().toISOString(), ...detalhes }, ...atividades].slice(0, 200);
    _cache[key] = nova;
    await _db().collection('users').doc(userId).collection('data').doc('atividades')
      .set({ value: nova })
      .catch(err => console.warn('[PCF] Firestore atividade:', err.message));
  };

  /* ---------- USO DE FUNCIONALIDADES ---------- */
  const _usoU = () => `pcf_uso_funcionalidades_${currentUserId()}`;
  const getUsoFuncionalidades = () => _get(_usoU()) || [];
  const saveUsoFuncionalidades = (u) => _set(_usoU(), u || []);
  const registrarUsoFuncionalidade = (data) => {
    const hash = data?.hash || '';
    if (!hash || hash === '#politica-privacidade') return;
    const all = getUsoFuncionalidades();
    all.push({
      id: _uid(),
      hash,
      label: data.label || hash.replace('#', ''),
      grupo: data.grupo || 'Geral',
      data: new Date().toISOString(),
    });
    saveUsoFuncionalidades(all.slice(-1000));
  };
  const getRelatorioUsoFuncionalidades = async () => {
    if (!currentUserIsAdmin()) return [];
    const users = getUsers();
    const rows = await Promise.all(users.map(async (user) => {
      const key = `pcf_uso_funcionalidades_${user.id}`;
      let usos = _cache[key];
      if (!Array.isArray(usos)) {
        const snap = await _db().collection('users').doc(user.id).collection('data').doc('uso_funcionalidades').get();
        usos = snap.exists ? (snap.data().value || []) : [];
        _cache[key] = usos;
      }
      return { user, usos };
    }));
    return rows;
  };

  /* ---------- LINHA DO TEMPO ---------- */
  const _ltkU = () => `pcf_linha_tempo_${currentUserId()}`;
  const getLinhaTempo = () => _get(_ltkU()) || [];
  const saveLinhaTempo = (eventos) => _set(_ltkU(), eventos);
  const addEventoLinhaTempo = (evento) => {
    const all = getLinhaTempo();
    all.push({ id: _uid(), criadoEm: new Date().toISOString(), ...evento });
    saveLinhaTempo(all);
    return all;
  };
  const updateEventoLinhaTempo = (id, data) => {
    const all = getLinhaTempo();
    const i = all.findIndex(e => e.id === id);
    if (i >= 0) {
      all[i] = { ...all[i], ...data, atualizadoEm: new Date().toISOString() };
      saveLinhaTempo(all);
    }
    return all;
  };
  const deleteEventoLinhaTempo = (id) => {
    const all = getLinhaTempo().filter(e => e.id !== id);
    saveLinhaTempo(all);
    return all;
  };

  /* ---------- TRANSAÇÕES ---------- */
  const _tkU = () => `pcf_transacoes_${currentUserId()}`;
  const _normalizarCategoriaFinanceira = (categoria) => categoria === 'Sonhos' ? 'Propósitos' : categoria;
  const _normalizarTransacaoFinanceira = (t) => ({ ...t, categoria: _normalizarCategoriaFinanceira(t?.categoria) });
  const getTransacoes = () => {
    const raw = _get(_tkU()) || [];
    const normalizadas = raw.map(_normalizarTransacaoFinanceira);
    if (JSON.stringify(raw) !== JSON.stringify(normalizadas)) _set(_tkU(), normalizadas);
    return normalizadas;
  };
  const saveTransacoes = (t) => _set(_tkU(), (t || []).map(_normalizarTransacaoFinanceira));
  const addTransacao = (t) => { const all = getTransacoes(); all.push({ id: _uid(), ..._normalizarTransacaoFinanceira(t) }); saveTransacoes(all); return all; };
  const updateTransacao = (id, data) => { const all = getTransacoes(); const i = all.findIndex(t => t.id === id); if (i >= 0) { all[i] = { ...all[i], ...data }; saveTransacoes(all); } return all; };
  const deleteTransacao = (id) => { const all = getTransacoes().filter(t => t.id !== id); saveTransacoes(all); return all; };

  /* ---------- CATEGORIAS ---------- */
  const _ckU = () => `pcf_categorias_${currentUserId()}`;
  const _normalizarCategoriaConfig = (c) => {
    const normalizada = { ...c, categoria: _normalizarCategoriaFinanceira(c?.categoria) };
    if (normalizada.tipoOperacao === 'INVESTIMENTO' && normalizada.categoria === 'Investimentos') {
      const subcategorias = normalizada.subcategorias || [];
      const temAcoes = subcategorias.some(s => (typeof s === 'string' ? s : s?.nome) === 'Ações');
      const comAcoes = temAcoes ? subcategorias : [...subcategorias, { nome: 'Ações', tipo: 'Variável' }];
      const ordemFinal = ['Ações', 'Poupança', 'Outros'];
      normalizada.subcategorias = [...comAcoes].sort((a, b) => {
        const nomeA = typeof a === 'string' ? a : a?.nome;
        const nomeB = typeof b === 'string' ? b : b?.nome;
        const idxA = ordemFinal.indexOf(nomeA);
        const idxB = ordemFinal.indexOf(nomeB);
        if (idxA >= 0 && idxB >= 0) return idxA - idxB;
        if (idxA >= 0) return 1;
        if (idxB >= 0) return -1;
        return 0;
      });
    }
    return normalizada;
  };
  const getCategorias = () => {
    const raw = _get(_ckU()) || [];
    const normalizadas = raw.map(_normalizarCategoriaConfig);
    if (JSON.stringify(raw) !== JSON.stringify(normalizadas)) _set(_ckU(), normalizadas);
    return normalizadas;
  };
  const saveCategorias = (c) => _set(_ckU(), (c || []).map(_normalizarCategoriaConfig));
  const addCategoria = (c) => { const all = getCategorias(); all.push({ id: _uid(), ...c }); saveCategorias(all); return all; };
  const updateCategoria = (id, data) => { const all = getCategorias(); const i = all.findIndex(c => c.id === id); if (i >= 0) { all[i] = { ...all[i], ...data }; saveCategorias(all); } return all; };
  const deleteCategoria = (id) => { const all = getCategorias().filter(c => c.id !== id); saveCategorias(all); return all; };

  /* ---------- EMOÇÕES REGISTRO ---------- */
  const _ekU = () => `pcf_emocoes_${currentUserId()}`;
  const _mergeEmocaoTexto = (situacao, descricao, situacaoDescricao) => {
    if (situacaoDescricao && situacaoDescricao.trim()) return situacaoDescricao.trim();
    const partes = [situacao, descricao].map(v => (v || '').trim()).filter(Boolean);
    return partes.filter((v, i) => partes.indexOf(v) === i).join('\n\n');
  };
  const _normalizeEmocao = (e) => {
    const situacaoDescricao = _mergeEmocaoTexto(e?.situacao, e?.descricao, e?.situacaoDescricao);
    const normalizada = { ...e, situacaoDescricao };
    delete normalizada.situacao;
    delete normalizada.descricao;
    return normalizada;
  };
  const getEmocoes = () => {
    const raw = _get(_ekU()) || [];
    const normalizadas = raw.map(_normalizeEmocao);
    if (JSON.stringify(raw) !== JSON.stringify(normalizadas)) _set(_ekU(), normalizadas);
    return normalizadas;
  };
  const saveEmocoes = (e) => _set(_ekU(), (e || []).map(_normalizeEmocao));
  const addEmocao = (e) => { const all = getEmocoes(); all.push({ id: _uid(), ..._normalizeEmocao(e) }); saveEmocoes(all); return all; };
  const updateEmocao = (id, data) => { const all = getEmocoes(); const i = all.findIndex(e => e.id === id); if (i >= 0) { all[i] = { ...all[i], ..._normalizeEmocao(data) }; saveEmocoes(all); } return all; };
  const deleteEmocao = (id) => { const all = getEmocoes().filter(e => e.id !== id); saveEmocoes(all); return all; };

  /* ---------- EMOÇÕES CONFIG ---------- */
  const _ecU = () => `pcf_emocoes_config_${currentUserId()}`;
  const getEmocoesConfig = () => _get(_ecU()) || [];
  const _currentUserControlsEmocoesDefault = () => {
    const user = getUserById(currentUserId());
    return !!user?.isAdmin && (user.nome || '').trim() === HABITOS_DEFAULT_ADMIN;
  };
  const _modeloEmocoesSemIds = (config) => (config || []).map(({ id, ...superior }) => ({
    ...superior,
    medias: (superior.medias || []).map(({ id: medId, ...media }) => ({
      ...media,
      inferiores: (media.inferiores || []).map(({ id: infId, ...inferior }) => ({ ...inferior })),
    })),
  }));
  const _criarEmocoesDoModelo = (modelo) => (modelo || []).map(superior => ({
    ...superior,
    id: _uid(),
    medias: (superior.medias || []).map(media => ({
      ...media,
      id: _uid(),
      inferiores: (media.inferiores || []).map(inferior => ({ ...inferior, id: _uid() })),
    })),
  }));
  const _publishEmocoesDefault = (config) => {
    if (!_currentUserControlsEmocoesDefault()) return;
    const modelo = _modeloEmocoesSemIds(config);
    _cache['pcf_emocoes_defaults'] = modelo;
    _db().collection('meta').doc(EMOCOES_DEFAULT_DOC).set({
      value: modelo,
      administrador: HABITOS_DEFAULT_ADMIN,
      atualizadoEm: new Date().toISOString(),
    }).catch(err => console.warn('[PCF] Firestore emoções padrão:', err.message));
  };
  const _syncEmocoesDefaultForAllUsers = async (config) => {
    if (!_currentUserControlsEmocoesDefault()) return;
    const adminId = currentUserId();
    const markerRef = _db().collection('users').doc(adminId)
      .collection('data').doc(`emocoes_sync_global_v${EMOCOES_SYNC_VERSION}`);
    const marker = await markerRef.get();
    if (marker.exists) return false;

    const users = getUsers();
    const tamanhoLote = 400;
    for (let inicio = 0; inicio < users.length; inicio += tamanhoLote) {
      const batch = _db().batch();
      users.slice(inicio, inicio + tamanhoLote).forEach(user => {
        const configUsuario = _criarEmocoesDoModelo(_modeloEmocoesSemIds(config));
        const ref = _db().collection('users').doc(user.id).collection('data').doc('emocoes_config');
        batch.set(ref, { value: configUsuario });
        _cache[`pcf_emocoes_config_${user.id}`] = configUsuario;
      });
      await batch.commit();
    }

    await markerRef.set({
      versao: EMOCOES_SYNC_VERSION,
      usuariosAtualizados: users.length,
      administrador: HABITOS_DEFAULT_ADMIN,
      concluidoEm: new Date().toISOString(),
    });
    return true;
  };
  const saveEmocoesConfig = (c) => {
    _set(_ecU(), c);
    _publishEmocoesDefault(c);
  };

  /* ---------- IMC ---------- */
  const _imcU = () => `pcf_imc_${currentUserId()}`;
  const _hojeISO = () => new Date().toISOString().split('T')[0];
  const _calcIMC = (peso, altura) => (altura > 0 && peso > 0) ? peso / (altura * altura) : 0;
  const _normalizeIMC = (raw) => {
    const base = raw || {};
    const registrosRaw = Array.isArray(base.registros) ? base.registros : [];
    const registros = registrosRaw
      .map(r => ({
        id: r.id || _uid(),
        data: r.data || _hojeISO(),
        peso: Number(r.peso) || 0,
        altura: Number(r.altura || base.altura) || 0,
        imc: Number(r.imc) || _calcIMC(Number(r.peso) || 0, Number(r.altura || base.altura) || 0),
      }))
      .filter(r => r.data && r.peso > 0 && r.altura > 0)
      .sort((a, b) => a.data.localeCompare(b.data));
    if (!registros.length && Number(base.peso) > 0 && Number(base.altura) > 0) {
      const altura = Number(base.altura);
      const peso = Number(base.peso);
      registros.push({
        id: _uid(),
        data: base.data || _hojeISO(),
        peso,
        altura,
        imc: _calcIMC(peso, altura),
      });
    }
    const ultimo = registros[registros.length - 1] || null;
    return {
      altura: Number(base.altura || ultimo?.altura) || 0,
      peso: Number(ultimo?.peso || base.peso) || 0,
      registros,
    };
  };
  const getIMC = () => {
    const raw = _get(_imcU()) || { peso: 0, altura: 0, registros: [] };
    const normalizado = _normalizeIMC(raw);
    if (JSON.stringify(raw) !== JSON.stringify(normalizado)) _set(_imcU(), normalizado);
    return normalizado;
  };
  const saveIMC = (d) => _set(_imcU(), _normalizeIMC(d));

  /* ---------- AGENDA / COMPROMISSOS ---------- */
  const _agU = () => `pcf_agenda_${currentUserId()}`;
  const _agCfgU = () => `pcf_agenda_config_${currentUserId()}`;
  const _emitAgendaChange = (type, detail = {}) => {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent('pcf:agenda-changed', {
      detail: { type, ...detail }
    }));
  };
  const getAgendaConfig = () => ({ avisoSonoroAtivo: true, ...(_get(_agCfgU()) || {}) });
  const saveAgendaConfig = (config) => _set(_agCfgU(), { ...getAgendaConfig(), ...config });
  const getCompromissos = () => _get(_agU()) || [];
  const saveCompromissos = (c) => {
    _set(_agU(), c);
    _emitAgendaChange('save', { compromissos: c });
  };
  const addCompromisso = (c) => {
    const novo = { id: _uid(), ultimoAvisoChave: null, ...c };
    const all = getCompromissos();
    all.push(novo);
    saveCompromissos(all);
    return all;
  };
  const updateCompromisso = (id, data) => {
    const all = getCompromissos();
    const i = all.findIndex(c => c.id === id);
    if (i >= 0) {
      const anterior = all[i];
      all[i] = { ...all[i], ...data };
      const mudouAgendamento = anterior.data !== all[i].data || anterior.hora !== all[i].hora;
      const virouPendente = anterior.status !== 'Pendente' && all[i].status === 'Pendente';
      if (mudouAgendamento || virouPendente) all[i].ultimoAvisoChave = null;
      if (all[i].status !== 'Pendente') all[i].ultimoAvisoChave = null;
      saveCompromissos(all);
    }
    return all;
  };
  const deleteCompromisso = (id) => {
    const all = getCompromissos().filter(c => c.id !== id);
    saveCompromissos(all);
    return all;
  };

  /* ---------- SAUDE / CONSULTAS E EXAMES ---------- */
  const _seU = () => `pcf_saude_eventos_${currentUserId()}`;
  const getSaudeEventos = () => _get(_seU()) || [];
  const saveSaudeEventos = (eventos) => {
    _set(_seU(), eventos || []);
    _emitAgendaChange('saude-save', { eventos });
  };
  const addSaudeEvento = (evento) => {
    const novo = {
      id: _uid(),
      dataCadastro: new Date().toISOString().split('T')[0],
      status: 'Pendente',
      agendaAtivo: false,
      ...evento,
    };
    const all = getSaudeEventos();
    all.push(novo);
    saveSaudeEventos(all);
    return all;
  };
  const updateSaudeEvento = (id, data) => {
    const all = getSaudeEventos();
    const i = all.findIndex(e => e.id === id);
    if (i >= 0) {
      all[i] = { ...all[i], ...data };
      saveSaudeEventos(all);
    }
    return all;
  };
  const deleteSaudeEvento = (id) => {
    const all = getSaudeEventos().filter(e => e.id !== id);
    saveSaudeEventos(all);
    return all;
  };

  /* ---------- PLANO DE ACAO / 5W2H ---------- */
  const _paU = () => `pcf_plano_acao_${currentUserId()}`;
  const getPlanoAcoes = () => _get(_paU()) || [];
  const savePlanoAcoes = (acoes) => {
    _set(_paU(), acoes);
    _emitAgendaChange('plano-save', { acoes });
  };
  const addPlanoAcao = (acao) => {
    const nova = {
      id: _uid(),
      dataCadastro: new Date().toISOString().split('T')[0],
      ultimoAvisoChave: null,
      ...acao,
    };
    const all = getPlanoAcoes();
    all.push(nova);
    savePlanoAcoes(all);
    return all;
  };
  const updatePlanoAcao = (id, data) => {
    const all = getPlanoAcoes();
    const i = all.findIndex(a => a.id === id);
    if (i >= 0) {
      const anterior = all[i];
      all[i] = { ...all[i], ...data };
      const mudouAgenda =
        anterior.agendaAtivo !== all[i].agendaAtivo ||
        anterior.whenDate !== all[i].whenDate ||
        anterior.whenTime !== all[i].whenTime;
      const virouPendente = anterior.status !== 'Pendente' && all[i].status === 'Pendente';
      if (mudouAgenda || virouPendente) all[i].ultimoAvisoChave = null;
      if (all[i].status !== 'Pendente' || !all[i].agendaAtivo) all[i].ultimoAvisoChave = null;
      savePlanoAcoes(all);
    }
    return all;
  };
  const deletePlanoAcao = (id) => {
    const all = getPlanoAcoes().filter(a => a.id !== id);
    savePlanoAcoes(all);
    return all;
  };

  /*
   * Catálogo padrão de hábitos baseado na configuração administrativa.
   * Mantido sem id/data para que cada usuário receba registros independentes.
   */
  const HABITOS_DEFAULT = [
    { chavePadrao: 'agua-2l', nome: 'Beber 2L de água', descricao: 'Hidratação diária', categoria: 'Saúde', meta: '8x ao dia', icone: '💧', cor: '#3b82f6', ativo: true, tipoExecucao: 'ocorrencias', metaDiaria: 8, duracaoMinutos: 1 },
    { chavePadrao: 'exercicio', nome: 'Exercício físico', descricao: 'Pelo menos 30 minutos', categoria: 'Exercício', meta: '5x/semana', icone: '🏃', cor: '#16a34a', ativo: true, tipoExecucao: 'duracao', metaDiaria: 1, duracaoMinutos: 30 },
    { chavePadrao: 'estudo', nome: 'Estudo', descricao: '1 hora de estudo', categoria: 'Mente', meta: 'Diário', icone: '📖', cor: '#c13ef5', ativo: true, tipoExecucao: 'duracao', metaDiaria: 1, duracaoMinutos: 60 },
    { chavePadrao: 'leitura', nome: 'Leitura', descricao: '20 minutos de leitura', categoria: 'Mente', meta: 'Diário', icone: '📚', cor: '#8b5cf6', ativo: true, tipoExecucao: 'duracao', metaDiaria: 1, duracaoMinutos: 20 },
    { chavePadrao: 'meditacao-oracao', nome: 'Meditação / Oração', descricao: 'Momento de reflexão e gratidão', categoria: 'Mente', meta: 'Diário', icone: '🧘', cor: '#f59e0b', ativo: true, tipoExecucao: 'duracao', metaDiaria: 1, duracaoMinutos: 10 },
    { chavePadrao: 'alimentacao-saudavel', nome: 'Alimentação saudável', descricao: 'Evitar ultraprocessados', categoria: 'Alimentação', meta: '3 refeições ao dia', icone: '🍎', cor: '#dc2626', ativo: true, tipoExecucao: 'ocorrencias', metaDiaria: 3, duracaoMinutos: 1 },
    { chavePadrao: 'sono', nome: 'Dormir 7–8 horas', descricao: 'Qualidade do sono', categoria: 'Sono', meta: 'Diário', icone: '😴', cor: '#0ea5e9', ativo: true, tipoExecucao: 'duracao', metaDiaria: 1, duracaoMinutos: 420 },
    { chavePadrao: 'gratidao', nome: 'Gratidão', descricao: 'Anotar 3 coisas pelas quais sou grato', categoria: 'Mente', meta: '3 registros ao dia', icone: '🙏', cor: '#ec4899', ativo: true, tipoExecucao: 'ocorrencias', metaDiaria: 3, duracaoMinutos: 1 },
    { chavePadrao: 'violao', nome: 'Tocar Violão', descricao: 'Praticar violão por 20 minutos', categoria: 'Lazer', meta: 'Diário', icone: '🎸', cor: '#fcff40', ativo: true, tipoExecucao: 'duracao', metaDiaria: 1, duracaoMinutos: 20 },
  ];

  const _modeloHabitosDefault = () => {
    const publicado = _cache['pcf_habitos_defaults'];
    return Array.isArray(publicado) ? publicado : HABITOS_DEFAULT;
  };

  const _criarHabitosDoModelo = () => _modeloHabitosDefault().map(({ id, dataCriacao, ...h }) => ({
    id: _uid(),
    dataCriacao: new Date().toISOString().split('T')[0],
    ...h,
  }));

  /* ---------- SEED DEFAULTS ---------- */
  // forceKeys: quando fornecido, sobrescreve APENAS as chaves listadas; caso contrário, só escreve se vazio
  const _seedDefaults = (userId, forceKeys = null) => {
    const _seedIfEmpty = (key, data) => {
      if (forceKeys !== null) { if (forceKeys.includes(key)) _set(key, data); }
      else { if (_get(key) === null) _set(key, data); }
    };
    // Categorias padrão — subcategorias com tipo Fixo/Variável conforme base do usuário antoninocs
    const cats = [
      { id: _uid(), tipoOperacao: 'RECEITA', categoria: 'Salário Líquido', subcategorias: [] },
      { id: _uid(), tipoOperacao: 'RECEITA', categoria: '13º Salário', subcategorias: [] },
      { id: _uid(), tipoOperacao: 'RECEITA', categoria: 'Férias 1/3', subcategorias: [] },
      { id: _uid(), tipoOperacao: 'RECEITA', categoria: 'Placar', subcategorias: [] },
      { id: _uid(), tipoOperacao: 'RECEITA', categoria: 'IR (Restituição)', subcategorias: [] },
      { id: _uid(), tipoOperacao: 'RECEITA', categoria: 'Renda Extra', subcategorias: [] },
      { id: _uid(), tipoOperacao: 'RECEITA', categoria: 'Saldo mês anterior', subcategorias: [] },
      { id: _uid(), tipoOperacao: 'RECEITA', categoria: 'Outros', subcategorias: [] },
      { id: _uid(), tipoOperacao: 'INVESTIMENTO', categoria: 'Investimentos', subcategorias: [
        { nome: 'Aposentadoria / Previdência Oficial (INSS)', tipo: 'Fixo' },
        { nome: 'Previdência Privada', tipo: 'Fixo' },
        { nome: 'Aplicação em fundos / CDB', tipo: 'Variável' },
        { nome: 'Ações', tipo: 'Variável' },
        { nome: 'Poupança', tipo: 'Variável' },
        { nome: 'Outros', tipo: 'Variável' },
      ] },
      { id: _uid(), tipoOperacao: 'INVESTIMENTO', categoria: 'Propósitos', subcategorias: [
        { nome: 'Colchão Financeiro', tipo: 'Variável' },
        { nome: 'Outros', tipo: 'Variável' },
      ] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Habitação', subcategorias: [
        { nome: 'Aluguel', tipo: 'Fixo' },
        { nome: 'Condomínio', tipo: 'Fixo' },
        { nome: 'IPTU', tipo: 'Fixo' },
        { nome: 'Energia / Luz', tipo: 'Fixo' },
        { nome: 'Água', tipo: 'Fixo' },
        { nome: 'Internet', tipo: 'Fixo' },
        { nome: 'Telefone / Celular', tipo: 'Fixo' },
        { nome: 'Gás', tipo: 'Variável' },
        { nome: 'Materiais de Construção', tipo: 'Variável' },
        { nome: 'Seguro do imóvel', tipo: 'Fixo' },
        { nome: 'Assinatura', tipo: 'Fixo' },
        { nome: 'Outros', tipo: 'Variável' },
      ] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Mercado / Alimentação', subcategorias: [
        { nome: 'Mercado / Feira', tipo: 'Variável' },
        { nome: 'Padaria', tipo: 'Variável' },
        { nome: 'Restaurante', tipo: 'Variável' },
        { nome: 'Outros', tipo: 'Variável' },
      ] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Saúde', subcategorias: [
        { nome: 'Médico / Dentista / Laboratório', tipo: 'Variável' },
        { nome: 'Plano de Saúde', tipo: 'Fixo' },
        { nome: 'Plano Odontológico', tipo: 'Fixo' },
        { nome: 'Medicamentos (farmácia, remédios)', tipo: 'Variável' },
        { nome: 'Terapia', tipo: 'Fixo' },
        { nome: 'Outros', tipo: 'Variável' },
      ] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Transporte', subcategorias: [
        { nome: 'Seguro de carro', tipo: 'Fixo' },
        { nome: 'Combustível', tipo: 'Variável' },
        { nome: 'Lavagem', tipo: 'Variável' },
        { nome: 'IPVA', tipo: 'Fixo' },
        { nome: 'Mecânico', tipo: 'Variável' },
        { nome: 'Estacionamento / pedágio', tipo: 'Variável' },
        { nome: 'Transporte (ônibus, metrô, taxi, UBER)', tipo: 'Variável' },
        { nome: 'Passagem de Avião', tipo: 'Variável' },
        { nome: 'Outros', tipo: 'Variável' },
      ] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Educação', subcategorias: [
        { nome: 'Escola', tipo: 'Fixo' },
        { nome: 'Cursos', tipo: 'Variável' },
        { nome: 'Faculdade', tipo: 'Fixo' },
        { nome: 'Seminário', tipo: 'Variável' },
        { nome: 'Livro', tipo: 'Variável' },
        { nome: 'Outros', tipo: 'Variável' },
      ] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Despesas Pessoais', subcategorias: [
        { nome: 'Higiene Pessoal', tipo: 'Variável' },
        { nome: 'Barbeiro, cabeleireiro, manicure', tipo: 'Variável' },
        { nome: 'Vestuário', tipo: 'Variável' },
        { nome: 'Academia', tipo: 'Fixo' },
        { nome: 'Seguro de Vida', tipo: 'Fixo' },
        { nome: 'Lazer', tipo: 'Variável' },
        { nome: 'Diversos', tipo: 'Variável' },
      ] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Doação', subcategorias: [
        { nome: 'Instituição Religiosa', tipo: 'Fixo' },
        { nome: 'Outros', tipo: 'Variável' },
      ] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Merecimento', subcategorias: [
        { nome: 'Dinheiro', tipo: 'Variável' },
        { nome: 'Lazer', tipo: 'Variável' },
        { nome: 'Diversos', tipo: 'Variável' },
      ] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Financiamento / Empréstimo', subcategorias: [
        { nome: 'Financiamento', tipo: 'Fixo' },
        { nome: 'Empréstimo', tipo: 'Fixo' },
        { nome: 'Consórcio', tipo: 'Fixo' },
        { nome: 'IR (Pagamento - DARF)', tipo: 'Variável' },
        { nome: 'Outros', tipo: 'Variável' },
      ] },
      { id: _uid(), tipoOperacao: 'DESPESA', categoria: 'Compras Evitadas', subcategorias: [
        { nome: 'Bolão', tipo: 'Variável' },
        { nome: 'Diversos', tipo: 'Variável' },
      ] },
    ];
    _seedIfEmpty(`pcf_categorias_${userId}`, cats);

    // Emoções config padrão
    const emoConfig = [
      { id: _uid(), nome: 'Feliz', cor: '#16a34a', icon: '😊', medias: [
        { id: _uid(), nome: 'Contente', cor: '#22c55e', inferiores: [{ id: _uid(), nome: 'Livre', cor: '#4ade80' }, { id: _uid(), nome: 'Alegre', cor: '#4ade80' }] },
        { id: _uid(), nome: 'Animado', cor: '#22c55e', inferiores: [{ id: _uid(), nome: 'Curioso', cor: '#4ade80' }, { id: _uid(), nome: 'Entusiasmado', cor: '#4ade80' }, { id: _uid(), nome: 'Interessado', cor: '#4ade80' }] },
        { id: _uid(), nome: 'Confiante', cor: '#22c55e', inferiores: [{ id: _uid(), nome: 'Bem-sucedido', cor: '#4ade80' }, { id: _uid(), nome: 'Abençoado', cor: '#4ade80' }] },
        { id: _uid(), nome: 'Aceito', cor: '#22c55e', inferiores: [{ id: _uid(), nome: 'Respeitado', cor: '#4ade80' }, { id: _uid(), nome: 'Valorizado', cor: '#4ade80' }] },
        { id: _uid(), nome: 'Otimista', cor: '#22c55e', inferiores: [{ id: _uid(), nome: 'Esperançoso', cor: '#4ade80' }, { id: _uid(), nome: 'Agradecido (Grato)', cor: '#4ade80' }] },
      ]},
      { id: _uid(), nome: 'Surpreso', cor: '#f59e0b', icon: '😲', medias: [
        { id: _uid(), nome: 'Assustado', cor: '#fbbf24', inferiores: [{ id: _uid(), nome: 'Chocado', cor: '#fcd34d' }, { id: _uid(), nome: 'Desanimado', cor: '#fcd34d' }] },
        { id: _uid(), nome: 'Confuso', cor: '#fbbf24', inferiores: [{ id: _uid(), nome: 'Desiludido', cor: '#fcd34d' }, { id: _uid(), nome: 'Perplexo', cor: '#fcd34d' }] },
        { id: _uid(), nome: 'Maravilhado', cor: '#fbbf24', inferiores: [{ id: _uid(), nome: 'Atônito', cor: '#fcd34d' }, { id: _uid(), nome: 'Admirado', cor: '#fcd34d' }] },
        { id: _uid(), nome: 'Animado', cor: '#fbbf24', inferiores: [{ id: _uid(), nome: 'Entusiasmado', cor: '#fcd34d' }, { id: _uid(), nome: 'Energético', cor: '#fcd34d' }] },
      ]},
      { id: _uid(), nome: 'Mal', cor: '#6b7280', icon: '😰', medias: [
        { id: _uid(), nome: 'Entediado', cor: '#9ca3af', inferiores: [{ id: _uid(), nome: 'Indiferente', cor: '#d1d5db' }, { id: _uid(), nome: 'Apático', cor: '#d1d5db' }] },
        { id: _uid(), nome: 'Ocupado', cor: '#9ca3af', inferiores: [{ id: _uid(), nome: 'Pressionado', cor: '#d1d5db' }, { id: _uid(), nome: 'Apressado', cor: '#d1d5db' }] },
        { id: _uid(), nome: 'Estressado', cor: '#9ca3af', inferiores: [{ id: _uid(), nome: 'Sobrecarregado', cor: '#d1d5db' }, { id: _uid(), nome: 'Fora de Controle', cor: '#d1d5db' }] },
        { id: _uid(), nome: 'Cansado', cor: '#9ca3af', inferiores: [{ id: _uid(), nome: 'Com sono', cor: '#d1d5db' }, { id: _uid(), nome: 'Desconcentrado', cor: '#d1d5db' }] },
      ]},
      { id: _uid(), nome: 'Triste (Tristeza)', cor: '#3b82f6', icon: '😢', medias: [
        { id: _uid(), nome: 'Entristecido', cor: '#60a5fa', inferiores: [{ id: _uid(), nome: 'Desanimado', cor: '#93c5fd' }, { id: _uid(), nome: 'Abatido', cor: '#93c5fd' }, { id: _uid(), nome: 'Desesperançoso', cor: '#93c5fd' }] },
        { id: _uid(), nome: 'Solitário', cor: '#60a5fa', inferiores: [{ id: _uid(), nome: 'Isolado', cor: '#93c5fd' }, { id: _uid(), nome: 'Abandonado', cor: '#93c5fd' }] },
        { id: _uid(), nome: 'Vulnerável', cor: '#60a5fa', inferiores: [{ id: _uid(), nome: 'Frágil', cor: '#93c5fd' }, { id: _uid(), nome: 'Vitimizado', cor: '#93c5fd' }] },
        { id: _uid(), nome: 'Culpado', cor: '#60a5fa', inferiores: [{ id: _uid(), nome: 'Arrependido', cor: '#93c5fd' }, { id: _uid(), nome: 'Envergonhado', cor: '#93c5fd' }] },
        { id: _uid(), nome: 'Deprimido', cor: '#60a5fa', inferiores: [{ id: _uid(), nome: 'Vazio', cor: '#93c5fd' }, { id: _uid(), nome: 'Inferior', cor: '#93c5fd' }] },
        { id: _uid(), nome: 'Magoado', cor: '#60a5fa', inferiores: [{ id: _uid(), nome: 'Decepcionado', cor: '#93c5fd' }, { id: _uid(), nome: 'Traído', cor: '#93c5fd' }] },
      ]},
      { id: _uid(), nome: 'Temeroso (Medo)', cor: '#8b5cf6', icon: '😨', medias: [
        { id: _uid(), nome: 'Assustado', cor: '#a78bfa', inferiores: [{ id: _uid(), nome: 'Apavorado', cor: '#c4b5fd' }, { id: _uid(), nome: 'Aterrorizado', cor: '#c4b5fd' }] },
        { id: _uid(), nome: 'Ansioso', cor: '#a78bfa', inferiores: [{ id: _uid(), nome: 'Sobrecarregado', cor: '#c4b5fd' }, { id: _uid(), nome: 'Preocupado', cor: '#c4b5fd' }] },
        { id: _uid(), nome: 'Inseguro', cor: '#a78bfa', inferiores: [{ id: _uid(), nome: 'Inadequado', cor: '#c4b5fd' }, { id: _uid(), nome: 'Inferiorizado', cor: '#c4b5fd' }] },
        { id: _uid(), nome: 'Rejeitado', cor: '#a78bfa', inferiores: [{ id: _uid(), nome: 'Excluído', cor: '#c4b5fd' }, { id: _uid(), nome: 'Perseguido', cor: '#c4b5fd' }] },
      ]},
      { id: _uid(), nome: 'Irritado (Raiva - Irritação)', cor: '#dc2626', icon: '😠', medias: [
        { id: _uid(), nome: 'Crítico', cor: '#ef4444', inferiores: [{ id: _uid(), nome: 'Cético', cor: '#f87171' }, { id: _uid(), nome: 'Sarcástico', cor: '#f87171' }] },
        { id: _uid(), nome: 'Frustrado', cor: '#ef4444', inferiores: [{ id: _uid(), nome: 'Infurioso', cor: '#f87171' }, { id: _uid(), nome: 'Irritadiço', cor: '#f87171' }] },
        { id: _uid(), nome: 'Distante', cor: '#ef4444', inferiores: [{ id: _uid(), nome: 'Indiferente', cor: '#f87171' }, { id: _uid(), nome: 'Reservado', cor: '#f87171' }] },
        { id: _uid(), nome: 'Agressivo', cor: '#ef4444', inferiores: [{ id: _uid(), nome: 'Provocado', cor: '#f87171' }, { id: _uid(), nome: 'Hostil', cor: '#f87171' }] },
        { id: _uid(), nome: 'Desgostoso (Desgosto)', cor: '#ef4444', inferiores: [{ id: _uid(), nome: 'Revoltado (Revolta)', cor: '#f87171' }, { id: _uid(), nome: 'Desesperado (Desespero)', cor: '#f87171' }] },
        { id: _uid(), nome: 'Zangado (Irritação)', cor: '#ef4444', inferiores: [{ id: _uid(), nome: 'Chateado', cor: '#f87171' }, { id: _uid(), nome: 'Impaciente (Paciência)', cor: '#f87171' }] },
      ]},
      { id: _uid(), nome: 'Amoroso (Amor)', cor: '#d33ecb', icon: '🥰', medias: [
        { id: _uid(), nome: 'Afetuoso (Afeto)', cor: '#ff00f2', inferiores: [{ id: _uid(), nome: 'Carinhoso (Carinho)', cor: '#f885f2' }, { id: _uid(), nome: 'Compaixão', cor: '#f885f2' }, { id: _uid(), nome: 'Cuidado', cor: '#f885f2' }] },
        { id: _uid(), nome: 'Desejoso (Desejo)', cor: '#ff00f2', inferiores: [{ id: _uid(), nome: 'Apaixonado (Paixão)', cor: '#f885f2' }, { id: _uid(), nome: 'Fascínio', cor: '#f885f2' }] },
        { id: _uid(), nome: 'Pacífico (Paz)', cor: '#ff00f2', inferiores: [{ id: _uid(), nome: 'Pleno (Plenitude)', cor: '#f885f2' }, { id: _uid(), nome: 'Livre (Liberdade)', cor: '#f885f2' }] },
        { id: _uid(), nome: 'Admirado (Admiração)', cor: '#ff00f2', inferiores: [{ id: _uid(), nome: 'Inspirado (Inspiração)', cor: '#f885f2' }, { id: _uid(), nome: 'Romântico', cor: '#f885f2' }] },
      ]},
    ];
    _cache['pcf_emocoes_catalogo_codigo'] = _modeloEmocoesSemIds(emoConfig);
    const emocoesPublicadas = _cache['pcf_emocoes_defaults'];
    _seedIfEmpty(
      `pcf_emocoes_config_${userId}`,
      Array.isArray(emocoesPublicadas) ? _criarEmocoesDoModelo(emocoesPublicadas) : emoConfig
    );

    _seedIfEmpty(`pcf_habitos_${userId}`, _criarHabitosDoModelo());

    // Virtudes padrão (Tabela das Virtudes — Peterson & Seligman + virtudes cristãs/estoicas)
    const virtudes = [
      { id: _uid(), nome: 'Criatividade', significado: 'Pensar em formas novas e produtivas de conceituar e fazer as coisas.', categoria: 'Sabedoria', cor: '#8b5cf6', icone: '💡', ativo: true },
      { id: _uid(), nome: 'Curiosidade', significado: 'Interessar-se pela experiência em andamento por si só.', categoria: 'Sabedoria', cor: '#7c3aed', icone: '🔍', ativo: true },
      { id: _uid(), nome: 'Senso Crítico', significado: 'Refletir sobre as coisas e examiná-las a partir de todos os ângulos.', categoria: 'Sabedoria', cor: '#6d28d9', icone: '🧠', ativo: true },
      { id: _uid(), nome: 'Amor ao Aprendizado', significado: 'Dominar novas habilidades, tópicos e corpos de conhecimento.', categoria: 'Sabedoria', cor: '#5b21b6', icone: '📚', ativo: true },
      { id: _uid(), nome: 'Perspectiva', significado: 'Ser capaz de dar conselhos sábios aos outros.', categoria: 'Sabedoria', cor: '#4c1d95', icone: '🔭', ativo: true },
      { id: _uid(), nome: 'Bravura', significado: 'Não recuar diante de ameaças, dificuldades ou sofrimento.', categoria: 'Coragem', cor: '#dc2626', icone: '🦁', ativo: true },
      { id: _uid(), nome: 'Perseverança', significado: 'Terminar o que se começou; persistir apesar dos obstáculos.', categoria: 'Coragem', cor: '#b91c1c', icone: '🏅', ativo: true },
      { id: _uid(), nome: 'Integridade', significado: 'Falar a verdade e apresentar-se de forma genuína.', categoria: 'Coragem', cor: '#991b1b', icone: '⚖️', ativo: true },
      { id: _uid(), nome: 'Vitalidade', significado: 'Encarar a vida com entusiasmo e energia; viver plenamente.', categoria: 'Coragem', cor: '#7f1d1d', icone: '⚡', ativo: true },
      { id: _uid(), nome: 'Amor', significado: 'Valorizar relacionamentos íntimos com solidariedade e cuidado mútuo.', categoria: 'Humanidade', cor: '#ec4899', icone: '❤️', ativo: true },
      { id: _uid(), nome: 'Generosidade', significado: 'Ajudar, cuidar, fazer boas ações e favores.', categoria: 'Humanidade', cor: '#db2777', icone: '🎁', ativo: true },
      { id: _uid(), nome: 'Inteligência Social', significado: 'Estar ciente dos próprios sentimentos e motivações, bem como dos outros.', categoria: 'Humanidade', cor: '#be185d', icone: '🤝', ativo: true },
      { id: _uid(), nome: 'Trabalho em Equipe', significado: 'Trabalhar bem como membro de um grupo; ser leal ao grupo.', categoria: 'Justiça', cor: '#16a34a', icone: '👥', ativo: true },
      { id: _uid(), nome: 'Imparcialidade', significado: 'Tratar todas as pessoas segundo noções de imparcialidade e justiça.', categoria: 'Justiça', cor: '#15803d', icone: '🏛️', ativo: true },
      { id: _uid(), nome: 'Liderança', significado: 'Estimular um grupo do qual se é membro para fazer as coisas.', categoria: 'Justiça', cor: '#166534', icone: '🌟', ativo: true },
      { id: _uid(), nome: 'Perdão', significado: 'Perdoar os que erraram; aceitar as falhas dos outros.', categoria: 'Moderação', cor: '#0ea5e9', icone: '🕊️', ativo: true },
      { id: _uid(), nome: 'Humildade', significado: 'Deixar que suas realizações falem por si.', categoria: 'Moderação', cor: '#0284c7', icone: '🙏', ativo: true },
      { id: _uid(), nome: 'Prudência', significado: 'Ser cuidadoso em relação às próprias escolhas; não correr riscos indevidos.', categoria: 'Moderação', cor: '#0369a1', icone: '🛡️', ativo: true },
      { id: _uid(), nome: 'Autocontrole', significado: 'Regular o que se sente e faz; ser disciplinado.', categoria: 'Moderação', cor: '#075985', icone: '🧘', ativo: true },
      { id: _uid(), nome: 'Gratidão', significado: 'Estar ciente e agradecido pelas coisas boas; demonstrar emoção positiva.', categoria: 'Transcendência', cor: '#f59e0b', icone: '🌸', ativo: true },
      { id: _uid(), nome: 'Esperança', significado: 'Esperar o melhor no futuro e trabalhar para atingi-lo.', categoria: 'Transcendência', cor: '#d97706', icone: '🌈', ativo: true },
      { id: _uid(), nome: 'Humor', significado: 'Levar sorrisos às outras pessoas; levar a vida de forma mais leve.', categoria: 'Transcendência', cor: '#b45309', icone: '😄', ativo: true },
      { id: _uid(), nome: 'Espiritualidade', significado: 'Ter crenças coerentes em relação ao propósito e sentido maiores do universo.', categoria: 'Transcendência', cor: '#92400e', icone: '✨', ativo: true },
      { id: _uid(), nome: 'Apreciação da Beleza', significado: 'Observar e apreciar a beleza, a excelência e o desempenho habilidoso.', categoria: 'Transcendência', cor: '#78350f', icone: '🌺', ativo: true },
      { id: _uid(), nome: 'Paciência', significado: 'Manter a calma e serenidade diante de adversidades e demoras.', categoria: 'Paz', cor: '#06b6d4', icone: '⏳', ativo: true },
      { id: _uid(), nome: 'Compaixão', significado: 'Sentir e agir com empatia e altruísmo em relação ao sofrimento alheio.', categoria: 'Humanidade', cor: '#14b8a6', icone: '💞', ativo: true },
      { id: _uid(), nome: 'Honestidade', significado: 'Ser fiel à verdade em palavras e ações.', categoria: 'Coragem', cor: '#10b981', icone: '🔑', ativo: true },
      { id: _uid(), nome: 'Respeito', significado: 'Reconhecer e valorizar a dignidade de cada pessoa.', categoria: 'Justiça', cor: '#059669', icone: '🤲', ativo: true },
      { id: _uid(), nome: 'Solidariedade', significado: 'Apoiar e se unir às outras pessoas nas dificuldades.', categoria: 'Humanidade', cor: '#047857', icone: '🤗', ativo: true },
      { id: _uid(), nome: 'Fé', significado: 'Manter fidelidade e confiança nos valores e em Deus.', categoria: 'Transcendência', cor: '#065f46', icone: '🌠', ativo: true },
    ];
    _seedIfEmpty(`pcf_virtudes_config_${userId}`, virtudes);

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
      { id: _uid(), texto: 'O sucesso é a soma de pequenos esforços repetidos dia após dia.', autor: 'Robert Collier', categoria: 'Motivação', ativo: true },
    { id: _uid(), texto: 'Você não precisa ser ótimo para começar, mas precisa começar para ser ótimo.', autor: 'Zig Ziglar', categoria: 'Motivação', ativo: true },
    { id: _uid(), texto: 'Cuide do seu corpo. É o único lugar que você tem para viver.', autor: 'Jim Rohn', categoria: 'Saúde', ativo: true },
    { id: _uid(), texto: 'A disciplina é a ponte entre metas e realizações.', autor: 'Jim Rohn', categoria: 'Produtividade', ativo: true },
    { id: _uid(), texto: 'Pequenas ações diárias constroem grandes resultados ao longo do tempo.', autor: '', categoria: 'Motivação', ativo: true },
    { id: _uid(), texto: 'Não importa o quão devagar você vá, desde que não pare.', autor: 'Confúcio', categoria: 'Motivação', ativo: true },
    { id: _uid(), texto: 'A saúde é a maior riqueza que um homem pode possuir.', autor: 'Virgílio', categoria: 'Saúde', ativo: true },
    { id: _uid(), texto: 'Invista em você mesmo. Seu retorno é garantido.', autor: '', categoria: 'Finanças', ativo: true },
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
    { id: _uid(), texto: '“A matemática é o alfabeto com o qual Deus escreveu o universo.” Galileu Galilei (1564-1642)).', autor: 'Galileu Galilei', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Ajuda-te que Deus te ajudará.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Coincidência é a maneira que Deus encontrou para permanecer no anonimato.” (Albert Einstein (1879-1955)).', autor: 'Albert Einstein', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Com Deus, até os ventos sopram a favor.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Com Deus na frente, tudo dá certo.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus abre portas onde não há paredes.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus ajuda quem cedo madruga. Quem madruga Deus ajuda. Significado: Quem acorda cedo e se esforça pelos seus sonhos, pode contar com as bênçãos de Deus. Pessoas determinadas, que acordam cedo para trabalhar ou estudar, conseguem seus objetivos. Fazer por merecer. O esforço e a dedicação são abençoados por Deus.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus conhece o coração.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus é justo, mas não é apressado.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus é pai, e pai não abandona.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus é pai, não é padrasto. Significado: Deus é justo e misericordioso com todos.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus escreve certo por linhas tortas. Significado: De algum modo tudo vai dar certo, vai se resolver. Mesmo quando não entendemos os caminhos da vida, Deus tem um propósito.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus me de paciência e um pano para a embrulhar.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus não dá um fardo maior do que podemos carregar. Significado: Fé de que tudo o que enfrentamos é suportável com a ajuda divina.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus não fecha uma porta sem abrir outra.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus não dorme. Significado: Nada escapa do olhar divino.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus não erra de endereço.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus não escolhe os capacitados, capacita os escolhidos.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Deus não joga dados.” (Albert Einstein (1879-1955)).', autor: 'Albert Einstein', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus no comando. Significado: Forma simples de afirmar que tudo está nas mãos de Deus.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus nunca fechou uma porta que não abrisse outra.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus protege os seus. Significado: Confiança na proteção divina sobre quem crê.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus sabe o que faz. Significado: Confiança na sabedoria divina mesmo em momentos difíceis.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus sabe o que faz, a gente não sabe o que diz. ', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus sabe o que faz, mesmo quando a gente não entende.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus tarda, mas capricha. Significado: Deus sempre traz o melhor. Tudo no tempo Dele.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus tarda, mas não falha. Significado: Pode parecer que Deus demora, mas Ele sempre cumpre Sua vontade. Tudo acontece no tempo certo, ainda que pareça demorar. Enfatiza a justiça divina e a lei do retorno, mesmo que demore. Similar: Quem com ferro fere, com ferro será ferido.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus vê tudo. Significado: Nada passa despercebido aos olhos divinos.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus me livre e guarde! Significado: Uma exclamação para afastar o mal ou algo indesejável.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Entrego, confio, aceito e agradeço. Significado: Expressão moderna baseada na fé e confiança em Deus.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Entrega na mão de Deus que Ele resolve.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Humildade. É o perfume cujo o aroma é o mais agradável a Deus.” (Hian Henri).', autor: 'Hian Henri', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'O futuro a Deus pertence.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'O pouco com Deus é muito, o muito sem Deus é nada.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'O que você é, é um presente de Deus para você. O que você faz consigo é um presente seu para Deus.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Para Deus nada é impossível. Significado: Crença no poder ilimitado de Deus. Expressa a onipotência divina e a fé na capacidade de Deus de realizar o extraordinário.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Quando damos um passo na direção de Deus, ele dá sete passos em nossa direção. (Provérbio Hindu).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando Deus fecha uma porta, abre uma janela. Significado: Mesmo diante de dificuldades, há sempre uma nova oportunidade.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando Deus quer, ninguém impede.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando você ama, você não deve dizer: “Deus está no meu coração”, mas sim, ‘eu estou no coração de Deus.’ (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem confia em Deus, não teme o amanhã.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem tem Deus, tem tudo. Significado: A presença de Deus basta, independentemente das circunstâncias.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se Deus é por nós, quem será contra nós? Significado: Citação bíblica muito usada como ditado de fé e força.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se for da vontade de Deus, até o impossível acontece. Se Deus quiser... Significado: Uma expressão de esperança e resignação, indicando que o futuro está nas mãos divina.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se não se vai a Deus pelo amor vai-se pela dor.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O amor é um jacaré no rio do desejo. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A ação tem um impacto mais poderoso do que a palavra. (Provérbio Alemão).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A afeição cega a razão. Significado: O carinho que temos pelo outro faz com que a gente não use a consciência.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A água sempre descobre um meio. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A alegria atrai simpatia.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A alegria não está nas coisas, está em nós.” (Johann Wolfgang Von Göethe (1749-1832)).', autor: 'Johann Wolfgang Von Göethe', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A amizade é um caminho que desaparece se não pisado constantemente. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A amizade só faz sentido se traz o céu para mais perto.” (Francisco Cândido Xavier).', autor: 'Francisco Cândido Xavier', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A arrogância vem antes da queda. (Provérbio Alemão).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A árvore não prova a doçura dos próprios frutos; o rio não bebe suas próprias ondas; as nuvens não despejam água sobre si mesmas. A força dos bons deve ser usada para benefício de todos. (Provérbio Hindu).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A árvore não nega sua sombra nem ao lenhador. (Provérbio Hindu).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A árvore quando está sendo cortada, observa com tristeza que o cabo do machado é de madeira.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A árvore que enverga o vento não quebra.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A atividade é mãe da prosperidade.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A beleza não está na cara; a beleza é uma luz no coração. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A beleza que você vê nas coisas é um reflexo da beleza que existe em você.” (Provérbio Árabe).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'As boas coisas vêm quando estamos distraídos. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A caridade é amor, amor é compreensão... (Francisco Cândido Xavier).', autor: 'Francisco Cândido Xavier', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A compaixão para com os animais é das mais nobres virtudes da natureza humana.” (Charles Darwin (1809-1882)).', autor: 'Charles Darwin', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A consciência tranquila é o melhor remédio contra insônia.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A consciência tranquila é o melhor travesseiro.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A coragem é o medo vencido. (Provérbio Popular).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A dor é inevitável, enquanto o sofrimento é opcional.” (Buda).', autor: 'Buda', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A dor é passageira, mas a luz que você irradia permanece. Continue semeando o bem.” (Joanna de Ângelis).', autor: 'Joanna de Ângelis', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A dúvida é o começo da sabedoria.” (Galileu Galilei (1564-1642)).', autor: 'Galileu Galilei', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A esperança é a última que morre.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A esperança é o sonho do homem acordado” (Aristóteles).', autor: 'Aristóteles', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A experiência é uma lanterna dependurada nas costas que apenas ilumina o caminho já percorrido. (Confúcio).', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '"A falta de amor é a maior de todas as pobrezas." (Madre Teresa de Calcutá).', autor: 'Madre Teresa de Calcutá', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A felicidade é algo que se multiplica quando se divide.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A felicidade não entra em portas trancadas.” (Francisco Cândido Xavier).', autor: 'Francisco Cândido Xavier', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A felicidade não está nas coisas, mas no coração do homem. (Provérbio Alemão).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A felicidade não se resume na ausência de problemas, mas sim na sua capacidade de lidar com eles.” (Albert Einstein (1879-1955)).', autor: 'Albert Einstein', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A fragrância sempre permanece na mão de quem oferece flores. (Hadia Bejar).', autor: 'Hadia Bejar', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A gente colhe o que semeia. “Aquilo que o homem semear, isso também ceifará” (Gálatas, 6:7).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A gente todos os dias arruma os cabelos: por que não o coração? (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A gente tropeça nas pedras pequenas, porque as grandes a gente logo enxerga. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A hora mais escura do dia é a que vem antes do sol nascer.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A imaginação é tudo, é uma visão antecipada das atrações da vida que virá.” (Albert Einstein).', autor: 'Albert Einstein', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A inconstância e o amor são incompatíveis. O amante que muda, não muda. Começa ou acaba de amar. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A instrução é a luz do espírito.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A justiça tarda, mas não falha.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A longa viagem começa por um passo.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A luz com que vês os outros, é a luz com que os outros te vêem a ti. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A melhor defesa é o ataque. Ressignificação: A melhor defesa é o amor.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A melhor maneira de ser feliz é contribuir para a felicidade dos outros. (Confúcio).', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A mente é tudo: o que você pensa, você se torna.” (Ditado Zen). Significado: Pensamentos moldam sua realidade. Cultive a consciência para transformar a forma como você vive.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A mente que se abre para alguma coisa nova, nunca mais será a mesma.” (Albert Einstein (1879-1955)).', autor: 'Albert Einstein', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A morte deixa uma mágoa que ninguém pode curar, o amor deixa uma memória que ninguém pode roubar. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A morte é mais leve que uma pluma. A responsabilidade de viver é mais pesada que uma montanha. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A necessidade é a mãe das invenções. Significado: Quando precisamos, logo encontramos formas de fazer acontecer.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A neve e as tempestades matam as flores, mas nada podem contra as sementes. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A noite é boa conselheira.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A ocasião faz o homem.” (José de Alencar (1829-1877)).', autor: 'José de Alencar', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A ociosidade é mãe de todos os vícios.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A ousadia leva ao êxito. (Provérbio Judeu).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A palavra é de prata e o silêncio é de ouro.” (Provérbio Árabe).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A paz vem de dentro de você mesmo. Não a procure à sua volta.” (Buda).', autor: 'Buda', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A persistência é o caminho do êxito.” (Charles Chaplin (1889-1977)).', autor: 'Charles Chaplin', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A persistência realiza o impossível. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A pessoa que ama os outros também será amada. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A pior derrota é de quem desanima. Não desanime jamais. Perder nem sempre é ser derrotado.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A prática faz a perfeição.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A preguiça é a mãe de todos os vícios.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A pressa é inimiga da perfeição. Significado: A necessidade da paciência e fazer as coisas sem pressa para alcançar os objetivos.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A quem mais amamos, menos sabemos falar. (Provérbio Inglês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A realidade é criada pela mente. Nós podemos mudar a realidade mudando a nossa mente.” (Platão).', autor: 'Platão', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A repetição deixa sua marca até nas pedras. (Provérbio Árabe).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A reputação de mil anos pode ser determinada na conduta de uma hora. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“A semeadura é livre, mas a colheita é obrigatória.” (Gálatas, 6:7).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A simplicidade é o último degrau da sabedoria. (Khalil Gibran). ', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A união faz a força.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A verdade de outra pessoa não está no que ela te revela, mas naquilo que não pode revelar-te. Portanto, se quiseres compreendê-la, não escute o que ela diz, mas antes, o que ela não diz. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A verdade fala pela boca dos pequenos.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A vida é como um espelho, quando sorrimos para ela, ela sorri para nós.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A vida dura uma geração, um bom nome dura para sempre. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A vida é um quebra-cabeça e eu testo as peças uma por uma, independente do formato.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A vida é uma caixinha de surpresas. Significado: Indica que a vida é imprevisível e cheia de acontecimentos inesperados, tanto bons quanto ruins.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A vida é uma batalha que se deve transformar em festa. (Provérbio Francês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A vida pode ser, de fato, escuridão se não houver vontade. Mas a vontade é cega se não houver sabedoria, a sabedoria é vã se não houver trabalho, e o trabalho é vazio se não houver amor. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O perdão é a melhor opção.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A virtude é uma joia que não tem preço. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A vitória do espírito origina-se da compreensão de que a vida não é o corpo, da mesma forma que a água não é o copo que a contém. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Abrindo os olhos se aprende mais do que abrindo a boca. Significado: Aprenda a ver antes de falar. Seja tardio para falar e pronto para ouvir.” (Tiago 1:19). E é exatamente aí que mora a sabedoria: quem observa mais, fala com mais verdade… quem escuta mais, aprende com mais profundidade. A vida ensina silenciosamente. Quando observamos com atenção, evitamos erros, entendemos melhor as pessoas e ouvimos o que Deus quer nos mostrar. É no silêncio atento que a maturidade nasce.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Achei que convinha mais correr perigo com o que era justo do que, por medo da morte e do cárcere, concordar com o injusto”. (Sócrates).', autor: 'Sócrates', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Acima de tudo guarda o teu coração, porque dele procedem as fontes da vida.” (Provérbios, 4:23). Significado: O coração é o fundamento de nossa vida espiritual. O sentimento é o manancial, a nascente da vida. Cuidemos dos nossos sentimentos.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Ações em vez das palavras. (Provérbio Alemão).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: ' “Acordar da morte, voltar pra vida.” (Ditado Japonês). Significado: O seu conceito talvez seja encontrado neste ditado popular “Ressurgir das cinzas”. Implica naqueles que chegaram lá no fundo, conseguiram dar uma reviravolta e se ergueram de forma positiva.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Acorde da morte, retorne à vida. (Provérbio Japonês). Significado: Representa sair de um estado de dormência, escuridão, sofrimento, desânimo ou vazio existencial e reconectar-se com o propósito, com a consciência plena, com a energia vital e a vontade de viver. Outras versões inspiradoras, poéticas e motivacionais: “Desperte das sombras que te apagaram - há sempre um caminho de volta à luz.” e “Depois da queda, vem o reerguimento. Toda dor pode ser o solo de um novo florescer.”', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Adversidade é o fundamento da virtude. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Adversidades são grandes oportunidades.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Água mole em pedra dura tanto bate até que fura. Significado: A persistência para conseguir o que se deseja. A insistência contribui para que o improvável aconteça.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Águas mansas não fazem bons marinheiros. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Águas passadas não movem moinho. Significado: Para mostrar que situações vividas no passado não ajudam a modificar o presente. O que passou, passou, e que não é possível mudar o passado. Aconselha a não se prender ao passado ou a problemas que já foram superados, focando no presente.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Ainda que sejas prudente e velho, não desprezes o conselho.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Aja antes de falar e, portanto, fale de acordo com os seus atos. (Confúcio).', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Alegria compartilhada é alegria em dobro. Tristeza compartilhada é tristeza pela metade. (Provérbio Sueco).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Alegria partilhada é alegria dobrada; tristeza partilhada é tristeza dividida pela metade. (Provérbio Sueco).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Alguns são tidos como corajosos só porque tiveram medo de sair correndo.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Amar não é olhar um para o outro, é olhar juntos na mesma direção.” (Antoine de Saint-Exupéry (1900-1944)).', autor: 'Antoine de Saint-Exupéry', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Amar não é querer alguém construído, mas construir alguém querido.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Amigo certo se reconhece numa situação incerta.” (Cícero (220aC-126aC)).', autor: 'Cícero', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Amar sem esperar ser amado e sem aguardar recompensa alguma.” (Francisco Cândido Xavier).', autor: 'Francisco Cândido Xavier', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Amigo é coisa para se guardar debaixo de sete chaves. (Milton Nascimento).', autor: 'Milton Nascimento', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Amigos, amigos, negócios a parte. Significado: Amizades podem ser abaladas quando há dinheiro envolvido. Não é bom misturar as coisas. ', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Amor com amor se paga.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Ao erguemos a vista, não vemos fronteiras. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Ao que tem fome dá teu pão, mas ao triste dá-lhe o coração.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Aprenda a viver e saberás morrer. (Provérbio Alemão).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Aprenda uma lição por dia. Em um ano terá aprendido 365 lições. (Ditado Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Aquele que entende o sofrimento vê o mundo com mais clareza.” (Buda).', autor: 'Buda', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Aquele que faz e promove o bem cultiva o seu próprio êxito. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Aquele que não conhece a verdade é simplesmente um ignorante, mas aquele que a conhece e diz que é mentira, este é um criminoso.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Aquele que não cultiva seu campo, morre de fome. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Aquele que ri ao invés de enfurecer-se é sempre o mais forte. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Aquele que tenta sacudir o tronco de uma árvore sacode somente a si mesmo. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Aquilo a que você resiste, persiste.” (Carl Jung).', autor: 'Carl Jung', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Aquilo que não gosto em ti, corrijo em mim.” (Buda).', autor: 'Buda', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Árvore plantada com amor ninguém derruba. Uma verdadeira amizade também. Quem planta árvores cria raízes. Quem cultiva amizades também. (Ditado Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“As correntes de ouro prendem tanto quanto as algemas de bronze.” (André Luiz/Chico Xavier). Significado: Cuidado com o apego. Liberte sua alma.', autor: 'Francisco Cândido Xavier', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'As árvores mais antigas dão os frutos mais doces. (Provérbio Alemão).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'As boas contas fazem os bons amigos.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'As dificuldades são como as montanhas. Elas só se aplainam quando avançamos sobre elas. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'As feridas do coração, como as do corpo, mesmo quando saram, deixam cicatrizes. (Saadi - Poeta Persa).', autor: 'Saadi - Poeta Persa', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'As grandes dores são mudas. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'As lágrimas são as últimas palavras quando o coração perde a voz. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '"As mãos que ajudam são mais sagradas que os lábios que rezam." (Madre Teresa de Calcutá).', autor: 'Madre Teresa de Calcutá', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'As palavras cortam mais do que as espadas. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'As pessoas que espalham amor, não têm tempo nem disposição para jogar pedras. (Irmã Dulce).', autor: 'Irmã Dulce', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Às vezes, tudo que precisamos é de uma frase certa, no momento certo. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'As pessoas que te amam são as que mais sofrem.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Assim como as pedras são polidas por atrito, as provações tornam os homens brilhantes. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Bem que se faz na véspera torna se felicidade no dia seguinte. (Provérbio Hindu).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Bom conselho (boa palavra) custa pouco e vale muito.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Cada dia que amanhece assemelha-se a uma página em branco, na qual gravamos os nossos pensamentos, ações e atitudes. Na essência, cada dia é a preparação de nosso próprio amanhã. (Francisco Cândido Xavier).', autor: 'Francisco Cândido Xavier', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Cada manhã nós nascemos de novo. O que nós fazemos hoje é o que mais importa.” (Buda).', autor: 'Buda', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Cada um colhe o que planta. Significado: Enfatiza a lei de causa e efeito; as consequências de nossas ações (boas ou ruins) retornam para nós.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Cada um dá o que tem.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Cada um sabe onde lhe aperta o sapato. Significado: A dor é individual, e cada um sabe da sua. ', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Cada um sabe onde o calo dói.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Cada vez mais desesperadamente o homem procura dilatar o tempo que já não tem. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Caia sete vezes; levante-se oito. (Provérbio Japonês). Significado: Seja resiliente. Sempre se levante mais vezes do que cair.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Casa onde entra o sol, não entra o médico.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Cem homens podem formar um acampamento, mas é preciso uma mulher para se fazer um lar. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '⁠Certas coisas chamam a sua atenção, mas persiga apenas aquelas que capturam o coração. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Coloque a lealdade e a confiança acima de qualquer coisa; não te alies aos moralmente inferiores; não receies corrigir teus erros. (Confúcio).', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Com o coração em silêncio, ouça a natureza.” (Ditado Zen). Significado: A paz interior revela as verdades mais profundas.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Com tais amigos, ninguém necessita de inimigos. (Provérbio Alemão).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Com tempo tudo se cura.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Com um amigo do lado, nenhuma estrada é complicada demais. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Coma para viver, não vivas para comer.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Como o ferro afia o ferro, assim um amigo afia o outro.” (Provérbios 27:17). Significado: assim como uma lâmina se torna mais afiada quando friccionada contra outra, nós também crescemos e nos fortalecemos quando temos pessoas ao nosso lado que nos encorajam na fé.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Concentre-se na solução, não no problema.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Coragem é saber o que não temer.” (Platão).', autor: 'Platão', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Criança que não chora, não mama. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Dê a quem você ama: asas para voar, raízes para voltar e motivos para ficar.” (Dalai Lama).', autor: 'Dalai Lama', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'De manhã é que começa o dia.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'De nada adianta correr se estamos na estrada errada. (Provérbio Alemão).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'De nada vale tentar ajudar aqueles que não se ajudam a si mesmos. (Confúcio).', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'De que serviria a vida sem amor? (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Dê seu primeiro passo com fé, não é necessário que veja todo o caminho, só dê seu primeiro passo.” (Martin Luther King Jr.).', autor: 'Martin Luther King Jr.', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Dê tempo ao tempo.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Deixe algum sinal de alegria onde passe. (Francisco Cândido Xavier).', autor: 'Francisco Cândido Xavier', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Deixe ir ou seja arrastado.” (Ditado Zen). Significado: Apegar-se a emoções, dores ou ideias pode nos aprisionar. Soltar é libertar a mente e viver com leveza.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Depois da chuva, o solo endurece. (Ditado Japonês). Significado: As dificuldades fortalecem. Conflitos podem trazer estabilidade.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Depois da tempestade vem a bonança.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Devagar com o andor que o santo é de barro. Significado: Agir com calma é fundamental.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Devagar e sempre.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Devagar se vai ao longe. Significado: com paciência se chega ao sucesso, ao resultado almejado.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Deve existir algo estranhamente sagrado no sal: está em nossas lágrimas e no mar. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Difícil é ganhar um amigo em uma hora; fácil é ofendê-lo em um minuto. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Diz-me com quem andas e eu te direi quem és. Diga-me com quem andas, que lhe direi quem és. Significado: Nossas companhias dizem muito sobre nós mesmos. O caráter de uma pessoa pode ser definido pelo caráter das suas amizades.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Dinheiro perdido, nada perdido; Saúde perdida, muito perdido; Caráter perdido, tudo perdido. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Do sofrimento emergiram os espíritos mais fortes, as personalidades mais sólidas estão marcadas com cicatrizes. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'É dando que se recebe. Significado: Enfatiza a importância da generosidade e da reciprocidade nas relações e na vida.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'E disse o divino: ame a seu inimigo! E eu obedeci e amei a mim mesmo. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'E enquanto você reza, vá fazendo. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'É mais fácil aconselhar que praticar.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'É mais fácil vencer um mau hábito hoje do que amanhã. (Confúcio).', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'É muito fácil ser pedra, o difícil é ser vidraça. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'E não pense que você pode direcionar o curso do amor, se ele te achar digno, direciona seu curso. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'É nas subidas que se ganham as corridas.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“É sempre divertido fazer o impossível” (Walt Disney).', autor: 'Walt Disney', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Educação é que nem moeda de ouro, é válida no mundo todo.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Em vez de criticar, busca perdoar.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Em vez de julgar, busca perdoar.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Endireite o galho enquanto a árvore é nova.” (Provérbio Japonês). ', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Enquanto há vida, há esperança.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Ensinar o Dharma a Buda. (Ditado Japonês). Significado: Tentar ensinar algo a quem já é mestre nisso. (Inútil ou arrogante).', autor: 'Buda', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Entre o desejo e o alcance, apenas dois moradores: o esforço e a determinação (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Errar é humano, reconhecer o erro é uma virtude.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Eu espero que quando a morte vier te encontrar, te encontre vivo. (Provérbio Africano). Significado: A ideia é que tem gente que morre antes, enquanto existe. Viver é mais que existir, é encontrar-se com o bem e o belo da vida, consigo mesmo, é encontrar-se com o amor.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Eu não procuro saber as respostas, procuro compreender as perguntas. (Confúcio). Significado: A importância de entender a raiz das questões da vida.', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Eu não saberia dizer qual é esse poder, tudo o que sei é que ele existe.” (Graham Bell).', autor: 'Graham Bell', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Eu quero, eu posso, eu sou!.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Eu lavo as minhas mãos em relação àqueles que imaginam que falar seja conhecimento, que silêncio seja ignorância, e que simpatia seja capacidade. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Exige muito de ti e espera pouco dos outros. Assim, evitarás muitos aborrecimentos. (Confúcio).', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Faça o bem sem olhar a quem.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Falar mal dos outros é fácil, difícil e falar bem.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Fazer o bem e não olhar a quem. Significado: Não importa que seja rico ou pobre, você deve fazer o bem, sempre, em qualquer situação, com qualquer pessoa.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Felicidade é quando o que você pensa, o que você dia e o que você faz estão em harmonia.” (Gandhi).', autor: 'Gandhi', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Goze este dia porque é a vida. A própria vida da vida. Em seu breve transcurso, você encontrará todas as realidades e verdades da existência: a sorte do crescimento, o esplendor da criação, a glória do poder. Porque o ontem é só um sonho e o amanhã, só uma visão. Porque o hoje, bem vivido, faz do ontem um sonho de felicidade e, de cada manhã, uma visão de esperança. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Grandes almas sempre encontraram forte oposição de mentes medíocres.” (Albert Einstein (1879-1955)).', autor: 'Albert Einstein', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Guarde alguma coisa para os dias de chuva. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Guarde sua pedra, você também peca. Significado: É fácil apontar erros, criticar e julgar a vida do outro… mas antes de levantar a mão para acusar, lembre-se: todos nós temos falhas, todos erramos, todos carecemos de perdão. O mundo seria mais leve se houvesse menos pedras lançadas e mais mãos estendidas. Em vez de julgar, escolha compreender. Em vez de condenar, escolha amar. Hoje, troque a pedra do julgamento pela ponte da compaixão.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Há uma luz do sol após cada temporal. (Provérbio Alemão).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Há vários caminhos até a montanha, todos levando para o mesmo lugar, de modo que não importa o caminho que você vai tomar. O único perdendo tempo é aquele que corre ao redor da montanha, apontando a todos que o caminho deste ou desta pessoa é errado. (Provérbio Hindu).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Homens fortes criam tempos fáceis e tempos fáceis geram homens fracos, mas homens fracos criam tempos difíceis e tempos difíceis geram homens fortes.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Inveja é a falta de fé em si mesmo. (Ditado Árabe).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Jamais, em todo o mundo, o ódio acabou com o ódio. O que acaba com o ódio é o amor.” (Buda).', autor: 'Buda', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Jamais se desespere em meio as sombrias aflições de sua vida, pois das nuvens mais negras cai água límpida e fecunda. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Jesus, o Sol Divino, brilhou na Terra sem ofuscar a ninguém.” (Emmanuel - Francisco Cândido Xavier - Através do Tempo).', autor: 'Francisco Cândido Xavier', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Lamentar o passado é correr atrás do vento.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Lembre-se quando a noite parecer ainda mais escura é porque o sol já vai nascer.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Lembre-se que grandes realizações e grandes amores envolvem grandes riscos (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Lua com circo traz água no bico.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Mais importante que vigiar os outros é controlar os próprios passos. (Provérbio Judaico).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Me ame quando eu menos merecer, pois é quando eu mais preciso (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Me ame quando eu não merecer, porque é nesse momento que eu mais preciso. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Melhor bolinho do que flores. (Ditado Japonês). Significado: Valorize a utilidade mais do que a aparência.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Melhor perder um minuto na vida do que a vida num minuto.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Melhor prevenir que remediar. Significado: Com cuidado, a gente evita situações complicada.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Miséria é a falta de amor entre os homens. (Irmã Dulce).', autor: 'Irmã Dulce', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Mudanças reais começam com uma boa ideia, repetida com consistência.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Mudar e melhorar são duas coisas diferentes. (Provérbio Alemão).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Mude a si mesmo e mudará o mundo ao seu redor.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Muitas vezes gastamos muito mais tempo criticando nossos inimigos do que elogiando nossos amigos!', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Muitas vezes o silêncio é a melhor resposta. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Muito alcança quem não cansa.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Muito da sua dor você mesmo escolheu. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Na juventude nós aprendemos, na velhice nós entendemos. (Ditado Mexicano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Na necessidade se prova a amizade.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não adormeças pensando que uma coisa é difícil, pois correrás o risco de seres despertado pelo barulho de alguém que a executa.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não andes atrás de mim, talvez eu não saiba liderar. Não andes na minha frente, talvez eu não queira segui-lo. Ande sempre ao meu lado, para podermos caminhar juntos.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Não busque a verdade, apenas cesse de alimentar as ilusões.” (Ditado Zen). Significado: A verdade não é algo a ser alcançado, mas revelado quando paramos de nos enganar com distrações mentais.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Não busque no mundo o que está dentro de você.” (Siddartha Gautama - Buda).', autor: 'Buda', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não corrigir as próprias falhas é cometer a pior delas. (Confúcio).', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não deixe(s) para amanhã o que se pode(s) fazer hoje. Significado: cuidado com a procrastinação para não acumular as coisas.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não é mérito o fato de não termos caído e, sim, o de termos levantado todas as vezes que caímos.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não é o sol que faz a sombra.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não esqueça que a terra se deleita em sentir seus pés descalços e os ventos longos para brincar com seus cabelos. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Não exijas dos outros as qualidades que ainda não possuem.” (Francisco Cândido Xavier).', autor: 'Francisco Cândido Xavier', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não faça aos outros o que não queres que te façam.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não faças aos outros aquilo que não queres que te façam.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não faças aos outros o que não gostas que te façam a ti.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não fale mal de si mesmo, pois o guerreiro dentro de você ouve suas palavras e é diminuído por elas.⁠ (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não grite sua felicidade (tão alto), a inveja tem sono leve.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não há amor como o primeiro.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não há nenhuma árvore que o vento não tenha sacudido. (Provérbio Hindu).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não há bela sem senão, nem feia sem sua graça.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não há bem que sempre dure, nem mal que nunca se acabe. Significado: Traz uma perspectiva de esperança nas dificuldades e humildade nos bons momentos, mostrando a transitoriedade da vida.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não há came sem osso; não há nada que não tenha suas dificuldades.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Não há caminho para a paz. A paz é o caminho.” (Ditado Zen). Significado: A paz não é um destino - ela está no modo como vivemos, momento a momento.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não há mal que o tempo não cure.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não há mal que perdure, não há dor que não se cure.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não há mal que dure para sempre, nem bem que nunca se acabe.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não há pior inimigo que um falso amigo. (Provérbio Inglês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não há que ser forte. Há que ser flexível. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não importa o quanto você foi longe no caminho errado. Volte para trás para o caminho certo.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não importa o quanto você vá devagar desde que não pare. (Confúcio). Significado: Desistir é a certeza absoluta do fracasso.', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não importa quantos passos você deu para trás, o importante é quantos passos agora você vai dar pra frente. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não há tristeza que dure para sempre, nem felicidade que nunca se acabe.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não julgue um livro pela capa. Significado: As aparências enganam. Não se deve jugar ninguém pela aparência (pelo aspecto visual).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não olhe onde você caiu, mas onde você escorregou. (Provérbio Africano). Significado: É fundamental analisar e aprender com nossos erros, em vez de focar apenas nas consequências negativas.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não reclame de resultados negativos quando o teu esforço é o mínimo. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não respondas ao louco segundo a sua loucura, Para que não te faças semelhante a ele. Responde ao louco segundo a sua loucura, Para que ele não seja sábio aos seus olhos. (Provérbios, 26:4-5). Significado: Responda ao louco segundo sua loucura para que ele não se julgue sábio.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não se deixa para amanhã o que se pode fazer hoje.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não se deve elogiar o dia antes da noite. (Provérbio Alemão).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não se pode chegar à alvorada a não ser pelo caminho da noite. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não se pode julgar no escuro. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Não supervalorize o que você tem, nem inveje o outro. O invejoso não obtém paz de espírito.” (Siddartha Gautama - Buda).', autor: 'Buda', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não tenha medo de crescer lentamente. Tenha medo apenas de ficar parado.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'No dia da vitória não se sente a fadiga. (Provérbio Árabe).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“No universo ninguém evolui a sós. A humanidade na terra é a soma de todos nós.” (Castro Alves. Médium Francisco Cândido Xavier).', autor: 'Francisco Cândido Xavier', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Nós somos o que repetidamente fazemos; a excelência, portanto, não é um ato, mas um hábito.” (Aristóteles).', autor: 'Aristóteles', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Nunca bata uma porta, você pode querer voltar. (Provérbio Espanhol).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Nunca espere nada e você nunca será decepcionado.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Nunca se esquecem as lições aprendidas na dor. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O amigo é a resposta aos teus desejos. Mas não o procures para matar o tempo! Procura-o sempre para as horas vivas. Porque ele deve preencher a tua necessidade, mas não o teu vazio. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“O amor é a força mais sútil do mundo.” (Gandhi).', autor: 'Gandhi', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“O amor é uma força que transforma o destino.” (Francisco Cândido Xavier).', autor: 'Francisco Cândido Xavier', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O amor é a única flor que desabrocha sem a ajuda das estações. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O amor está nos detalhes, a falta de amor também.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O bambu que se curva é mais forte que o carvalho que resiste. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“O bem que praticares em algum lugar, é o teu advogado em toda parte.” (Francisco Cândido Xavier).', autor: 'Francisco Cândido Xavier', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O bem que se faz num dia, é semente de felicidade para o dia seguinte. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O bom estrategista traz um exército dentro da cabeça. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O conhecimento é como um jardim: se não for cultivado, não pode ser colhido! (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O coração cala, o corpo fala! Significado: Quando não lidamos adequadamente com nossos sentimentos ou os ignoramos, nosso corpo pode reagir de maneiras que refletem o que está ocorrendo emocionalmente. As pessoas adoecem porque cultivam e guardam mágoas, culpas, raivas ou tristezas dentro de seus corações, que não conseguiram superar ou tratar.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O coração que está em paz vê uma festa em todas as aldeias. (Provérbio Hindu).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: ' “O corpo é o cárcere da alma”. (Platão).', autor: 'Platão', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“O dedo que aponta a lua não é a lua.” (Ditado Zen). Significado: Não confunda o ensinamento com a experiência direta. Palavras, mestres e religiões são apenas guias — o essencial é viver o que se ensina.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O desejo de conforto mata a paixão da alma e depois caminha sorrindo em seu funeral. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O desejo é a metade da vida; a indiferença a metade da morte! (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O eterno em você está ciente da intemporalidade da vida. E sabe que ontem é apenas a memória de hoje e amanhã é o sonho de hoje. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O fracasso é o sucesso em processo (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O grande homem é aquele que não perdeu a candura de sua infância. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O hábito faz o monge. Significado: A prática é o segredo para conquistar o que se deseja.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O homem é dono do que cala e escravo do que fala. Significado: Às vezes, o silêncio diz mais do que qualquer palavra. Saber calar é sabedoria; saber falar é poder.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O homem justo é aquele que briga porque é necessário. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O homem que move montanhas, começa carregando pedras pequenas.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O homem só envelhece quando os lamentos substituem seus sonhos.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O importante para uma pessoa não são os seus sucessos mas sim quanto os deseja. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O inteligente sai de buracos que o sábio jamais cairia. Significado: Quem tem sabedoria não resolve problemas, simplesmente os evitam quando fica calado. A paz é o fruto do silêncio. O silêncio fala quando as palavras se perdem. ', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O inverno nunca falha em se tornar primavera (Buda).', autor: 'Buda', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O menor ato de bondade vale mais do que a melhor intenção. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O mesmo sol que derrete a manteiga, endurece o barro. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O óbvio é a verdade mais difícil de se enxergar. (Clarice Lispector).', autor: 'Clarice Lispector', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O pé que dá fruta é o que mais leva pedrada.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O pior cego é aquele que não quer ver. Significado: Há pessoas que não se permitem enxergar o que está a sua frente.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O prisioneiro que tem a porta do seu cárcere aberta e não se liberta, é um covarde. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“O propósito das nossas vidas é ser feliz.” (Dalai Lama).', autor: 'Dalai Lama', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O que não tem remédio, remediado está. Significado: Não se preocupe demais com o que não pode lidar.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O que sabemos, saber que o sabemos. Aquilo que não sabemos, saber que não o sabemos: eis o verdadeiro saber. (Confúcio).', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O silêncio é de ouro e muitas vezes é a resposta.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O silêncio é um amigo que nunca trai. (Confúcio).', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O sol nasce para todos.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O sol quando nasce é para todos.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“O som de uma palma batendo.” (Ditado Zen). Significado: Provoca a mente racional a entrar em colapso e abrir espaço para o despertar intuitivo.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O sorriso que dás volta para ti mesmo. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“O sucesso não tem a ver quanto dinheiro você ganha, mas com a diferença que você faz na vida de outras pessoas.” (Michelle Obama).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O tempo cicatriza as feridas do corpo e da alma.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O trabalho dá saúde.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O trabalho é a fonte de todas as riquezas.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O trabalho enobrece o homem.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O vento não quebra um galho que se dobra. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O vento não quebra uma árvore que se dobra. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Onde reina o amor, o impossível pode ser alcançado. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Os desejos que repousam em seus ombros são como sacos de pedras. Se você não pode passar sem nenhum desejo, esforce-se pelo menos para que eles sejam leves pois terá que carregá-los. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Os jovens vão aos bandos, os adultos aos pares e o velhos sozinhos (Provérbio Sueco).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Os nossos desejos são como crianças pequenas: quanto mais lhes cedemos, mais exigentes se tornam. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Os resultados são frutos do teu esforço, não reclame de resultados negativos quando o teu esforço é o mínimo. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Os vasos que não se enchem de água, cedo transbordam de pó. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Paciência é o melhor remédio para todas as doenças. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Paguei com a mesma moeda. "Não pague a ninguém o mal com o mal." (Romanos, 12:17).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Para conhecermos os amigos é necessário passar pelo sucesso e pela desgraça. No sucesso, verificamos a quantidade e, na desgraça, a qualidade. (Confúcio).', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Para ficar rico, primeiro é preciso dar. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Para frente e que se anda.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Para quê preocuparmo-nos com a morte? A vida tem tantos problemas que temos de resolver primeiro. (Confúcio).', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Peça o que deseja e esteja preparado para recebê-lo.”(Maya Angelou).', autor: 'Maya Angelou', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Perdão é uma das características de pessoas fortes.” (Gandhi).', autor: 'Gandhi', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Pobres são aqueles que não têm talentos; fracos são os que não tem aspirações. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Podemos escolher o que plantar, mas somos obrigados a colher o que semeamos.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Por mais que na batalha se vença um ou mais inimigos, a vitória sobre si mesmo é a maior de todas as vitórias.” (Buda).', autor: 'Buda', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Por que devemos dar valor às lágrimas, se como a chuva elas caem ao chão? Devemos dar valor aos sorrisos, que como o amor, aquece o coração.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Porque onde estiver o vosso tesouro, ali estará também o vosso coração. A candeia do corpo são os olhos; de sorte que, se os teus olhos forem bons, todo o teu corpo terá luz; (Mateus, 6:21-22).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Pouco se aprende com a vitória, mas muito com a derrota. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'O prego que se destaca é martelado. (Ditado Japonês). Significado: Quem se sobressai pode ser criticado ou reprimido. (Crítica social comum no Japão).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '⁠Prepara-te para o que quiseres ser. (Provérbio Alemão).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Procure acender uma vela em vez de amaldiçoar a escuridão.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Qualquer coisa que a mente do homem pode conceber, também pode alcançar.” (W. Clement Stone).', autor: '', categoria: 'Motivacional', ativo: true },
    { id: _uid(), texto: 'Quando a cabeça não pensa o corpo padece.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Quando a caridade é muito discutida, o socorro chega tarde.” (Francisco Cândido Xavier).', autor: 'Francisco Cândido Xavier', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando acertamos, ninguém se lembra. Quando erramos, ninguém se esquece. (Ditado Irlandês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando falares, cuida para que tuas palavras sejam melhores que o silêncio. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando morre um idoso, perde-se uma biblioteca. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando não existem inimigos interiores, os inimigos exteriores não conseguem ferir você. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando não há inimigos interiores, os inimigos exteriores nada podem contra você. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando não há inimigos internos, os inimigos externos não podem nos ferir. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando não souberes para onde ir, olha para trás e saiba pelo menos de onde vens. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Quando o aluno está pronto, o mestre aparece.” (Ditado Zen). Significado: O crescimento espiritual depende da disposição interior. Quando você está preparado, a vida traz o ensinamento necessário.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando o bem se cala, o mal prevalece.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando o mar bate na rocha quem se lixa e o mexilhão.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando o olho não está bloqueado, o resultado é a visão. Quando a mente não está bloqueada, o resultado é a sabedoria, e quando o espírito não está bloqueado, o resultado é o Amor.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando o rio esquece onde nasce, ele seca e morre.(Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando os justos florescem, o povo se alegra. Significado: Quando os ímpios governam, o povo geme.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando seu vizinho está errado, você aponta o dedo; quando é você, o dedo se esconde. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando um homem cava um poço muitas pessoas conseguem água.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando um não quer, dois não brigam (não discutem). Significado: quando uma pessoa não aceita o que a outra pessoa propõe ou não responde a uma provocação, então não há mais pelo que discutir.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando um sábio aponta o céu o ignorante olha o dedo. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando vires um homem bom, tenta imitá-lo; quando vires um homem mau, examina-te a ti mesmo. (Confúcio). Significado: Antes de julgar e "atirar pedras", esteja atento a examinar as suas próprias ações.', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando você está certo, ninguém se lembra, quando estás errado ninguém esquece.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando você estiver muito feliz, ou muito triste, lembre-se: isso também vai passar. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando você fala deixa de estar em paz com os seus pensamentos. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quando você levantar o braço para bater em seu filho, ainda com o braço no ar, pense se não seria mais educativo se você descesse esse braço de forma a acariciá-lo, em vez de machucá-lo. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quanto mais fundo a tristeza adentra em seu ser, mais alegria poderá conter. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Quanto menos alguém entende, mais quer discordar.” Galileu Galilei (1564-1642)).', autor: 'Galileu Galilei', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem abre o coração à ambição, fecha-o à tranquilidade. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem ama cuida.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem canta seus males espanta. Significado: Cantar ajudar a afastar os males e a vencer o medo, a tristeza e os problemas.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem canta seus males espanta: Cantar faz bem para a gente;', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem comete o mal, comete-o contra si mesmo. (Provérbio Árabe).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem comete uma injustiça é sempre mais infeliz que o injustiçado. (Platão).', autor: 'Platão', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem é cego? Aquele que é incapaz de enxergar outro mundo. Quem é mudo? Aquele que é incapaz de dizer palavras amáveis no momento certo. Quem é pobre? Aquele que é atormentado por ambição desmedida. Quem é rico? Aquele cujo o coração está em paz! (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem escuta, de si ouve.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem espera sempre alcança. Significado: Quem se esforça para alcançar algo tem mais chances de conseguir bons resultados ou ser reconhecido.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem está no convento é que sabe o que lhe vai dentro.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem já se queimou com sopa assopra até sorvete.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem estuda e não pratica o que aprendeu, é como o homem que lavra e não semeia. ', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem não sabe suportar contrariedades nunca terá acesso às coisas grandiosas.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem não se importa com os centavos não é digno de possuir um euro. (Provérbio Alemão).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem queimou a língua nunca esquece de soprar a sopa. (Provérbio Alemão).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem quer agradar a todo o mundo, no fim não agrada a ninguém.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem quer que se importe em aprender encontrará sempre um professor. (Provérbio Alemão).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem quiser chegar à nascente, tem que nadar contra a correnteza.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem sabe sorrir, sabe viver.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem se levanta atravessa fronteiras. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Quem vive na ignorância, aporta na escuridão.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Recorda que a humildade é o perfume eterno da vida.” (Emmanuel - Francisco Cândido Xavier - Através do Tempo).', autor: 'Francisco Cândido Xavier', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Recordar é viver.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Sabedoria e virtude são como duas rodas de uma carroça. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Saber demasiado é envelhecer precocemente. (Provérbio Indiano). Significado: Sem dúvida, se estamos vivos, estamos sempre aprendendo, por isso devemos ser humildes em relação ao saber. O saber é uma estrada infinita.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Saber o que é correto e não o fazer é falta de coragem. (Confúcio).', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se a razão governar sozinha, será uma força limitadora. E uma paixão ignorada é uma chama que arde até sua própria destruição. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se caíres sete vezes, levanta-te oito.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Sê como o sândalo, que perfuma o machado que o fere. (Saadi - Poeta Persa).', autor: 'Saadi - Poeta Persa', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se conselho fosse bom não se dava, vendia. "O caminho do insensato parece-lhe justo, mas o sábio ouve os conselhos." (Provérbios 12:15).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se deres as costas à luz, nada mais verá do que sua própria sombra.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se estão dando, pegue. Se vierem buscar, corra. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se nem Jesus que era Jesus conseguiu agradar a todos... como eu poderia?', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se não é certo, não faça; se não é verdade, não diga. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se não queres que ninguém saiba, não o faças. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se o bom passa, o mal passa também. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se o problema tem solução, não esquente a cabeça, porque tem solução. Se o problema não tem solução, não esquente a cabeça, porque não tem solução. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se passa o que é bom, também passa o que é mau. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se o vento soprar de uma única direção, a árvore crescerá inclinada. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se quer ir rápido, vá sozinho. Se quer ir longe, vá acompanhado. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se quer ir rápido, vá sozinho. Se quer ir longe, vá em grupo. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se queres prever o futuro, estuda o passado. (Confúcio). Significado: Aprenda sempre com o passado.', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Se quiser conhecer o infinito, olhe dentro de si.” (Ditado Zen) Significado: A consciência verdadeira não está fora, mas dentro de cada um. Autoconhecimento é o caminho para a transcendência.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se os teus projetos forem para um ano, semeia o grão; se forem para dez anos, plante uma árvore; se forem para cem, instrui o povo.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se um Homem não for visto durante três dias, os amigos devem observá-lo atentamente quando regressar, para verem que mudanças se deram nele durante esse período. Por muito pequena que seja uma mudança, todos os dias mudamos um bocado. Por isso está atento a todas as mudanças em teu redor, que por muito pequenas que sejam, elas estão sempre presentes. Para alcançar o sucesso e sermos felizes, temos de melhorar constantemente a qualidade de vida, de crescer e de nos expandirmos sempre. (Ditado Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se um problema é grande demais, não pense nele e se ele é pequeno demais, pra quê pensar nele? (Ditado Tibetano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Se um único homem atingir a plenitude no amor, neutralizará o ódio de milhões.” (Gandhi).', autor: 'Gandhi', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se você é paciente em um momento de raiva, você evitará cem dias de sofrimento. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Se você não pode falar bem de uma pessoa, é melhor não dizer nada.” (Epiteto (50-138)).', autor: 'Epiteto', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se você pensa que é muito pequeno para fazer a diferença, tente dormir em um quarto fechado com um mosquito! (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Se você perdeu dinheiro, perdeu pouco. Se perdeu a honra, perdeu muito. Se perdeu a coragem, perdeu tudo.” (Vincent van Gogh).', autor: 'Vincent van Gogh', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se você pode andar, você pode dançar. Se você pode falar. você pode cantar. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se você quer manter limpa a sua cidade, comece varrendo diante de sua casa. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se você remover pedra por pedra até mesmo uma montanha será demolida. (Provérbio Hindu).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se você quer saber como foi seu passado, olhe para quem você é hoje. Se quer saber como vai ser seu futuro, olhe para o que está fazendo hoje.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Se você quer voar, precisa soltar aquilo que te puxa para baixo.” (Toni Morrison).', autor: 'Toni Morrison', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Se você tem uma laranja e troca com outra pessoa que também tem uma laranja, cada um fica com uma laranja. Mas se você tem uma ideia e troca com outra pessoa que também tem uma ideia, cada um fica com duas. (Confúcio).', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Sem a oposição do vento, a pipa não consegue subir.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Sem vingança os males do mundo um dia ficarão extintos. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Semeia e cria, (viverás com / terás) alegria.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '"Sempre fica um pouco de perfume nas mãos de quem oferece flores." (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Sente-se. Não faça nada. A primavera vem, e a grama cresce sozinha.” (Ditado Zen). Significado: Há momentos em que o melhor é parar, silenciar e confiar no fluxo da vida. A transformação acontece sem forçar.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '"Sinceridade é a verdade com amor." (Francisco Cândido Xavier).', autor: 'Francisco Cândido Xavier', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Só a educação liberta.” (Epiteto (50-138)).', autor: 'Epiteto', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Só a morte não tem remédio.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Só abra a boca pra me dizer algo se suas palavras forem melhores que o teu silêncio. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Só Jesus salva!', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Sob o farol, está escuro. (Ditado Japonês). Significado: Às vezes, deixamos de enxergar o que está bem diante de nós.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Somente os extremamente sábios e os extremamente estúpidos é que não mudam. (Confúcio).', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Somos todos casas com quatro cômodos, um físico um mental, um emocional e um espiritual. A maioria de nós tende a viver em um cômodo na maior parte do tempo; contudo, se não entrarmos em cada um desses cômodos todos os dias , mesmo que seja só para arejá-lo, não seremos pessoas completas. (Provérbio ou axioma Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Só percebemos o valor da água depois que a fonte seca.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Só sacia sua sede quem bebe pela própria mão. (Provérbio Árabe).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Só se vê bem com o coração, o essencial é invisível aos olhos.” (Antoine de Saint-Exupéry (1900-1944)).', autor: 'Antoine de Saint-Exupéry', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Sua força está na habilidade se se recompor.” (Michelle Obama).', autor: 'Michelle Obama', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Tempo e maré não esperam por ninguém.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Tempo é remédio.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Tempo perdido não se recupera.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Tentação é tudo aquilo que fugimos com vontade que nos pegue.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Tente corrigir um sábio e você o tornará mais sábio. Tente corrigir um tolo e você o tornará seu inimigo.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Ter saudades do passado é correr atrás do vento. (Provérbio Russo).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '⁠Todos nós somos mais inteligentes que qualquer um de nós. (Ditado Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Todos os fatos têm três versões: a sua, a minha e a verdadeira.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Trabalhando só pelos bens materiais construímos nós mesmos nossa prisão.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Transportai um punhado de terra todos os dias e fareis uma montanha. (Confúcio). Significado: Fazer alguma coisa em prol de seus objetivos é melhor do que fazer nada.', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Treine enquanto eles dormem, estude enquanto eles se divertem, persista enquanto eles descansam, e então, viva o que eles sonham. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Trigo e gratidão só crescem em boa terra e boa alma.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Trigo e gratidão só crescem em boa terra e em boa alma.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Tristezas não pagam dividas.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Troque preocupações por ocupações.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Tu pouco dás quando dás de tuas posses. É quando dás de ti próprio que realmente estás dando. É belo dar quando solicitado, é mais belo ainda dar quando não solicitado: dar por haver apenas compreendido. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Tudo aquilo que você evita enfrentar se torna o seu limite.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Tudo demais é sobra e a sobra nem o diabo gosta.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Tudo na vida requer tempo e medida.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Tudo o que somos é o resultado de nossos pensamentos.” (Buda).', autor: 'Buda', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Tudo tem solução menos a morte.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Tudo vale a pena quando a alma não é pequena.” (Fernando Pessoa (1888-1935)).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Uma imagem vale mais que mil palavras.” (Confúcio (551aC-479aC)).', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Um aposento sem livros é um corpo sem alma.” (Cícero (220aC-126aC)).', autor: 'Cícero', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Um bom descanso é metade do trabalho. (Provérbio Iugoslavo).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Um desastre vem raramente sozinho. (Provérbio Alemão).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Um dia é da caça, outro do caçador. Significado: A vida oferece dias bons e dias ruins para todos. Não adiante se desesperar. Há um momento certo para privilegiar cada pessoa.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Um erro da largura de um fio de cabelo pode causar um desvio de mil quilômetros. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Um fio invisível conecta os que estão destinados a conhecer-se, independentemente do tempo, lugar ou circunstância, o fio pode esticar ou emaranhar-se, mas nunca irá partir. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Um gesto vale mais que mil palavras.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Um grama de exemplos vale mais que uma tonelada de conselhos.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Um grande amor e grandes desafios sempre envolvem um grande risco. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Um homem prevenido vale por dois.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Um homem sábio toma suas próprias decisões, um homem ignorante segue a opinião pública.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Um homem só é nobre quando consegue sentir piedade por todas as criaturas.” (Buda).', autor: 'Buda', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Um momento de paciência pode evitar um grande desastre; um momento de impaciência pode arruinar toda uma vida.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Um pequeno problema não é um problema, mas um grande somatório de pequenos problemas é um problema muito grande (Ditado Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Um segredo é pouco para um, suficiente para dois e demais para três. (Provérbio Indiano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Uma alegria compartilhada se transforma em dupla alegria; uma dor compartilhada, em meia dor.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Uma árvore torta vive a sua própria vida, mas uma árvore reta torna-se madeira.” (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Uma ideia não executada, transforma-se em sonho.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Uma jornada de duzentos quilômetros começa com um simples passo.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Uma longa viagem começa por um passo. (Provérbio Chinês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Uma mente fechada é como um livro fechado; somente um bloco de madeira.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Uma mentira estraga mil verdades. (Provérbio Africano).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Vença a si mesmo e terá vencido o seu próprio adversário. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Visão sem ação é sonho. Ação sem visão é pesadelo. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Vitória sem luta é triunfo sem glória.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Viver é como desenhar sem borracha.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Você colhe o que cultiva. Escolha bem suas sementes.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Você cria seu próprio universo durante o caminho.” (Winston Churchill).', autor: 'Winston Churchill', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Você não fica rico com o que ganha fica rico com o que poupa!', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Você não pode mudar o vento, mas pode ajustar as velas do barco para chegar onde quer. (Confúcio). Significado: Não podemos ser rígidos com a vida, mas sim ter a capacidade de nos adaptarmos as mais diferentes situações. Nem sempre as coisas saem como planejamos, mas isso também não significa que devemos desistir. Se reorganize e continue a caminhada!', autor: 'Confúcio', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Você não precisa mudar a vida. Você só precisa participar dela. (Provérbio Japonês).', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Você reza na sua aflição e na sua necessidade; quisera que você rezasse também na plenitude de sua alegria e em vossos dias de abundância. (Khalil Gibran).', autor: 'Khalil Gibran', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Amai-vos uns aos outros como eu vos amei. (João, 13:34).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Amai-vos uns aos outros, assim como eu vos amei. (João, 15:12).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Amai a vossos inimigos, bendizei os que vos maldizem, fazei bem aos que vos odeiam, e orai pelos que vos maltratam e vos perseguem; para que sejais filhos do vosso Pai que está nos céus. (Mateus, 5:44).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Amai a vossos inimigos, fazei bem aos que vos odeiam; Bendizei os que vos maldizem, e orai pelos que vos caluniam. (Lucas, 6:27-28).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Amados, amemo-nos uns aos outros; porque o amor é de Deus; e qualquer que ama é nascido de Deus e conhece a Deus. Aquele que não ama não conhece a Deus; porque Deus é amor. (1 João 4:7-8).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Amarás ao Senhor teu Deus de todo o teu coração, e de toda a tua alma, e de todas as tuas forças, e de todo o teu entendimento, e ao teu próximo como a ti mesmo. Toda a lei e os profetas se acham contidos nesses dois mandamentos.” (Mateus 22:37-40) / (Lucas, 10:27) / (Marcos, 12:30).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Antes de tudo, exercei profundo amor fraternal uns para com os outros, porquanto o amor cobre uma multidão de pecados. (1 Pedro 4:8). ', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Aprendei de mim que sou manso e humilde de coração. (Mateus, 11:29).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Aquele que estiver sem pecado que atire a primeira pedra. (João, 8:7).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Aquele que quer ser o maior, que seja o que mais serve. (Mateus, 20:28).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Assim conhecemos o amor que Deus tem por nós e confiamos nesse amor. Deus é amor. Todo aquele que permanece no amor permanece em Deus, e Deus nele. (1 João 4:16).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Assim, em tudo, façam aos outros o que vocês querem que eles façam a vocês. (Mateus, 7:12).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Assim resplandeça a vossa luz diante dos homens, para que vejam as vossas boas obras e glorifiquem a vosso Pai, que está nos céus.” (Mateus, 5:16).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'A boca fala do que está cheio o coração. (Mateus, 12:34).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'A candeia do corpo são os olhos; de sorte que, se os teus olhos forem bons, todo o teu corpo terá luz. (Mateus, 6:22).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'A fé move/remove montanhas - "Porque em verdade vos digo que, se tiverdes fé como um grão de mostarda, direis a este monte: Passa daqui para acolá, e há de passar; e nada vos será impossível." (Mateus, 17:20). Significado: Suas montanhas podem ser a solidão, a dúvida, as enfermidades ou outros problemas. A semente de mostarda representa uma fé pequena, mas crescente.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“A paz vos deixo , a minha paz vos dou; não vo-la dou como o mundo a dá.” (João, 14:27).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'A quem muito foi dado, muito será exigido (cobrado). (Lucas, 12:48).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Acautelai-vos. Se teu irmão pecar contra ti, repreende-o; se ele se arrepender, perdoa-lhe.” (Lucas, 17:3).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Antes de apresentar tua oração a Deus, vai e reconcilia-te com teu inimigo.” (Mateus, 5:24).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'As minhas ovelhas ouvem a minha voz, e eu conheço-as, e elas me seguem. (João, 10:27).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Aquele que dentre vós estiver sem pecado seja o primeiro que lhe atire pedra.” (João, 8:7). "Quem não tiver pecado, atire a primeira pedra."', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Assim, resplandeça vossa luz diante dos homens, para que vejam as vossas boas obras e glorifiquem a vosso Pai, que está nos céus. (Mateus, 5:16).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Bem-aventurados os pobres em espírito, porque deles é o reino dos céus; (Mateus, 5:3).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Bem-aventurados os que choram, porque eles serão consolados. (Mateus, 5:4).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Bem-aventurados os mansos, porque eles herdarão a terra. (Mateus, 5:5).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Bem-aventurados os que têm fome e sede de justiça, porque serão fartos. (Mateus, 5:6).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Bem-aventurados os misericordiosos, porque eles alcançarão misericórdia. (Mateus, 5:7).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Bem-aventurados os puros de coração, porque eles verão a Deus. (Mateus, 5:8).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Bem-aventurados os pacificadores, porque serão chamados filhos de Deus. (Mateus, 5:9).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Bem-aventurados os que sofrem perseguição por causa da justiça, porque deles é o reino dos céus. (Mateus, 5:10).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Bem-aventurados sois vós, quando vos injuriarem e perseguirem e, mentindo, disserem todo o mal contra vós por minha causa. (Mateus, 5:11).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Buscai antes o reino de Deus, e todas estas coisas vos serão acrescentadas. (Lucas, 12:31).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Busque a paz e siga.” (I Pedro, 3:11).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Porque eis que o Reino de Deus está dentro de vós”. (Lucas, 17:21).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Mas, buscai primeiro o reino de Deus, e a sua justiça, e todas estas coisas vos serão acrescentadas.” (Mateus, 6:33).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Caríssimos, não acrediteis em todos os Espíritos, mas provai se os Espíritos são de Deus, porque são muitos os falsos profetas, que se levantaram no mundo.” (1º João, 4:1).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Conhecereis a verdade, e a verdade vos libertará. (João, 8:32).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Curai os enfermos, limpai os leprosos, ressuscitai os mortos, expulsai os demônios; de graça recebestes, de graça dai. (Mateus, 10:8).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Daí a César o que é de César, e a Deus o que é de Deus. (Mateus, 22:21).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deixai vir a mim as criancinhas, e não as impeçais; porque delas é o Reino de Deus. (Marcos, 10:14).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deixo-vos a paz, a minha paz vos dou; não vo-la dou como o mundo a dá. Não se turbe o vosso coração, nem se atemorize. (João, 14:27).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: ' "Disse então Maria: Eis aqui a serva do Senhor; cumpra-se em mim segundo a tua palavra. E o anjo ausentou-se dela." (Lucas, 1:38). ', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'E agora glorifica-me, ó Pai, contigo mesmo, com a glória que eu tive junto de Ti, antes que houvesse o mundo. (João, 17:5).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'E disse-lhes: Acautelai-vos e guardai-vos da avareza; porque a vida de qualquer não consiste na abundância dos bens que possui. (Lucas, 12:15).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'E eis que eu estou convosco todos os dias, até a consumação dos séculos. (Mateus, 28:20).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“E então dará a cada um segundo as suas obras.” (Mateus, 16:27).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'E Jesus lhe disse: Ninguém, que lança mão do arado e olha para trás, é apto para o reino de Deus. (Lucas, 9:62).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Eu, porém, vos digo: Amai a vossos inimigos, bendizei os que vos maldizem, fazei bem aos que vos odeiam, e orai pelos que vos maltratam e vos perseguem; para que sejais filhos do vosso Pai que está nos céus. (Mateus, 5:44).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Em verdade vos digo que, se não vos converterdes e não vos fizerdes como crianças, de modo algum entrareis no reino dos céus. (Mateus, 18:3).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Entrai pela porta estreita, porque larga é a porta, e espaçoso, o caminho que conduz à perdição, e muitos são os que entram por ela.” (Mateus, 7:13-14).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Eu e o Pai somos um. (João, 10:30).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Eu sou a luz do mundo; quem me segue não andará em trevas, mas terá a luz da vida. (João, 8:12) - Ele guia, ilumina e dissipa as trevas da ignorância e do pecado.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Eu sou a luz que vim ao mundo, para que todo aquele que crê em mim não permaneça nas trevas. (João, 12:46).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Eu sou a porta; se alguém entrar por mim, salvar-se-á, e entrará, e sairá, e achará pastagens. (João, 10:9).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Eu sou a ressurreição e a vida; quem crê em mim, ainda que esteja morto, viverá. (João, 11:25) - Jesus afirma seu poder sobre a morte e sua promessa de vida eterna.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Eu sou o bom Pastor; o bom Pastor dá a sua vida pelas ovelhas. (João, 10:11) - Ele cuida, guia e dá a vida por suas ovelhas.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Eu sou o bom pastor; conheço as minhas ovelhas, e elas me conhecem a mim. (João, 10:14).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Eu sou o caminho, a verdade e a vida. Ninguém vem ao Pai senão por mim. (João, 14:6).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Eu sou o pão da vida. (João, 6:35) – “Eu sou o pão da vida. Aquele que vem a mim nunca terá fome; aquele que crê em mim nunca terá sede.” (João, 6:35). Jesus se apresenta como aquele que sacia a fome espiritual.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Eu sou o pão da vida. (João, 6:48).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Eu, porém, vos digo que não resistais ao mau; mas, se qualquer te bater na face direita, oferece-lhe também a outra. (Mateus, 5:39).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Eu vim ao mundo como luz, para que todo aquele que crê em mim não permaneça nas trevas.” (João, 12:46).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Eu vim para que tenham vida, e a tenham com abundância. (João, 10:10).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Glória a Deus nas alturas, paz na terra, boa vontade para com os homens. (Lucas, 2:14).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Graças dou a ti, Pai, Senhor do Céu e da Terra, porque escondeste estas coisas aos sábios e as revelaste aos simples e pequeninos. (Mateus, 11:25).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Hipócrita, tira primeiro a trave do teu olho, e então cuidarás em tirar o argueiro do olho do teu irmão. (Mateus, 7:3-5).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Mas Jesus lhe observou: Deixa aos mortos o enterrar os seus mortos; porém tu vai e anuncia o reino de Deus. (Lucas, 9:60).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Mas quando tu deres esmola não saiba a tua mão esquerda o que faz a tua direita. (Mateus, 6:4).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Mas quem beber da água que darei nunca mais terá sede.” (João, 4:14).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Meus discípulos serão conhecidos por muito se amarem. (João, 13:35). ', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Minha paz vos dou; não a dou como o mundo a dá. (João, 14:27).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Muitos dos que agora são os primeiros, serão os últimos e muitos dos que agora são os últimos serão os primeiros. "Se alguém quiser ser o primeiro, deve ser o último e servir a todos." (Mateus, 20:26-27).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Na casa de meu Pai há muitas moradas; se não fosse assim, eu vo-lo teria dito. Vou preparar-vos lugar. (João, 14:2).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Na verdade, na verdade te digo que aquele que não nascer de novo, não pode ver o reino de Deus. (João, 3:3). Significado: Ninguém pode experimentar a vida plena com Deus sem passar por uma transformação profunda, um novo nascimento, pelo Espírito, que muda não só o comportamento, mas o coração.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Não ajunteis tesouros na terra, onde a traça e a ferrugem tudo consomem e onde os ladrões minam e roubam. Mas ajuntai tesouros no céu onde nem a traça, nem a ferrugem consomem, e onde os ladrões não minam nem roubam. (Mateus, 6:19-20).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Não andeis ansiosos por coisa alguma; basta a cada dia o seu mal. (Mateus, 6:34).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Não andeis inquietos pelo dia de amanhã. Porque o dia de amanhã a si mesmo trará seu cuidado; ao dia basta a sua própria aflição. (Mateus, 6:25-34).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Não julgueis para que não sejais julgados. (Mateus, 7:1).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Porque com o juízo com que julgardes sereis julgados, e com a medida com que tiverdes medido vos tornarão a medir." (Mateus, 7:2).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Não podeis servir a Deus e a Mamom. (Mateus, 6:24).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Não se turbe o vosso coração; credes em Deus, crede também em mim. (João, 14:1).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Não te digo que perdoe até sete vezes; mas, até setenta vezes sete. (Mateus, 18:21-22).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Não temas, crê somente. (Marcos, 5:36).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Não vos deixarei órfãos. (João, 14:18).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Não vos inquieteis, pois, pelo dia de amanhã, porque o dia de amanhã cuidará de si mesmo. Basta a cada dia o seu mal. (Mateus, 6:34).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Nem se acende a candeia e se coloca debaixo do alqueire, mas no velador, e dá luz a todos que estão na casa. (Mateus, 5:15).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Nem só de pão viverá o homem, mas de toda a palavra que sai da boca de Deus. (Mateus, 4:4).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Nem todo aquele que me diz: Senhor, Senhor! entrará no reino dos céus, mas aquele que faz a vontade de meu Pai, que está nos céus. (Mateus, 7:21).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'No mundo tereis aflições, mas tende bom ânimo, eu venci o mundo. (João, 16:33).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“O amor cobre a multidão dos pecados.” (I Pedro, 4:8).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'O filho do homem veio para servir, e não para ser servido. (Mateus, 20:27).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'O maior dentre vós será vosso servo. (Mateus, 23:11). Se você quiser liderar, deve servir.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Olhai as aves do céu; não semeiam nem ceifam, mas nosso Pai Celestial as alimenta. (Mateus, 6:26).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Olhai para os lírios do campo, como eles crescem; não trabalham nem fiam; E eu vos digo que nem mesmo Salomão, em toda a sua glória, se vestiu como qualquer deles. (Mateus, 6:28-29).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Pai, perdoa-lhes, porque não sabem o que fazem. (Lucas, 23:34). ', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Para entrar no reino do céu é necessário nascer de novo. (João, 3:3). ', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Passarão o céu e a terra. Minhas palavras, porém, não passarão. (Mateus, 24:35).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Pedi, e dar-se-vos-á; buscai, e encontrareis; batei, e abrir-se-vos-á. (Mateus, 7:7).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Permanecei em mim, e Eu permanecerei em vós. (João, 15:4).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Pois todo aquele que a si mesmo se exaltar será humilhado, e todo aquele que a si mesmo se humilhar será exaltado. (Mateus, 23:12). Aquele que se eleva será rebaixado e aquele que se humilha será elevado.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Porque, aquele que pede, recebe; e, o que busca, encontra; e, ao que bate, abrir-se-lhe-á. (Mateus, 7:8).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Porque o Filho do Homem virá na glória de seu Pai, com os seus anjos; e, então, dará a cada um segundo as suas obras. (Mateus, 16:27).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Porque, onde estiverem dois ou três reunidos em meu nome, aí estou eu no meio deles. (Mateus, 18:20).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Porque onde estiver o vosso tesouro, ali estará também o vosso coração. (Mateus, 6:21).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Porque, se perdoardes aos homens as suas ofensas, também vosso Pai celeste vos perdoará.” (Mateus, 6:14).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Quando fordes convidados para um banquete, sentai no último lugar. (Lucas, 14:10).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Reconcilia-te com o teu inimigo (adversário), enquanto estás a caminho com ele. (Mateus, 5:25).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Se alguém quiser vir após mim, renuncie-se a si mesmo, tome sobre si a sua cruz, e siga-me. (Mateus,16:24).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Se alguém tem sede, venha a mim, e beba. (João, 7:37).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Se me amais, guardai os meus mandamentos. E eu rogarei ao Pai, e ele vos dará outro Consolador, para que fique convosco para sempre. (João, 14:15-16).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Sede vós, pois, perfeitos, como é perfeito o vosso Pai celestial. (Mateus, 5:48).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Se alguém bater em você em uma face, ofereça‑lhe também a outra. Se alguém tirar de você a capa, não o impeça de tirar a túnica.” (Lucas, 6:29).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Seja, porém, o vosso falar: Sim, sim; Não, não. (Mateus, 5:37).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Sejam Transeuntes. (Evangelho de Tomé ,42).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Tenho-vos dito isso, para que em mim tenhais paz; no mundo tereis aflições, mas tende bom ânimo; eu venci o mundo. (João, 16:33).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Tratai a todos como gostarias de ser tratado. (Lucas ,10:27-28).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Tudo é possível ao que crê. (Marcos, 9:23).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Vai e não peques mais! (João, 8:11).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Vem, e segue-me. (Mateus. 19:21).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Vinde a mim todos os que estais cansados e sobrecarregados, e eu vos aliviarei. (Mateus, 11:28).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Vinde após mim, e eu vos farei pescadores de homens. (Mateus, 4:19).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Vós sois a luz do mundo. (Mateus, 5:14).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Vós sois o sal da terra. Vós sois deuses. Sois a Luz do Mundo. (Mateus, 5:13-14).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Vós tendes ouvido que se disse: olho por olho dente por dente. Eu porém vos digo que não resistai ao mal: mas se alguém te ferir a face direita, oferece-lhe a esquerda, se te pedirem a túnica, dá também a capa.” (Mateus, 5:38).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“A caridade não é simplesmente uma das virtudes da vida cristã, mas ela resume em si todas as virtudes. Pois quem tem a verdadeira caridade, quem verdadeiramente se deixa determinar, em seu pensar, falar, agir e desejar, pela caridade, este não faz o mal, pois pratica todas as virtudes da nossa fé. Portanto, a caridade é o pleno cumprimento da lei.” (Romanos 1:,8-10).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Ai de mim se não evangelizar.” (1º Coríntios, 9:17).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Ainda que eu falasse as línguas dos homens e dos anjos, e não tivesse amor, seria como o metal que soa ou como o sino que retine. E ainda que tivesse o dom de profecia, e conhecesse todos os mistérios e todo o conhecimento, e ainda que tivesse toda a fé, de maneira tal que transportasse os montes, e não tivesse amor, nada seria. (1 Coríntios 13:1-2).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Aos que anunciam o evangelho, que vivam do evangelho.” (1º Coríntios, 9:14).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Assim que, se alguém está em Cristo, nova criatura é; as coisas velhas já passaram; eis que tudo se fez novo.” (2º Coríntios, 5:17). - É preciso deixar ir o Homem Velho e deixar vir(surgir) o Homem Novo.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Combati o bom combate, terminei minha carreira, conservei a fé.” (2º Timóteo, 4:7).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Cristo é tudo em todos.” (Colossenses 3:11).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Desperta, ó tu que dormes, levanta-te de entre os mortos, e Cristo te iluminará.” (Gálatas, 5:14). - Desperta o novo homem, iluminado pelos ensinamentos do Cristo, pois, sem autoconsciência não há autotransformação.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Deus está em tudo e em todos.” (Efésios, 4:6).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Deus retribuirá a cada um segundo as suas obras. (Romanos, 2:6).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'E a paz de Deus, que excede todo o entendimento, guardará os vossos corações e os vossos pensamentos em Cristo Jesus. (Filipenses, 4:7).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“E acima de tudo, vistam-se com o amor, que é o laço da perfeição.” (Colossenses, 3:14).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'E ele, tremendo e atônito, disse: Senhor, que queres que eu faça? (Atos, 9:6).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'E graças a Deus, que sempre nos faz triunfar em Cristo, e por meio de nós manifesta em todo o lugar a fragrância do seu conhecimento. Porque para Deus somos o bom perfume de Cristo, nos que se salvam e nos que se perdem. (2º Coríntios, 2:14-15).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“E não sede conformados com este mundo, mas sede transformados pela renovação do vosso entendimento, para que experimenteis qual seja a boa, agradável, e perfeita vontade de Deus.” (Romanos 12:2). - Temos que saber qual é a boa, perfeita e agradável vontade de Deus para as nossas vidas. Buscai fazer a vontade do Pai.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“E, se nós somos filhos, somos logo herdeiros também, herdeiros de Deus, e co-herdeiros de Cristo: se é certo que com ele padecemos, para que também com ele sejamos glorificados.” (Romanos, 8:17). - Somos herdeiros do Pai. Somos filhos Dele, e herdeiros do Seu reino.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Eis por que sinto alegria nas fraquezas, nas afrontas, nas necessidades, nas perseguições, no profundo desgosto sofrido por amor de Cristo. Porque quando me sinto fraco, então é que sou forte.” (2º Coríntios, 12:10).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Em Cristo vocês têm tudo de modo pleno.” (Colossenses, 2:10).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Em tudo dai graças a Deus em nome de nosso Senhor Jesus Cristo.” (Efésios, 5:20).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Esqueço-me de tudo que ficou pra trás, e avanço para as coisas que estão diante de mim.” (Filipenses, 3:13).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Examinai-vos a vós mesmos, se permaneceis na fé; provai-vos a vós mesmos.” (2º Coríntios 13:5).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Fazei tudo para a Glória de Deus.” (1º Coríntios, 10:31).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Já não sou mais eu que vivo, mas o Cristo que vive em mim; e esse viver que, agora, tenho na carne, vivo pela fé no Filho de Deus, que me amou e a si mesmo se entregou por mim.” (Gálatas, 2:20).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: ' “Mais bem aventurado é dar, do que receber.” (Atos, 20.35).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Nada nos pode separar do amor de Deus, que está em Cristo Jesus nosso Senhor. (Romanos, 8:39).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Não sabeis que sois santuário de Deus e que o Espírito de Deus habita em vós?” (1º Coríntios 3:16). - Deus habita em mim.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Não andeis ansiosos por coisa alguma; antes em tudo sejam os vossos pedidos conhecidos diante de Deus pela oração e súplica com ações de graças. (Filipenses, 4:6).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Não vos enganeis; Deus não se deixa escarnecer (de Deus não se zomba), pois tudo o que o homem semear, isso também ceifará.” (Gálatas, 6:7).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Não vos conformeis com o Mundo, mas transformai-vos pela renovação do vosso entendimento.” (Romanos, 12:2).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Não te deixes vencer do mal, mas vence o mal com o bem.” (Romanos, 12:21).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Nem olhos viram, nem ouvidos ouviram, nem jamais penetrou em coração humano o que Deus tem preparado para aqueles que O amam. (1º Coríntios, 2:9).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Ninguém se glorie nos homens sábios, porque tudo é vosso; seja o Mundo, ou a vida, ou a morte; tudo é vosso e vós de Cristo, e Cristo de Deus.” (1º Coríntios 3:21-23). - Nada nos pertence.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“O amor de Cristo nos impulsiona [...] para que, os que vivem, não vivam mais para si mesmos, mas para Aquele que por eles morreu e ressuscitou.” (2º Coríntios, 5:14-15).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'O amor é o pleno cumprimento da Lei. (Romanos, 13:10).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'O amor é sofredor, é benigno; o amor não é invejoso; o amor não trata com leviandade, não se ensoberbece. Não se porta com indecência, não busca os seus interesses, não se irrita, não suspeita mal; Não se alegra com a injustiça, mas alegra com a verdade; Tudo sofre, tudo crê, tudo espera, tudo suporta. (1 Coríntios 13:4-7).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“O Evangelho de Cristo é força de Deus que salva.” (Romanos, 1:16).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“O homem natural não aceita as coisas do Espírito de Deus, mas o homem que é espiritual discerne bem tudo, pois temos a mente do Cristo.” (1º Coríntios, 2:14-15).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Ora, o Senhor é Espírito; e onde está o Espírito do Senhor, aí há liberdade.” (2 Coríntios, 3:17). - A melhor liberdade é quando você se livra do que te faz mal. Liberdade, responsabilidade, respeito, disciplina e limites andam intimamente ligados.', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Para que a palavra de Deus não seja blasfemada, em TUDO dê o exemplo com boas obras.” (Tito, 2:7).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Pois sabemos que todas as coisas trabalham juntas para o bem daqueles que amam a Deus, daqueles que são chamados segundo o seu propósito.” (Romanos, 8:28). “Tudo coopera para o bem.” (Romanos, 8:28).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Pois tudo é por amor de vós, para que a graça multiplicada por meio de muitos, faça abundar a ação de graças para a glória de Deus.” (2º Coríntios, 4:15).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Ponde tudo à prova, mas retém o que é bom.” (1º Tessalonicenses, 5:21).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Por isso não desfalecemos; mas, ainda que o nosso homem exterior se corrompa, o interior, contudo, se renova de dia em dia.” (2º Coríntios, 4:16).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Porque, assim como o corpo é um, e tem muitos membros, e todos os membros, sendo muitos, são um só corpo, assim é Cristo também.” (1º Coríntios, 12:12).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Porque, como as aflições de Cristo são abundantes em nós, assim também é abundante a nossa consolação por meio de Cristo.” (2º Coríntios 1:5).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Porque não faço o bem que quero, mas o mal que não quero esse faço.” (I Romanos, 7:19).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Porque nada podemos contra a verdade, senão pela verdade.” (2º Coríntios, 13:8).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Porque noutro tempo éreis trevas, mas agora sois luz no Senhor; andai como filhos da luz.” (Efésios, 5:8).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Porque para mim o viver é Cristo.” (Filipenses, 1:21).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Porque, para com Deus, não há acepção de pessoas. (Romanos, 2:11).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Prossigo para o alvo.” (Filipenses, 3:14).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Quanto ao mais, irmãos, tudo o que é verdadeiro, tudo o que é honesto, tudo o que é justo, tudo o que é puro, tudo o que é amável, tudo o que é de boa fama, se há alguma virtude, e se há algum louvor, nisso pensai e praticai e o Deus de Paz será convosco. (Filipenses, 4:8).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Quanto, porém, à caridade fraternal, não necessitais que vos escreva, porque já vós mesmos estais instruídos por Deus que vos ameis uns aos outros.” (1º Tessalonicenses 4:9).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Se Deus é por nós, quem será contra nós? (Romanos, 8:31).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Sem fé é impossível agrada a Deus, pois quem Dele se aproxima precisa crer que Ele existe e que recompensa os que O buscam.” (Hebreus, 11:6).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Somos todos do Cristo e o Cristo é de Deus.” (1º Coríntios, 3:23).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Todas as vossas coisas sejam feitas com amor (caridade).” (1º Coríntios, 16:14).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Todos somos cartas vivas do Cristo.” (2º Coríntios, 3:3).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Tudo concorre para o bem daqueles que amam ao Senhor.” (Romanos, 8:28).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Tudo me é lícito, mas nem tudo me convém. Todas as coisas me são lícitas, mas eu não me deixarei dominar por nenhuma.” (1º Coríntios, 6:12).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Tudo é permitido, mas nem tudo é oportuno. Tudo é permitido, mas nem tudo edifica”. (1º Coríntios, 10:23).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'Tudo posso naquele que me fortalece. (Filipenses, 4:13).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“Tudo quanto fizerdes, fazei-o como se fosse para o Senhor e não aos homens.” (Colossenses, 3:23).', autor: '', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: '“A alegria agora flui livremente dentro de mim. Estou em paz com a vida.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'A cura começa quando você decide se tratar com gentileza.', autor: '', categoria: 'Saúde', ativo: true },
    { id: _uid(), texto: 'A disciplina é a ponte entre metas e conquistas.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'A força infinita de Deus penetra a minha alma.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Agradeço a vida, porque cada dia é um milagre.” ', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Amo e admiro meu corpo.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'A paz harmoniza o meu corpo.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'A sua alma merece descanso. A sua mente merece paz. O seu coração merece leveza.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“A natureza canta em festa a minha existência. Sou a Vida Suprema!” (Pena Branca – Marcelo Barros).', autor: 'Pena Branca – Marcelo Barros', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“A Vida satisfaz todas as minhas necessidades com grande abundância. Confio na Vida. ” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Acalma o coração: tudo o que é verdadeiro permanece.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Aceito uma saúde perfeita agora.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Agradeço por meu corpo saudável. Amo a vida.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Agradeço por todo o amor que há em minha vida. Eu encontro amor em toda parte.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Ao me perdoar, fica mais fácil perdoar os outros.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“As idéias me ocorrem facilmente e sem nenhum esforço. Faço algo novo, ou pelo menos diferente, todos os dias.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“As dificuldades são oportunidades de crescimento. Uso-as como passos em direção ao sucesso.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Atraio amor e romance para a minha vida e os recebo agora.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Cada dia é uma nova oportunidade. O ontem já passou. Hoje é o primeiro dia do meu futuro.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Cada lágrima rega o solo onde sua força vai florescer.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Caminhando e semeando, no fim terás o que colher.” (Cora Coralina).', autor: 'Cora Coralina', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Deus é a fonte eterna do meu provimento e atende permanentemente a todas as minhas necessidades.” (Joseph Murphy).', autor: 'Joseph Murphy', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Deus é a força infinita que flui para dentro de mim.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Deus habita em mim.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Escolho me sentir bem comigo mesmo. Mereço o amor que sinto por mim.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Estou em segurança em todos os meus relacionamentos; dou e recebo muito amor.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Estou pronto para ser curado. Estou disposto a perdoar. Tudo está bem.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Estou rodeado de amor. Está tudo bem em minha vida.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Eu atraio amor para minha vida!', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Eu atraio prosperidade para minha vida!', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Eu e o Pai somos um.” (João, 10:30).', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Eu estou criando abundância para servir mais pessoas.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Eu estou num processo de mudança positiva e mereço o melhor.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Eu faço escolhas saudáveis. Eu me respeito.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Eu irradio amor e o amor preenche minha vida.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Eu me abro para receber todo o bem e abundância do Universo. Eu agradeço à Vida. (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Eu me amo!', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Eu me amo e me aceito!', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Eu me amo e me aprovo. Sou amoroso e digno de ser amado.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Eu me perdoo.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Eu obtenho a ajuda de que preciso, de diversas fontes. Meu sistema de apoio é: forte e afetuoso.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Eu posso fazer mudanças positivas em minha vida! (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Eu posso conseguir o que desejo! (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Eu posso me sentir bem! (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Eu realizo mudanças positivas em todas as áreas da minha vida.  (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Eu reconheço e acolho este pensamento dentro de mim.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Eu sou a ressurreição e a vida (João, 11:25) da minha saúde, da minha prosperidade.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Eu sou bom naquilo que eu faço.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Eu sou criativo. Estou descobrindo talentos que não sabia que possuía.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Eu sou abundância! Eu sou luz! Eu sou amor! Eu sou força. Eu sou paz!”', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Eu sou fonte infinita de amor e luz.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Eu sou fonte infinita de luz, alegria, amor, comprometimento e sabedoria.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Existe uma força infinita dentro de você!” (Joseph Murphy).', autor: 'Joseph Murphy', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Expresso gratidão por todo o bem que há em minha vida. Cada dia traz novas e maravilhosas surpresas.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Fale consigo de forma gentil, como se estivesse conversando com um amigo querido.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Fecho os olhos, tenho pensamentos positivos, inspiro e expiro a bondade.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Foco, força e fé.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Gratidão, eu sou amada(o).', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Gratidão, eu sou harmonizada(o).', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Gratidão, eu sou saudável.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Gratidão, o meu dinheiro se multiplica, porque eu amo o dinheiro, o recurso que ganho com meu trabalho.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Gratidão, eu sou próspera(o), eu sou abundante, eu estou no fluxo e o fluxo está em mim.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Gratidão, eu sou feliz e o meu dia vai ser fantástico.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Há riquezas infinitas em derredor, se você abrir os olhos mentais e contemplar a casa do tesouro incomensurável que há dentro de você.” (Joseph Murphy).', autor: 'Joseph Murphy', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Há uma mina de ouro dentro de você, da qual pode extrair tudo aquilo de que necessita para levar uma existência gloriosa, repleta de alegria e fartura. (Joseph Murphy).', autor: 'Joseph Murphy', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Irradio sucesso e prosperidade onde quer que eu esteja.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Liberto-me de toda resistência ao dinheiro e permito que ele flua alegremente para minha vida.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Meu coração se abre para o perdão. Através do perdão alcanço o amor.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Mereço o melhor e aceito o melhor agora.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Meu potencial é ilimitado.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Me esforço para ser melhor a cada dia, pois bondade também se aprende.” (Cora Coralina).', autor: 'Cora Coralina', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Não deixe que o medo decida o seu futuro. Eu venço o medo.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Não existe problema grande ou pequeno que não possa ser resolvido com amor.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Neste exato momento, há muita riqueza e poder ao meu dispor. Escolho sentir que os mereço.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'No universo ninguém evolui a sós; A humanidade na terra é a soma de todos nós. (Castro Alves através de Francisco Cândido Xavier).', autor: 'Francisco Cândido Xavier', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Nunca desista, os melhores dias estão por vir. (Joseph Murphy).', autor: 'Joseph Murphy', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'O amor de Deus é a luz que cura a minha alma.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“O caminho para se livrar da escuridão é a luz; o caminho para superar o frio é o calor; o caminho para superar o pensamento negativo é substitui-lo pelo pensamento positivo. Afirme o bem e o mal desaparecerá.” (Joseph Murphy).', autor: 'Joseph Murphy', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'O dinheiro chega a minha vida com abundância.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“O homem nasceu para vencer, para conquistar, para transpor. A Inteligência, o Saber, a força do bem, jazem em seu íntimo, esperando para serem desencadeados, para eleva-lo acima de todas as dificuldades.” (Joseph Murphy).', autor: 'Joseph Murphy', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“O perdão é o primeiro passo para a cura.” (Joseph Murphy).', autor: 'Joseph Murphy', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“O Poder e a Abundância de Deus flui, incessantemente, sobre minha a vida!” (Pena Branca – Marcelo Barros).', autor: 'Pena Branca – Marcelo Barros', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'O sol nasce dentro de mim.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'O sucesso é a soma de pequenos esforços repetidos todos os dias.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Padrões antigos e negativos não me limitam mais. Eu me desapego deles facilmente.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Pense no bem e o bem acontecerá.” (Joseph Murphy).', autor: 'Joseph Murphy', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Perdôo as pessoas do meu passado por todos os seus erros. Eu as libero com amor.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Permita-se sentir, mas também permita-se seguir.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Permito que meu corpo volte à sua saúde natural e vibrante.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Por meio do perdão chego à compreensão e sinto compaixão por todos.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Portas maravilhosas se abrem para mim o tempo todo.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Respeito meu corpo e cuido bem dele.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Respira. Confia. A vida está se reorganizando ao seu favor.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Sei perdoar, sou amoroso, bom e gentil, e sei que a vida me ama.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Sinto-me bem ao me expressar das mais variadas formas criativas.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Sinto-me bem ao me olhar no espelho, dizendo: "Amo você, amo de verdade.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Sinto-me perfeitamente feliz por ser eu mesmo.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Só atraio relacionamentos saudáveis. Sempre me tratam bem.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Só há um processo de cura e este é a fé. Só há um poder curador, isto é, a mente subconsciente. (Dr. Joseph Murphy, Ph.D. O poder do subconsciente, p 81).', autor: 'Joseph Murphy', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Sou a força criativa em meu mundo.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Sou a Suprema e Majestosa criação da Natureza!” (Pena Branca – Marcelo Barros).', autor: 'Pena Branca – Marcelo Barros', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Sou a Suprema Paz! Sou o Invencível Amor! Sou a Contagiante Alegria! Sou a Inesgotável Prosperidade!” (Pena Branca – Marcelo Barros).', autor: 'Pena Branca – Marcelo Barros', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Sou o amor e a beleza da vida em plena expansão.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Sou uma expressão alegre e criativa da Vida.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Sou um produto do Amor de Deus.” (Pena Branca – Marcelo Barros).', autor: 'Pena Branca – Marcelo Barros', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Sou um ser radiante, que aproveita a Vida ao máximo.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Sou um ser único: especial, criativo e maravilhoso.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Tenho força para manter a calma diante das mudanças.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Tenho um potencial ilimitado. No meu caminho só existem coisas boas.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Todas as coisas são possíveis para aqueles que acreditam.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Todas as mudanças que ocorrerem em minha vida são positivas. Sinto segurança.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Tudo acontece para o meu maior bem.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Um manancial de luz brota em minha alma.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Uso o dinheiro que ganho em coisas que me fazem feliz. Deixo a maior prosperidade possível entrar em minha vida.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Você pode fazer o que quiser, mas nunca perca de vista o que ama.', autor: '', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: '“Vivo num Universo de amor, abundância e harmonia, e agradeço por isso.” (Louise Hay).', autor: 'Louise Hay', categoria: 'Impulsionadora / Empoderamento', ativo: true },
    { id: _uid(), texto: 'Fale com suas células com amor e transforme sua vida de dentro para fora.', autor: '', categoria: 'Saúde', ativo: true },
    { id: _uid(), texto: 'Agradeço cada célula do meu corpo, abençoada, saudável e curada.', autor: '', categoria: 'Saúde', ativo: true },
    { id: _uid(), texto: 'Agradeço a cada célula do meu corpo por sua contribuição para o milagre da minha existência.', autor: '', categoria: 'Saúde', ativo: true },
    { id: _uid(), texto: 'Amo cada célula do meu corpo e lhes concedo o poder de se auto regenerar.', autor: '', categoria: 'Saúde', ativo: true },
    { id: _uid(), texto: 'Cada respiração é como um carinho para vocês, quero dar-lhes vida e energia.', autor: '', categoria: 'Saúde', ativo: true },
    { id: _uid(), texto: 'Em cada batida do meu coração, eu sinto a harmonia que flui através das minhas células.', autor: '', categoria: 'Saúde', ativo: true },
    { id: _uid(), texto: 'Envio-lhes amor e luz deixando que a energia do Universo banhe cada uma das minhas células com o seu poder curador.', autor: '', categoria: 'Saúde', ativo: true },
    { id: _uid(), texto: 'Eu agora permito que cada célula do meu corpo seja preenchida com amor e gratidão.', autor: '', categoria: 'Saúde', ativo: true },
    { id: _uid(), texto: '“Eu mando luz para minha células para que possa regenerar meu corpo e trazer saúde para meu corpo.”', autor: '', categoria: 'Saúde', ativo: true },
    { id: _uid(), texto: 'Eu sei que cada uma das minhas células responde à vibração de amor e gratidão.', autor: '', categoria: 'Saúde', ativo: true },
    { id: _uid(), texto: '“Eu transmito amor, deixando que a energia do Universo banhe cada uma das minhas células com seu poder de cura e de luz.”', autor: '', categoria: 'Saúde', ativo: true },
    { id: _uid(), texto: 'Hoje, eu escolho encher cada canto do meu corpo com pensamentos positivos e palavras gentis (amáveis).', autor: '', categoria: 'Saúde', ativo: true },
    { id: _uid(), texto: 'A mente que se abre a uma nova ideia jamais voltará ao seu tamanho original. (Albert Einstein).', autor: 'Albert Einstein', categoria: 'Desenvolvimento', ativo: true },
    { id: _uid(), texto: 'Fé é dar o primeiro passo mesmo quando você não pode ver toda a escada. (Martin Luther King Jr.).', autor: 'Martin Luther King Jr.', categoria: 'Espiritual', ativo: true },
    { id: _uid(), texto: 'A consistência é o que transforma médio em excelente. (Anônimo).', autor: 'Anônimo', categoria: 'Hábitos', ativo: true },
    { id: _uid(), texto: 'Pequenos hábitos levam a grandes transformações. (James Clear).', autor: 'James Clear', categoria: 'Hábitos', ativo: true },
    { id: _uid(), texto: 'Cada dia é uma nova oportunidade para crescer. (Anônimo).', autor: 'Anônimo', categoria: 'Motivacional', ativo: true },
    { id: _uid(), texto: 'Não espere a motivação. Comece e a motivação virá. (Anônimo).', autor: 'Anônimo', categoria: 'Motivacional', ativo: true },
    { id: _uid(), texto: 'Comece onde você está. Use o que você tem. Faça o que você pode. (Arthur Ashe).', autor: 'Arthur Ashe', categoria: 'Motivacional', ativo: true },
    { id: _uid(), texto: 'A disciplina é a ponte entre objetivos e realizações. (Jim Rohn).', autor: 'Jim Rohn', categoria: 'Motivacional', ativo: true },
    { id: _uid(), texto: 'O sucesso é a soma de pequenos esforços repetidos dia após dia. (Robert Collier).', autor: 'Robert Collier', categoria: 'Motivacional', ativo: true },
    { id: _uid(), texto: 'Você não precisa ser grande para começar, mas precisa começar para ser grande. (Zig Ziglar).', autor: 'Zig Ziglar', categoria: 'Motivacional', ativo: true },
    { id: _uid(), texto: 'Cuide do seu corpo. É o único lugar que você tem para viver. (Jim Rohn).', autor: 'Jim Rohn', categoria: 'Saúde', ativo: true },
    { id: _uid(), texto: 'Quem tem saúde tem esperança, e quem tem esperança tem tudo. (Árabe Antigo).', autor: '', categoria: 'Saúde', ativo: true },
    { id: _uid(), texto: '“Os bons merecem o nosso amor, os maus precisam dele.” (Madre Teresa de Calcutá).', autor: 'Madre Teresa de Calcutá', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'É bem melhor acender uma pequenina chama do que amaldiçoar a escuridão.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'A palavra convence, mas o exemplo arrasta.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Não adianta cuidar da casca e deixar(abandonar) a semente.', autor: '', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Pregue o Evangelho em todo tempo. Se necessário, use palavras.” (São Francisco de Assis).', autor: 'São Francisco de Assis', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: '“Quem não vive para servir, não serve para viver.” (Mahatma Gandhi). Essa citação ressalta a importância da dedicação e do serviço ao próximo como um propósito fundamental para uma vida com significado.', autor: 'Mahatma Gandhi', categoria: 'Reflexão', ativo: true },
    { id: _uid(), texto: 'Mensagem: 1 -  Não Critique! Procure antes colaborar com todos, sem fazer críticas. A crítica fere, e ninguém gosta de ser ferido. E a criatura que gosta de criticar, aos poucos, se vê isolada de todos. Se vir alguma coisa errada, fale com amor e carinho, procurando ajudar. Mas, sobretudo, procure corrigir os outros, através de seu próprio exemplo!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 2 -  Deus está em toda a parte ao mesmo tempo, em redor de você, dentro de você! Jamais você está desamparado. Nunca está só. Não permita que a mágoa o perturbe: procure manter-se calmo, para ouvir a voz silenciosa de Deus dentro de você. Assim poderá superar todas as dificuldades que aparecerem em seu caminho, e há de descobrir a Verdade que existe em todas as coisas e pessoas.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 3 -  Lembre-se de que colheremos, infalivelmente, aquilo que houvermos semeado. Se estamos sofrendo, é porque estamos colhendo os frutos amargos das sementeiras errôneas do passado. Fique alerta quanto ao momento presente! Plante apenas sementes de otimismo e de Amor, para colher amanhã os frutos doces da alegria e da felicidade. Cada um colhe, exatamente, aquilo que plantou.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 4 -  Não deixe que a calúnia o perturbe! Todos nós estamos sujeitos à calúnia. Mas saiba superá-la, vivendo de tal maneira que o caluniador não tenha razão. Não revide um ataque com outro ataque. Não se magoe com o caluniador. Perdoe sempre. Apenas viva de tal maneira, que jamais o caluniador tenha razão.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 5 -  Os conselhos ajudam, não há dúvida... Mas não se esqueça de que a solução de nossos problemas está dentro de nós mesmos, na voz silenciosa de nossa consciência, que é a voz de Deus dentro de nós. Não se deixe enganar: só você será o responsável pelo caminho que escolher. Ninguém poderá prestar contas por você. Procure, portanto, viver acertadamente, de acordo com sua consciência.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 6 -  Resolva seu problema! Há muito tempo que você se propõe reformar sua vida, melhorar seus atos, cessar definitivamente suas fraquezas. Vamos, então, começar a partir deste momento! Não deixe para amanhã o que pode fazer hoje... De certo você não há de resolvê-lo do dia para a noite. Mas, comece já! E se cair de novo, não desanime: saiba recomeçar quantas vezes for preciso!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 7 -  Embora sozinho, continue a caminhada! Se todos o abandonarem, prossiga sua jornada. Se as trevas crescerem em seu redor, mais uma razão para que você mantenha acesa a pequenina chama de sua Fé. Não deixe que a luz se apague, para que você mesmo não fique em trevas. Ilumine, com sua Luz, as trevas que o circundam.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 8 -  Cada um de nós é responsável por seus atos. Por que vai desanimar, pelo que os outros fizeram a você? Que tem você que ver com isso? Siga à frente, ainda que o mundo inteiro esteja contra você. Você há de vencer, mesmo que fique sozinho. Continue sem desânimo, porque você é o único responsável por seus atos.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 9 -  Nossa mente está mergulhada na Mente Divina que sustenta os universos infinitos. Nossa força mental permanece impregnada da Força Mental Divina, que está em toda a parte ao mesmo tempo. Procure manter-se unido a esta Força Infinita, e jamais será derrotado. Você tem esse Poder: confie! Você vencerá em toda a linha, se o quiser.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 10 -  Modifique seu modo de pensar, para que sua saúde se firme e estabeleça. Pare de queixar-se de doenças! A doença é aumentada pela nossa emissão mental negativa. Expulse a enfermidade, confiando em sua cura! Você pode curar-se! Você está melhorando cada dia mais, sob todos os pontos de vista.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 11 -  Aprenda a repousar sua mente. A mente cansada não pode pensar direito. Repouse a mente, fazendo o exercício da Higiene Mental, para conquistar cada vez maior energia e vigor. O cérebro cansado turva o pensamento. E o pensamento é a maior força criadora que existe sobre a terra. Repouse o cérebro, para pensar com acerto e alegria.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 12 -  Não aceite maus conselhos! Não se dixe sugestionar por palavras de desânimo! Sempre existe uma saída para qualquer problema, por mais complexo e difícil que nos pareça. A Força Divina que rege os universos está dentro de nós. Ligue-se ao Pensamento Universal de Bondade e Amor, e vencerá todos os obstáculos.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 13 -  Pense positivamente! Nossos pensamentos emitem ondas reais que se irradiam de nosso cérebro, formando uma atmosfera mental que é peculiar a cada pessoa. De acordo com o tipo de vibração do pensamento, atrairemos a nós todas as ondas semelhantes. Se você pensar negativamente, atrairá todos os pensamentos negativos, piorando seu estado. Pense positivamente, para atrair apenas pensamentos positivos de Paz e Prosperidade.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 14 -  Mantenha uma atitude vitoriosa! Quando você olha para uma pessoa curvada e triste, perde a confiança, porque verifica que está abatida e preparada para uma derrota. Não deixe que ninguém pense isso a seu respeito! Mantenha-se de cabeça erguida, confiante e risonho, e todos confiarão em você. Irradie força e entusiasmo até por meio da atitude do seu corpo.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 15 -  Não esteja ansioso e preocupado, para não atrair moléstias para seu corpo. A ansiedade é um fator bioquímico, que influencia as secreções glandulares, produzindo demasiada adrenalina, que estimula em exagero o sistema nervoso. Daí à enfermidade  é um passo. O nervosismo prejudica fundamentalmente a saúde. Portanto, não seja ansioso: faça constantemente afirmações positivas de saúde, e mantenha-se calmo e sereno.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 16 -  Você jamais está abandonado! Absolutamente! O Pai não abandona ninguém. Ele veste de plumas multicoloridas as pequeninas aves, enfeita de beleza e perfume as flores e não deixa morrer de fome nem os insetos nem os pequeninos vermes. Esteja certo: não cai um fio de cabelo de sua cabeça, sem que Ele o permita. Confie no Pai! Você jamais está abandonado!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 17 -  Afaste de si o veneno da lisonja. Não creia naqueles que o elogiam sem motivo. Prefira ouvir uma crítica honesta, a um galanteio vazio. A crítica aos nossos atos poderá trazer-nos o alerta de que necessitamos para corrigir-nos. O elogio fácil nos amolece e ilude. E nada existe de mais frágil que uma criatura iludida a seu próprio respeito.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 18 -  Seja o mesmo, dentro e fora do lar. O lar é a sociedade em miniatura! A sociedade é o lar ampliado. Num e noutra, seja o mesmo: firme em sua palavra, seguro em seu pensamento, honesto em seus atos, calmo na confiança em si mesmo. O homem é o que é. E a manifestação externa reflete o estado íntimo de nossa alma.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 19 -  Seja atencioso e compreensivo. Quantas vezes a pessoa que vem falar com você traz problemas recônditos, escondidos no âmago da alma! Mantenha-se sereno, você que já vislumbrou a Luz do Entendimento fraterno. Conserve seu equilíbrio, quando alguém se apresenta perturbado. Seja atencioso e compreensivo: o mundo está repleto de enfermos, e você tem saúde moral.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 20 -  Não procure evidência pessoal. Reflita que, quanto mais exposto à visão alheia, mais se tornará alvo de ciúme e inveja. As vibrações negativas, mesmo que não lhe façam mal, positivamente, poderão cansá-lo, no trabalho de defender-se. Procure agir discretamente, embora com firmeza, deixando que os vaidosos e vazios se exponham numa evidência de que você, certamente, não necessita para brilhar. O vidro comum brilha muito ao sol, mas o brilho do ouro está  escondido no cofre: nem por isso valerá menos que o vidro...', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 21 -  Evite o luxo supérfluo. Tudo o que sobrecarrega o ambiente atrapalha a vida. Seja sóbrio e natural. O artificialismo distorce e causa fadigas inúteis. A sobriedade repousa o espírito e o corpo. Seja sóbrio e natural em tudo, desde a sua pessoa, até o mobiliário de sua casa. Quem pouco tem é que procura mostrar mais do que possui.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 22 -  Cumprimente a seus amigos com alegria. Muitas vezes, uma simples saudação alegre e espontânea conquista um coração e consola a dor. A saudação triste e acabrunhada pode instilar veneno num coração alegre. Derrame alegria e bondade, ao encontrar uma pessoa conhecida, e já terá conquistado os benefícios de uma boa ação meritória. Que seus amigos sintam o calor de seu coração afetuoso no simples cumprimento alegre.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 23 -  Trate com afabilidade a todos. O vizinho que senta a seu lado na condução não é seu inimigo, nem seu concorrente. Trata-se, sempre, de seu irmão, a quem você precisa acolher com simpatia. Não procure brigar com ele, para conquistar maior conforto: dê você mais conforto a ele. Mesmo insensivelmente, você receberá de volta as vibrações de gratidão de seu coração.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 24 -  Se alguém queixar-se da vida a seu lado, responda com palavras de encorajamento. Não aumente o peso a quem já sente demasiado o peso que carrega. Se alguém se lamenta da vida, procure mostrar os lados bons e belos da existência. Não contribua com suas próprias lamentações para o desânimo do companheiro. Reanime-o com esperança e com bom ânimo, com palavras de incentivo e coragem. Talvez desse remédio dependa a cura de seu coração desalentado.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 25 -  Desperte! Não deixe que a rotina arrase sua vida! Execute sua tarefa com Amor sempre renovado, porque isto trará alegria a você mesmo. A rotina cansa e corrói a alma, desalenta e carcome o entusiasmo. Renove cada manhã seu armazenamento de alegria de viver. Ajude a todos e cumpra alegremente sua tarefa, para receber de volta o benefício da felicidade de seu trabalho.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 26 -  Afaste-se dos ambientes malsãos. Evite as pessoas mal intencionadas. No entanto, se sua presença puder melhorar, sem que com isso sofra sua alma, leve sua virtude mesmo ao antro do vício. Mas faça como o sol, que ilumina e saneia o pântano, sem que seu raio de luz e calor dali se afaste enlameado e fétido. Seja você o espelho vivo de sua Fé!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 27 -  Não condene os que estão em posição de destaque na política ou na administração pública. Não diga que no lugar deles faria melhor. Enquanto não pomos em ação real nossas forças, não temos certeza do que são capazes. Talvez você fizesse pior, se estivesse na posição deles. Procure desculpar, porque não conhecemos as circunstâncias em que se encontram aqueles que têm sobre seus ombros o grande peso da responsabilidade pública.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 28 -  Visite os pobres e enfermos. Pelo menos uma vez por semana dedique algumas horas a consolar um coração aflito. O consolo que você levar, mesmo com sacrifício de sua parte, é a garantia de que está cumprindo um dever de cristão e de homem. Não espere que o procurem, para agir fraternalmente, amparando os fracos e confortando os tristes. Nem pense que você está dando mais do que recebe: quem consola um coração triste, na realidade recebe muito mais do que dá.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 29 -  Eleve seu coração em prece! Mas evite recitar fórmulas lidas ou decoradas. Que de seu coração partam as palavras espontâneas, como você faz quando conversa com um amigo querido. Prece não é obrigação que alguém desempenhe para "ver-se livre de um peso". Ore fervorosamente, mas sentindo as palavras que profere, para que a ligação com as Entidades Angélicas seja efetiva e real. Faça da Oração um hábito indispensável à saúde espiritual.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 30 -  Não transforme sua prece em petitório insistente! "O Pai sabe aquilo de que necessitamos, mesmo antes de pedirmos". Quando quiser alguma coisa para si, peça-o também para os outros, para todos os que estiverem nas mesmas condições. No momento da prece, evite o egoísmo. A prece é a melhor ocasião de demonstrarmos nosso amor. E pedindo para todos, com amor, seremos os primeiros a receber o benefício. Quem acende uma Luz, é o primeiro a iluminar-se.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 31 -  Veja, na criança, o futuro da humanidade. Mantenha-se, por isso, solidário com os trabalhos que visem a beneficiá-las. Lembre-se de que cada criança poderia ser um filho querido de seu coração. Colabore na recuperação das crianças desajustadas, sobretudo mediante seu exemplo dignificante e nobre. Em todos os setores, a criança é sempre o futuro, e por isso precisa ser atentamente ajudada em suas necessidades.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 32 -  Acate com respeito todas as religiões. Cada homem tem o direito de escolher o caminho que prefere. Respeite a liberdade de crença dos outros, tanto quanto aprecia que respeitem a sua. Não discuta nem procure tirar ninguém do caminho em que se acha, a não ser que seja procurado para isso. Respeite, para ser respeitado.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 33 -  Não se impressione com seus sonhos! Isto poderia levá-lo a extravagâncias ridículas. Viva acordado no bem, e os sonhos serão belos e bons. Se alguma característica de verdade lhe for revelada num sonho, aceite-a com simplicidade. Mas não se deixe levar a interpretações supersticiosas. Procure sempre o lado bom das coisas.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 34 -  Coopere com sua pátria, para engrandecer-se a si mesmo. A pátria é a reunião de todos nós. No entanto, evite buscar apenas vantagens pessoais, pois aquilo que você retirar a mais para você estará prejudicando a outrem, que receberá menos. Qualquer função é útil à comunidade, e o bem da coletividade se distribui a todos os cidadãos. Não abuse de seus privilégios.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 35 -  Ajude à Natureza! Não destrua os bens que a natureza coloca a seu dispor, para ajudá-lo a progredir. Coopere com as árvores, porque elas cooperam com a vida, na purificação do ar que você respira. Colabore com a pureza das fontes, porque elas lhe fornecem água para dessedentar seu corpo. Auxilie o solo a produzir, para que o pão seja sempre farto na mesa de todos. Ajude à Natureza!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 36 -  Não maltrate os animais! São também filhos de Deus e irmãos nossos menores, que não adquiriram a faculdade do raciocínio abstrato. Mas são amigos que precisam de nossa ajuda e carinho. Não lhes imponha trabalhos demais. Alimente-os bem. Trate-os em suas enfermidades. Faça com essas criaturas de Deus, que dependem de você, o mesmo que você gosta de receber dos Anjos do Bem.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 37 -  Porque está guardando tantas coisas inúteis? Para que tantas coisas em seus armários, quando seus irmãos estão com os deles vazios? Distribua tudo aquilo que lhe não está servindo, para que sua alma não fique pesada demais, quando se afastar da terra. "O coração do homem está onde está seu tesouro". Se você juntar muitas coisas inúteis, a elas poderá permanecer preso, sem conseguir alçar vôo para as regiões bem-aventuradas.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 38 -  Policie suas palavras. Evite termos impróprios e anedotas pesadas. Lembre-se de que tudo o que dizemos permanece em nossa atmosfera mental, atraindo aqueles que pensam da mesma forma, e que passarão a formar o círculo comum em redor de nós. Não ofenda com palavras baixas os Anjos de Deus, que se afastarão de você horrorizados. A boa educação se manifesta também através das palavras que partem de nós.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 39 -  Deus está dentro de nós em todas as circunstâncias da vida. Quer você esteja praticando um boa ação, quer esteja agindo errado, Deus está dentro de você. Quer você sinta felicidade, quer esteja ferreteado pelo sofrimento, Deus está dentro de você. Procure não esquecer esta verdade, em nenhum momento de sua vida: DEUS ESTÁ DENTRO DE VOCÊ!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 40 -  Desenvolva a parte humana de seu ser. Não viva apenas na parte vegetal ou animal, por meio do instinto. Desenvolva a parte humana do seu ser.  Procure conhecer a Verdade de sua origem e de seu destino, utilizando seu pensamento para conhecer-se a si mesmo cada vez mais. Por menos cultura que você possua, você tem uma inteligência, com capacidade para raciocinar e pensar.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 41 -  A cada um de nós compete uma tarefa específica, na difusão do bem. Erga-se, para trabalhar, porque as tarefas são muitas e importantes, e poucos são os que têm consciência delas. Ajude o mundo, para que o mundo possa ajudá-lo. Estenda seus braços eficientes no cultivo do Bem, para que, quando os recolher, os traga cheios dos frutos abençoados da felicidade e do Amor.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 42 -  Ajude, mesmo conversando! Uma boa palavra, um sorriso de incentivo, um pensamento construtor são, muitas vezes, o ponto de partida para uma grande vitória daqueles que nos cercam. Se observar tristeza ou preocupação, procure ajudar. Se não puder agir, fale. Se não puder falar, ao menos pense firmemente, desejando a felicidade e esta atingirá seu objetivo. Mas, ajude sempre!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 43 -  Se suas palavras forem ásperas e duras, se em todas as criaturas você descobrir um adversário, a vida se tornará uma tortura! No entanto, repare que a Terra é uma escola sagrada. E você poderá ser feliz, se conseguir ver em todos a boa vontade que os anima. Atraia para sua convivência amigos devotados, por meio de suas palavras, mas sobretudo de seus pensamentos voltados sempre para o Amor e o serviço do próximo.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 44 -  Sua irritação não solucionará problema algum! Medite na grande vantagem de não irritar-se, para não prejudicar sua saúde. Se você não se irritar, seu interlocutor voltará aos poucos à serenidade, e todos poderão entender-se. Seja calmo. Pense bastante antes de falar. E não se irrite, porque a irritação não pode solucionar nenhum problema.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 45 -  Se alguém não o compreende, perdoe, e siga em frente! Não guarde em seu coração mágoas e ressentimentos, medo e tristeza. Caminhe para a frente! Quanta gente espera de você apoio, compreensão e carinho! Se não o compreendem, não se importe. Perdoe e siga em frente, porque em todos os caminhos encontraremos sempre lições preciosas, que nos farão progredir.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 46 -  A educação no lar é a base da felicidade de nossos filhos. Dê toda a sua atenção para a formação do caráter de seus filhos, sobretudo por meio dos exemplos de sua própria vida. Não discuta jamais com sua esposa. Não dê jamais um passo errado. Viva de tal forma, que seu filho possa orgulhar-se de você, vendo, em seu exemplo, o modelo que ele deve seguir, para ser um homem de bem.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 47 -  O Amor e a alegria são os elementos básicos para conquistarmos amizades e as conservarmos. E são básicos, também, para nossa paz mental. Demonstre Amor e alegria em todas as oportunidades, e veja que a paz nasce dentro de você. A felicidade não pode estar em nada que esteja fora de você. Busque-a dentro de você mesmo, pois a felicidade é Deus, e Deus mora dentro de você.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 48 -  Fixe seu olhar no lado belo da vida! Há tanta coisa para ser contemplada e apreciada! As moscas buscam as chagas, num corpo inteiramente limpo. As abelhas buscam as flores, mesmo no meio de um pântano. Seja como as abelhas! Embora tudo em torno seja lama, procure com atenção, que há de descobrir uma pequenina flor, que venha alegrar sua alma. Fixe seu olhar no lado belo da vida!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 49 -  Jamais use palavras que façam seu companheiro desanimar no caminho do bem! Não lance aos outros o veneno que lhe haja penetrado na alma. Se você tiver tido uma decepção, avise-o de que poderá vir a sofrer, mas conforte sua alma. O desalento é um veneno. Não envenene seus amigos! Dê-lhes alegria, que é o melhor remédio que o céu fornece aos homens, capaz de curar todas as chagas.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 50 -  Se tiver que discutir, faça-o com serenidade. Lembre-se de que seu adversário tem os mesmos direitos que você, de fazer-se ouvido. Ouça-o com a mesma atenção que gosta de receber. Não tumultue a discussão: os direitos dele são iguais aos seus. E, quem sabe, muitas vezes a razão estará com ele. Então, discuta com serenidade, e conquiste fama de sábio e de homem bem educado.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 51 -  Aprenda a respirar. A respiração é nossa principal função biológica e através dela fornecemos ao organismo a vida e a saúde, trazidas a nós pela Energia Cósmica. Tudo o que vive, respira: plantas, animais e criaturas humanas. Se impedirmos a respiração, dá-se o fenômeno da morte. A respiração é a fonte da vida. Cada vez que aspiramos, introduzimos no organismo a Energia Cósmica, que é o Fluido Divino. Aprenda a respirar conscientemente e evitará numerosas doenças.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 52 -  Não perca sua serenidade! Quando a irritação nos move, a saúde se descontrola, os órgãos se perturbam e sofremos terrivelmente. Se o amigo o traiu, se sua parenta inventou uma calúnia, se aquele a quem você ajudou cometeu uma injustiça, uma ingratidão, perdoe! São pessoas enfermas: tenha pena delas. Mas você, não perca sua serenidade, não dê a entender que foi atingido.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 53 -  Tenha equilíbrio e alegria. Saiba ser reconhecido. Procure ser humilde. Não lance pedras a quem o beneficiou. Não se julgue diminuído quando o ajudarem. Saiba agradecer. Quebre seu orgulho e receba com gratidão o auxílio que lhe derem. E jamais esqueça o benefício nem o benfeitor. O pior dos defeitos é a ingratidão, que despreza e apedreja hoje quem nos beneficiou ontem.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 54 -  Cada um recebe de acordo com o que dá. Se você der ódios e indiferenças, há de recebê-los de volta. Mas se der atenção e carinho, há de ver-se cercado de afeto e Amor. Ninguém se aproxima do espinheiro, por causa dos espinhos, nem do lodo, porque suja. Mas todos apreciam permanecer perto das flores, que espalham beleza e perfume. Cada um recebe de acordo com o que dá.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 55 -  Você que é mãe, lembre-se de que o seu exemplo é a lição mais forte para seu filho. Não discuta com seu marido diante das crianças. Não critique o pai diante dos filhos. Não fale mal dele. Nunca o diminua com desprezo. O exemplo de um lar bem constituído é a maior felicidade que você pode legar a seus filhos. Por Amor deles saiba sofrer, se for preciso, porque eles são frutos que você mesma gerou.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 56 -  Seja otimista! Procure subir, e espere sempre que o melhor lhe aconteça. Embora as aparências sejam contrárias, confie em Deus, que está dentro de você, porque nEle existe a solução de todos os seus problemas. Olhe para o lado certo da vida, para a felicidade e o progresso, e não detenha jamais sua subida. Seja otimista, e há de vencer!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 57 -  Não pare jamais de trabalhar para o bem! Cada vez que paramos, nossa alma começa a ficar na rigidez cadavérica. A alma inativa morre de tédio e cansaço. Não deixe que seu espírito se enfraqueça na inação. Viva alegre e entusiasta e empregue todas as suas forças na plantação do bem, do amor, do carinho no coração daqueles que o cercam na vida.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 58 -  Não dê importância à idade de seu corpo físico: seja sempre jovem e bem disposto espiritualmente. A alma não tem idade. A mente jamais envelhece. Mesmo que o corpo assinale os sintomas da idade física, mantenha-se jovem e bem disposto, porque isto depende de sua mentalização positiva. Faça que a juventude de seu espírito se irradie através de seu corpo, tenha ele a idade que tiver.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 59 -  Você, que se acha enfermo, preso a um leito de dor, não desanime! A doença não é um mal, pois é através da enfermidade que nos libertamos das vibrações grosseiras dos maus pensamentos, das más palavras e das más ações. Suporte com paciência sua enfermidade, porque por meio dela se está purificando o organismo psíquico, sua alma, que só pode expulsar as impurezas por meio das doenças físicas.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 60 -  Não se deixe abater pelo desânimo! Não queira jamais abandonar a vida, porque isto nada resolve, e agravará ainda mais seus sofrimentos. Se você pensa que, fugindo, se sentirá aliviado, engana-se redondamente! Não se vingue dos outros, fazendo mal a si mesmo! Reaja com todas as suas forças, e não se deixe esmagar pela incompreensão alheia.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 61 -  Toda a natureza é uma harmonia divina, sinfonia maravilhosa que convida todas as criaturas a que acompanhem sua evolução e progresso. Seja, em sua vida, um instrumento apto a captar as vibrações de paz e serenidade da natureza, e sua saúde encontrará o equilíbrio necessário a prosperar cada vez mais. Viva de acordo com as leis da natureza, e com o espírito voltado para Deus.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 62 -  Seja fiel no cumprimento de todos os seus deveres. Execute com capricho e amor todas as tarefas que recebe, embora pareçam insignificantes. Qualquer coisa que esteja fazendo, por menor que seja, é um passo à frente em seu progresso. Realize suas tarefas todas, como se delas dependesse - como de fato depende - todo o seu futuro.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 63 -  Levante sua cabeça! Não fique triste! Porque vai aborrecer-se, pelo que disseram de você? Por quanto tempo continuará queixando-se, reclamando? Vamos, levante sua cabeça e siga em frente! Você é filho de Deus! Caminhe seguro, porque aqueles que falam de você vão ficar parados atrás, sem progredir. E quando eles perceberem, você já progrediu tanto, que eles o perderam de vista...', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 64 -  "Não se escravize às opiniões da leviandade ou da ignorância." Não importa o que os outros pensam ou dizem de nós. O que verdadeiramente importa é aquilo que realmente somos. Tenha sua consciência tranqüila, mesmo que seja condenado. Não se esqueça que Jesus foi condenado, e Herodes foi o vencedor momentâneo. Mas responda: qual dos dois foi verdadeiramente o vencedor?', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 65 -  Amigo, se por força de sua profissão é obrigado a lidar com o público, não perca sua paciência! Sabemos que é difícil manter-se calmo diante de certas pessoas, que já chegam irritadas, que são exigentes e não mantêm uma linha de boa educação. No entanto, é nesses casos que se deve evidenciar nossa virtude de calma e paciência. Controle seus nervos, e procure compreender e servir com amor.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 66 -  Não interrompa a manifestação de carinho a uma pessoa querida, só porque os outros o julgam errado. Consulte sua consciência e não dê ouvidos às vozes da inveja e do ciúme. O carinho é o óleo que lubrifica as engrenagens da vida, que já é dura por si mesma. A vida sem afeição é um inferno, um deserto sem oásis. Conserve seu carinho, dedicando-o às pessoas a quem você ama.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 67 -  Você, que é noiva, não acredite que o casamento seja loteria. Não! No casamento, o prêmio depende de você saber conquistá-lo. Prepare-se para ser feliz e para fazer feliz o homem a quem você ama. Estude seu gênio, não interfira em seus pensamentos, trate-o com Amor e carinho, e verifique que a sorte grande do casamento está em suas mãos. De você depende a sua felicidade!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 68 -  Tenha fé em seu corpo físico e esteja certo de que todos os seus órgãos funcionarão perfeitamente. Pensando assim, você ajudará sua própria saúde. Acredite no poder renovador da vida, em você. Afaste o pensamento da velhice. Deus está dentro de você! Renove sua saúde por uma respiração perfeita e jamais aceite a idéia da doença e do sofrimento. Deus age sempre em seu benefício.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 69 -  Caminhe sempre resolutamente no sentido de seu progresso. Se não quisermos acompanhar a evolução do universo, seremos arrastados a isso por meio da dor, e progrediremos de qualquer forma. Então, siga à frente voluntariamente. E não dê ouvidos ao caluniador. Siga à frente e deixe que os caluniadores fiquem falando sozinhos. Caminhe resolutamente no sentido do seu progresso, e nenhuma voz malévola chegará a seus ouvidos.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 70 -  Renove sua saúde por meio de afirmações positivas. Todas as suas células e seus órgãos cumprirão integralmente seus deveres, se você não os maltratar com pensamentos negativos de descrença, de medo, de raiva, nem de vingança. Envie pensamentos positivos de saúde a seus órgãos e células, e forneça a seu corpo alimentos sadios, para não lhe dar demasiado trabalho.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 71 -  O mundo está cheio da Luz Divina! Procure percebê-la e sentir em si as irradiações benéficas, que se derramam sobre todas as criaturas, aproveitando ao máximo o conforto que isto lhe trará ao espírito. Olhe tudo com olhos de bondade e alegria! Busque descobrir a Luz que brilha dentro de você e dentro de todas as criaturas, embora, muitas vezes, esteja ela recoberta por grossa camada de defeitos!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 72 -  Seja alegre e otimista! Quando se dirigir a seu trabalho, faça-o de coração alegre. O trabalho que você executa é digno de sua pessoa. Por menor que pareça, é de suma responsabilidade para você e para o mundo. Não se esqueça jamais de agradecer a Deus o trabalho que lhe proporciona o Pão de cada dia. Chegue ao local do trabalho com o coração feliz, e o trabalho se tornará um passatempo, um estimulante, que lhe trará, a cada novo dia, imensas alegrias e felicidade incalculável.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 73 -  Deus nos guia sempre, dando-nos a orientação de nossa vida. Mas precisamos ser receptivos, para ouvir Sua voz, sabendo-a interpretar através das circunstâncias que cercam nossa vida, levando-nos ao maior progresso espiritual de nosso ser. Procure meditar silenciosamente, para ouvir a voz de Deus, que o guia, sem jamais abandoná-lo.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 74 -  Sem esforço de nossa parte, jamais atingiremos o alto da montanha. Não desanime no meio da estrada: siga à frente, porque os horizontes se tornarão amplos e maravilhosos à medida que for subindo. Mas não se iluda, pois só atingirá o cimo da montanha se estiver decidido a enfrentar o esforço da caminhada.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 75 -  Não se esqueça de que, qualquer que seja sua posição na vida, há sempre dois níveis a observar: os que estão acima e os que estão abaixo de você. Procure colocar-se algumas vezes na posição de seus chefes; e outras vezes na posição de seus subordinados. Assim, você poderá compreender ao vivo os problemas que surgem dos dois lados. E, desta forma, poderá ajudar melhor a uns e a outros.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 76 -  Não limite o poder de sua vida! Não pense que conseguirá tudo o que deseja, numa só existência. Mas confie, porque a vida é eterna, infindável. Não pense também que, depois desta, irá iniciar uma vida diferente: nada disso! Esta mesma vida é que continuará sempre. Portanto, procure aumentar seus conhecimentos e aperfeiçoar-se, verificando como é rápido o momento atual, comparado com a eternidade!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 77 -  Coloque Deus, conscientemente, em tudo o que faz, em todos os seus problemas. E verificará que seus sofrimentos se transformarão em experiência e aprendizado. Coloque Deus em todos os seus pensamentos, e sua Vida se transformará num hino de alegria e louvor, porque as dores se esvairão como as trevas, que desaparecem aos primeiros clarões das luzes da aurora...', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 78 -  O que importa antes de tudo é o momento presente. O que foram nossos pais não tem importância: o que vale é o que você é agora. O momento presente é o criador de seu amanhã. Sua felicidade está baseada em seus pensamentos de hoje. Somos escravos do ontem, mas somos donos de nosso amanhã! Preste muita atenção ao momento que passa, ao que você está fazendo "agora", porque do seu "agora" depende seu "amanhã".', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 79 -  Tudo tem sua hora própria. "O próprio céu tem horário para as trevas e para a Luz". Aprenda com a Natureza! Se em certas horas precisamos receber, não se esqueça de que, noutras horas, temos obrigação de dar. Ajude, pois, mas sem querer substituir-se a quem você ajuda. Cada um precisa caminhar com seus próprios pés, para aprender a viver. Saiba distinguir o momento oportuno de dar e de receber.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 80 -  Não se irrite contra aqueles que o caluniam! São benfeitores seus, que lhe estão sempre chamando a atenção para seus erros, reais ou possíveis. Siga à frente! A dor é o adubo que faz crescer em nós a produção evolutiva. O arado que rasga o seio da terra é que permite a colheita abundante. E as lágrimas fertilizam nosso coração, tornando possível um progresso maior...', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 81 -  Deus está em toda a parte: portanto, está também dentro de todas as pessoas que nos cercam, boas ou más. Tudo provém de Deus. Tudo é manifestação divina. Mesmo aquilo que nos parece mal ou erro pode ser a causa de um benefício futuro. Nosso sofrimento resulta do desconhecimento da Verdade básica: Deus dirige todos os acontecimentos, porque está em tudo.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 82 -  Tenha bom ânimo e coragem: você vencerá todas as dificuldades! A vida apresenta-nos problemas às vezes difíceis. Mas dificuldade superada é problema resolvido. Jamais desanime: você há de vencer galhardamente todos os problemas que se lhe apresentarem. Se o problema for complexo, divida-o em partes, e vença cada uma delas separadamente. Mas não desanime jamais!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 83 -  Deus é a Energia Cósmica Universal, que habita dentro de você e de tudo o que existe nos universos infinitos, dando-lhes vida e força. Confie nessa Força Inesgotável, que está dentro de você. Mantenha sua mente ligada a Ela, e não mais se lamente do que lhe desagrada ou faz sofrer. Sorria diante das dificuldades e confie nAquele que o fortalece e vivifica.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 84 -  Mantenha elevado seu otimismo na Vida! Quem possui o coração cheio de Amor, nada teme! Arrosta todos os vendavais da Vida, com um sorriso nos lábios. Procure amar a todos e a tudo, mesmo àqueles que o fazem sofrer, e você se estará tornando perfeito, como o Pai Celestial, que dá a todos, sem distinção - bons e maus, justos e injustos - as mesmas oportunidades de salvação.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 85 -  Não alimente inimizades! Procure fazer as pazes com todos aqueles que estão de mal com você. Aproveite a oportunidade de estar ao lado de seus adversários, para fazer-lhes bem, em troca do mal que lhe fizeram. Não deixe escapar o ensejo de anular o mal em torno de você, enquanto estiver na Terra, para que, ao sair dela, tenha sua consciência tranqüila.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 86 -  Não diga jamais que é pobre. A pobreza não é falta de dinheiro: a pobreza verdadeira é a falta de compreensão. Todo aquele que compreende a vida, que sabe dizer uma palavra de conforto, que sabe estender a mão compassiva ao que sofre, que sabe distribuir alegria e otimismo, é rico, imensamente rico de bondade, que jamais falta, por mais que você a distribua por milhares de pessoas.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 87 -  Não perca de vista sua filiação divina. Deus é Pai de todas as crianças e vive dentro de cada um de seus filhos. Todas as criaturas são irmãs. As diferenças raciais e religiosas são apenas de superfície. Olhe para todos os templos vivos da Divindade, e ame a Deus através do Amor às criaturas, procurando servi-lO, servindo ao seu próximo com Amor e dedicação.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 88 -  Sua Luz deve brilhar de dentro para fora. Procure manifestar a todos a Luz interior que vibra em você, através de seus atos e de suas palavras de compreensão e de otimismo. Seja você mesmo sua própria luz, iluminando a todos com suas palavras de conforto e incentivo, com seu sorriso de entusiasmo e de encorajamento, com seu exemplo de fé e otimismo.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 89 -  Não perca sua serenidade. A raiva faz mal à saúde, o rancor estraga o fígado, a mágoa envenena o coração. Domine suas reações emotivas.  Seja dono de si mesmo. Não jogue lenha no fogo de seu aborrecimento. Esqueça e passe adiante, para não perder sua serenidade. Não perca sua calma. Pense, antes de falar, e não ceda à sua impulsividade.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 90 -  Procure descobrir o seu caminho na vida. Ninguém é responsável por nosso destino, a não ser nós mesmos. Nós é que temos que descobrir a estrada e segui-la com os nossos próprios pés. Desperte para a vida, para a Verdadeira Vida. E, se deseja a felicidade, lembre-se: você é o único responsável por seu destino. Supere as dificuldades, vença os obstáculos e construa sua vida.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 91 -  "Tudo coopera para o bem daqueles que amam a Deus"! Então, manifeste constantemente a todas as criaturas, que são a manifestação da Divindade em redor de você! Deus revela-se ao homem através do próprio homem. O melhor meio de amar a Deus é saber amar ao próximo, revelando-lhe as faltas, compreendendo seus problemas e ajudando-o em todas as circunstâncias.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 92 -  Você, que é enfermeira, ame os doentes que a procuram e que lhe foram confiados, como se fossem seus próprios filhos e irmãos. Sua missão é grandiosa e sublime, embora difícil e espinhosa. Não se irrite jamais! Os enfermos são exigentes, porque sentem mais necessidades de carinho do que as pessoas sadias. Seu carinho lhes apressará a cura, mais do que qualquer outro remédio.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 93 -  Não fique a pedir as coisas... Os braços parados nada produzem. As mãos que não ajudam criam ferrugem. Trabalhe com entusiasmo e alegria, e o próprio trabalho trará, com seus resultados positivos, a solução de todas as suas dificuldades. Procure gostar do trabalho que lhe cabe realizar, e dentro de pouco tempo terá a alegria morando em seu coração.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 94 -  Deus habita dentro de você! Deixe, então, que sua bondade se manifeste através de seus olhos, tornando-os brandos de compreensão, quentes de compaixão, ternos pelo perdão constante a todos... Que nenhum olhar de impaciência ou condenação tolde a beleza de sua vida! Que sua fisionomia irradie contentamento de felicidade, de tal forma que todos os que se aproximarem de você sejam contaminados por seu otimismo!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 95 -  Com os nossos pensamentos e palavras, construímos o verdadeiro mundo em que vivemos. Por isso, nossa vida e nossa felicidade dependem exclusivamente de nossos pensamentos e de nossas palavras. Vigie o momento presente, para que seu futuro seja feliz. Plante sementes de otimismo e de amor, para colher amanhã os frutos da alegria e da felicidade.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 96 -  Procure dar exemplos de paciência e desprendimento, servindo a todos com bondade e dedicação. A verdadeira vida é a vida do amor e do serviço. Derrame seu amor sobre todas as coisas criadas, desde a tenra plantinha até as constelações que gravitam nos espaços sidéreos. Mas, sobretudo, seja paciente e desprendido com as criaturas humanas, que vivem a seu lado, como seus companheiros de jornada.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 97 -  Seja forte nos embates da vida e não desanime se o sofrimento o visitar, em sua pessoa ou nas pessoas que lhe são caras. O sofrimento, além de purificar-nos, realiza o aprimoramento de nossa força interna. Ninguém consegue progredir, sem sofrer o exame da natureza, que verifica se realmente sabemos ser fortes, suportando as dores.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 98 -  Seja alegre, procurando fazer todo o bem que puder, nos dias em que permanecer na face da terra. Espalhe em torno de si esmolas de conforto, palavras de carinho, sorrisos de felicidade. Responda com alegria e otimismo a todos aqueles que lhe dirigirem a palavra, sem irritar-se jamais. Imprima, em cada dia de sua vida, toda a bondade que existe no fundo de seu coração.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 99 -  Mantenha a amizade de seus amigos. Saiba retribuir com gratidão os benefícios que recebe. Não seja ingrato! Se de alguém recebeu benefícios, não o esqueça, não o expulse da roda de sua amizade. Não fira seus amigos, não magoe aqueles que muitas vezes se sacrificaram, para dar-lhe momentos de alegria. Não negue seu carinho àqueles que se desvelaram para proporcionar-lhe felicidade.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 100 -  Não diga que não pode trabalhar em benefício dos outros. Quantos mudos dariam uma fortuna para poderem falar como você! Quantos paralíticos suspiram pelos passos que você pode dar! Quantos milionários que entregariam suas riquezas, para terem um décimo da fé que você tem! Não diga que não pode trabalhar! Distribua os bens que Deus lhe concedeu, em gestos de bondade e palavras de carinho.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 101 -  Não deixe que a calúnia perturbe sua vida. Não se nivele ao caluniador, para que não seja igual a ele. Não responda nem se altere. Continue sua estrada, se está com a consciência tranqüila, e não modifique seu modo de viver, só para obedecer ao caluniador. Talvez seja isto o que ele quer: tirá-lo do bom caminho. Não lhe obedeça! Caminhe para a frente imperturbavelmente!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 102 -  A terra espera pelo seu auxílio. Ela lhe dá o ar para respirar, desde que nasceu, a água para dessedentá-lo, o alimento para sustentá-lo, a residência para protegê-lo, e você, que é que dá em retribuição? Está contribuindo para a prosperidade da terra que o recebe de braços abertos permitindo-lhe a evolução e o aprendizado? Não se esqueça de que a terra espera pelo auxílio!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 103 -  Tenha fé em si mesmo, porque Deus está dentro de você. Portanto, ter fé em si mesmo é ter fé em Deus. Tenha confiança em suas capacidades, e caminhe sem temer os obstáculos. Você pode vencer! Você vai vencer! Corresponda à confiança que Deus depositou em você, quando lhe entregou as capacidades de que dispõe, para que você as desenvolvesse e pusesse em prática.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 104 -  Se você está enfermo, não desespere! Não pense em abandonar a vida, porque isto seria covardia vergonhosa de sua parte. Suporte com paciência a provação, e lembre-se de que a enfermidade é o melhor meio de purificarmos nosso espírito. Quanta gente sofre mais do que você, e no entanto resiste e reage heroicamente... Faça o mesmo: jamais desespere!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 105 -  Todas as vezes que olhar para uma criança, levante seu pensamento em ação de graças a Deus, que jamais abandona seus filhos. A criança é a esperança de hoje, na realização de amanhã. É a certeza de que a Terra está sempre a renovar-se, recebendo cada dia novos habitantes que lhe vêm trazer a contribuição de seu trabalho e de sua capacidade, para o progresso do mundo.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 106 -  Você está sofrendo? Supere sua dor com heroísmo, porque só os vencedores conseguirão o prêmio que se encontra à espera deles. Não se apresse, mas também não desanime. Supere sua dor com heroísmo, busque alegria, e viva com a sensação otimista daquele que sabe lutar sem desfalecimento. E verifique que sua vida se transformará num hino de ação de graças ao Pai Todo-Bondade.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 107 -  Quando a dúvida o assaltar, mantenha firme seu coração, no desejo sincero de perseverar até o fim. Se a mágoa e a calúnia o ferirem, não fique a lamentar-se inutilmente: gaste seu tempo em trabalhos construtivos, auxiliando a todos os que necessitam de seu apoio. Não se deixe desfalecer pelas dores! Ao contrário: eleve seu pensamento confiante, pedindo o socorro do Alto.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 108 -  Procure dar o mais que puder...  - uma boa palavra...  - um sorriso...  - um gesto de incentivo...  - um pensamento generoso... E você há de sentir em seu coração a grande verdade: é muito melhor dar que receber! Ainda não percebeu isso? Experimente, então! Ajude alguém, desinteressadamente, e observe como lhe virá bater à porta, com as mãos cheias de alegria, a maior felicidade que você possa conhecer em sua vida:  - A FELICIDADE DE DAR!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 109 -  A morte não existe! O que se dá é apenas uma transformação em nossa maneira de ser. Não espere que, depois desta, exista outra vida. Não! A vida é a mesma. A vida eterna já está sendo vivida por todos nós. Depois da morte, continuamos a ser o que já somos. Portanto, procure ser AGORA, antes da morte, aquilo que você deseja continuar a ser depois da morte. Porque a morte não existe!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 110 -  Caminhe alegre pela vida! Plante sementes boas de paz e otimismo, vivendo bem com sua consciência. Ajude aos outros o mais que puder, de tal forma que sua vida se torne uma alegria constante, por beneficiar a todos. Não pergunte se eles agradecerão ou retribuirão a você! Faça o bem, sem pensar na recompensa, porque só assim você demonstrará amor para com todos.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 111 -  Seja forte e corajoso. Não se deixe vencer pela adversidade, pela doença, pela dor. Saiba que a Força Divina jamais o abandona, porque está dentro de você mesmo. Reaja com firmeza, porque o auxílio lhe chegará na hora oportuna. A mesma força que está dentro de você dirige os universos infinitos... Tenha confiança e seja corajoso. Seja forte! Tenha bom ânimo!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 112 -  Não esbanje suas forças mentais com atividades de pouca importância e prejudiciais a você. Dê finalidade elevada a seus trabalhos. A alimentação e o sexo consomem demasiada energia mental, se não forem bem equilibrados. Canalize sua força espiritual e mental para os sublimes interesses da humanidade, para a felicidade das pessoas que o cercam.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 113 -  Não desanime! Aprenda a começar e a recomeçar! Não se deixe arrasar pela indiferença: se caiu, levante-se e recomece. Se errou, erga-se e recomece. Se não consegue dominar-se, firme sua vontade e recomece. Não desanime jamais! Talvez chegue ao fim da luta cheio de cicatrizes, mas estas se transformarão em luzes, diante do Pai Todo-Compassivo.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 114 -  Tenha cuidado em não magoar ninguém com suas ações, nem com suas palavras. Aprenda a dizer o "não" de tal forma, que não melindre. Não seja ríspido nem demonstre intolerância. Compreenda o ponto de vista dos outros, que têm tanto direito, quanto você, de ter sua opinião própria. Use, em todos os seus atos e palavras, de benevolência e gentileza. Domine sua irritabilidade!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 115 -  Plante sementes de bondade e de amor, mas não se preocupe com os resultados futuros. Se não obteve o bem que você esperava, ou se o benefício não provocou a gratidão desejada, não se aborreça. Ajude e passe adiante! Lance as sementes ao solo, e deixe que cresçam e frutifiquem segundo as possibilidades do terreno. Aguarde o tempo... Mas, por enquanto, plante as sementes da bondade e do amor, por onde quer que você passe.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 116 -  Tenha fortaleza e ânimo, para resistir a todos os embates e tempestades do caminho. Não se iluda: mesmo a estrada do bem está cheia de tropeços e dificuldades... Continue, porém! Não dê ouvidos às pedras colocadas pela inveja, pelo ciúme, pela intriga... Marche de cabeça erguida, confiantemente, e vencerá todos os obstáculos da caminhada. E, se for ferido, lembre-se de que as cicatrizes serão luzes que marcarão a sua vitória.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 117 -  Se o sofrimento bateu à sua porta, não se desespere: são bem-aventurados os que choram, porque serão consolados. O sofrimento parece a todos um mal, a dor apavora... Mas, quando aprendemos que a dor é uma libertação que nos devolve a paz de espírito, passamos a julgá-la menos dolorosa. Para que sua dor doa menos, aprenda a conformar-se com ela, porque ela representa sua libertação.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 118 -  Você, que é jovem, construa a sua felicidade em bases sólidas. A felicidade não depende dos outros, mas de nós mesmos. Se alguém quiser desviá-lo do bom caminho, não o acompanhe: siga a estrada reta do bem, pois só assim conseguirá ter alegria em seu coração. Estude o mais que puder, ouça os conselhos de seus pais, seja puro e sincero em suas afeições, pois assim construirá uma vida nobre e digna.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 119 -  Não perca sua calma! Não se deixe dominar pela cólera. Que jamais o sol de deite sobre sua raiva. Contenha-se o mais que puder. Um simples raio de cólera pode destruir longas e pacientes sementeiras de amor e carinho! Procure dominar-se. Quem sabe se a pessoa que o ofendeu não está doente? Não perca sua calma... Seu fígado é demais precioso para que você o estrague.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 120 -  Não repise suas dificuldades e dores, porque isso prejudica sua saúde, provoca enfermidades. Não dê a seu corpo alimentos nocivos, de pensamentos negativos. Fale sempre de saúde e riqueza, de progresso e vitória. Diga: "a força de Deus habita dentro de mim!" Os bons pensamentos produzem frutos de alegria e aumentam a felicidade cada dia mais. A palavra do homem é responsável pelo estado de sua saúde física.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 121 -  Você, que é mãe, que recebeu uma linda flor do céu para cultivar no jardim da terra, mantenha sua mente ligada ao Pai Celeste, que ele a sustentará sempre em suas lutas. Olhe para seu filho com carinho. Pense nas criaturas que não conseguiram gerar um filho em suas entranhas! E pense nos milhares de pequeninos que não encontraram ninguém que com eles tivesse o carinho de mãe! Seja paciente com seu filho!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 122 -  Não julgue o seu próximo. Não pense mal das pessoas. Quantas vezes as aparências enganam, e o que pensamos ser um erro é o que está certo nos outros. Não julgue para não ser julgado! Se você estivesse na situação "dele", talvez fizesse pior, e não gostaria que o julgassem mal... Não faça aos outros o que não gosta que os outros façam a você.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 123 -  Quando ensinar, não seja arrogante. E não se esqueça de que o aprendizado dura a vida toda. Procure aprender também, em todas as ocasiões, e não despreze um bom conselho, só porque lhe chegou de lábios que você julga menos puros. Deus ajuda aos homens por meio dos próprios homens, e às vezes se serve de pessoas que não são perfeitas, para dar-nos avisos importantes.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 124 -  Procure não ler coisas desagradáveis e tristes, escândalos e desastres. Leia e pense somente o que é bom e puro, belo e verdadeiro. Afirme a si mesmo que estes são os únicos estados dignos de Deus e do homem. Não converse sobre suas doenças, dificuldades ou pobreza. Quanto mais falar nisso, mais as agravará. Converse apenas sobre fartura e saúde, e viva com otimismo e alegria.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 125 -  A beleza transitória da matéria passa depressa. Procure sondar a beleza interna das pessoas com quem convive. Há flores belíssimas e perfumadas, que só duram poucas horas. No entanto, apesar de feias, as pedras duram milênios, realizando suas tarefas. Não seja, pois, leviano. Não prefira o efêmero ao eterno, a beleza à Sabedoria. Firme-se no que dura para sempre, que é o Espírito Imortal, nosso verdadeiro EU, e não no que cedo desaparece.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 126 -  Você que é professor, procure modelar seus alunos com seu próprio exemplo. O exemplo vale mais do que as palavras. Tenha paciência, responda de boa mente as perguntas, porque os alunos são muito receptivos e ansiosos de aprender. Dê tudo o que pode, entregue-se à sua profissão como um sacerdócio dos mais sublimes, e tenha a alegria de ver uma plêiade de jovens que trabalharão em benefício de todos, e que foram formados por você.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 127 -  Não julgue pequena demais sua tarefa. Nenhuma obra de arte pode descurar dos pormenores. Se as minúcias forem perfeitas, é que podemos denominar alguma coisa de obra-prima. Não busque tarefas grandiosas e de evidência. Procure dar conta integralmente do serviço pequenino que lhe foi confiado. Da perfeição com que o executar dependerá sua oportunidade para receber uma incumbência maior.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 128 -  Saiba viver os belos momentos de sua vida. Aproveite os minutos de alegria, sem pressa de novamente mergulhar nos trabalhos agitados. Goze amplamente seu repouso espiritual. Olhe a paisagem, contemple as estrelas, aprecie os caprichos da natureza, colha em todos os canteiros as flores da alegria! Saiba viver integralmente os belos momentos de sua vida!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 129 -  Não se deixe arrastar pela vaidade. Aprenda a conhecer-se. Não se julgue indispensável. Quando vier a tentação de julgar-se insubstituível, lembre-se de uma verdade irrefutável: só Deus é indispensável. Não se envaideça! Deus, que é grande, não assinou nenhuma de suas obras... Não se esqueça: quem se exalta será humilhado, mas quem se humilha será exaltado.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 130 -  Não pense que abandonar a vida poderá resolver seu caso. Ao contrário, vai complicá-lo ainda mais. Não seja covarde! Enfrente a luta, que todos os seus esperam de você a coragem de lutar até o fim. Não fuja do campo de batalha, justamente na hora em que o combate se torna mais aceso. Seja corajoso! Não fuja às responsabilidades que você assumiu.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 131 -  "Quando você encontrar trevas diante de si, não esbraveje contra elas: ao contrário, procure acender uma luz". Quando alguém errar, não o condene nem ataque: acenda uma pequenina luz diante dele, com seu exemplo. Nada melhor existe para ajudar aos outros do que mantermos nossa luz acesa; servindo nosso exemplo de farol para guiar o próximo, mostrando-lhe o caminho da subida.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 132 -  Não deseje aquilo que pertence a outrem. Não queira enriquecer à custa de outra pessoa. Tudo o que é seu, por direito divino, lhe há de chegar às mãos, na hora oportuna: nem mais cedo do que deve, nem com atraso. Na hora exata, você receberá aquilo que merecer. Portanto, trabalhe confiante no Pai, pois não cai um fio de cabelo de sua cabeça, sem a permissão dEle.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 133 -  Não se queixe do mundo. O mundo não é mau. Os homens é que ainda não conseguiram ser bons. Mas na lama imunda nasce a pureza dos lírios. E também daquilo que nos parece mau e impuro pode surgir a luz mais sublime. Repare que a Luz não suja, mesmo quando é refletida pelo pântano. Procure ter apenas pensamentos bons, porque eles não serão maculados, nem mesmo quando refletidos em ambientes menos puros.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 134 -  Não creia que encontrará a perfeição naqueles que o rodeiam. A sublimidade é difícil. Portanto, se encontrar falhas naqueles que você admira, não se decepcione: dê a eles o maior carinho e apoio, para que possam reparar as oportunidades perdidas. Não despreze a quem erra: procure erguê-lo, exaltando aquelas qualidades que todos têm dentro de si, de modo que ele possa vencer e subir.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 135 -  Se está enfermo, não se impressione. Qualquer mal, ou aparência de mal, é coisa passageira. A única essência eterna e real é Deus, que é todo o Bem, a Saúde perfeita, a Felicidade integral, a Alegria sem sombras. Se a doença o está experimentando, procure unir-se mentalmente à Energia Cósmica que lhe penetra o organismo juntamente com o ar que respira, e busque assim o revigoramento e a purificação de todas as suas células.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 136 -  Derrame raios de sol de alegria em torno de si. Desta maneira, formará um círculo de pessoas que sentirão prazer em estar a seu lado. Quando algum amigo seu estiver triste, sabe que encontrará alegria em você. Derrame sua luz sobre todos os que o rodeiam, porque a alegria é obra Divina. Seja um raio de luz a iluminar as criaturas que se acercam de você.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 137 -  O Céu está dentro de você! Aprenda a viver no paraíso. Não é preciso morrer para ir para o céu, não! Nós criamos em nós os infernos de tristeza e angústia. Então aprenda a criar o paraíso da alegria. Perdoe sempre e siga adiante, evitando aborrecer-se. Não dê importância ao que dizem de você. Deixe que sua alegria brote de seu coração bom e generoso.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 138 -  Não se prenda às opiniões da multidão! Viva sua vida, de acordo com as luzes que lhe chegam do Alto. A multidão julga o lado exterior. O íntimo só Deus conhece. O mundo não pode conhecer os ensinamentos de Amor do Mestre. Prefira obedecer ao Mestre amando sempre, e não dê valor às opiniões da multidão, que tudo faz para que sejamos iguais a ela, sem personalidade e sem opinião própria.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 139 -  Estude sua própria personalidade. De nada nos valerá o conhecimento de todas as ciências do mundo, de tudo o que está fora de nós, se não conhecermos a nós mesmos. Estude sua alma, que é seu Verdadeiro Eu, que se reflete em sua personalidade exterior. Nosso corpo é a projeção de nossa alma. Conheça a si mesmo, para viver uma vida consciente e feliz.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 140 -  Se algo de errado lhe aconteceu na vida, não diga que foi "vontade de Deus". Não! Deus quer apenas nosso bem e nossa felicidade, e nos dá os meios de sermos felizes. O mal que vem sobre nós é resultado de nossos erros do passado, de nossa ignorância. Faça em seu redor uma sementeira de bondade e de perdão, para que amanhã possa colher os frutos da paz e da felicidade.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 141 -  Não procure colecionar tesouros apenas nesta terra, porque os ladrões podem roubá-lo e seu tesouro pode envelhecer. Além disso, não se esqueça de que, quando partir da terra, aqui deixará tudo, até seu próprio corpo. Então, porque ser avarento? Colecione os tesouros das boas obras, do bem que pratica em benefício do próximo, porque essas riquezas o acompanharão além-túmulo.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 142 -  Procure interessar-se pelas crianças, que são o futuro do mundo. Cuide delas com amor, e não com indiferença. Quantos cárceres estão cheios, por falta de carinho nos lares! Não se esqueça de que o criminoso mais cruel foi, um dia, uma criança pura e inocente como todas as outras... Cuide das crianças com desvelo e carinho, e terá preparado um futuro feliz para a humanidade.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 143 -  Não desanime, não pare no primeiro degrau da ascensão. Se a dúvida o assaltar, se a tristeza bater à sua porta, se a calúnia o ferir, erga sua cabeça corajosamente e contemple o céu iluminado e tranqüilo. Embora recoberto de nuvens, você sabe que elas passarão, e o céu voltará a brilhar. Siga à frente, que todas as nuvens da existência também hão de passar e voltará a brilhar o sol da alegria.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 144 -  Não dê ouvidos às intrigas e calúnias; só a árvore que produz frutos é que se vê apedrejada, para deixá-los cair. À árvore estéril ninguém dá importância. A calúnia, muitas vezes, é uma honra para quem a recebe. Não pare seu serviço por causa da calúnia. Se pára de fazer o que estava fazendo, dá razão ao caluniador. Siga à frente, e todos acabarão calando-se e no fim ainda baterão palmas ao seu trabalho.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 145 -  O homem é o que pensa. Se você insistir em pensar no mal, na dor, na doença, você os atrairá para si. Pense na saúde, na alegria, na prosperidade, e sua vida tomará novo rumo. Afirme sempre que é feliz, que as dores passam, que a saúde se consolida cada vez mais, e a felicidade baterá à sua porta. Seja otimista e permaneça o mais possível ligado ao Pai Celestial.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 146 -  Cuide bem do seu corpo, dando-lhe alimentação sadia e frugal. Não abuse de carnes nem de bebidas alcoólicas. Mas não esqueça também que a alma precisa de alimentação! Procure ler bons livros. Faça da leitura um hábito diário. Não é só de pão que vive o homem: é também da Sabedoria. E esta você a encontrará nos bons livros, companheiros deliciosos e cheios de ensinamentos úteis.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 147 -  A cooperação é uma das coisas mais sublimes da vida, mas a interferência é uma das mais desagradáveis. Ajude sem interferir. Não imponha seu ponto de vista quando ajuda alguém. A cooperação ajuda, a interferência atrapalha. Então, coopere com todos, mas sem interferir em sua maneira especial de agir e de pensar. Não temos o direito de interferir na vida de ninguém.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 148 -  Não fique remoendo as coisas do passado. Ficar preso ao passado não dá futuro. Não se deixe prender por mágoas e ressentimentos. Não se atormente com o que passou, mesmo que reconheça seu erro. Levante-se e siga à frente, o mais rapidamente que puder. Faça as pazes com seus adversários, envie pensamentos de simpatia e amor, e todas as mágoas se afastarão e você viverá feliz e risonho.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 149 -  "Levante todos aqueles que estiverem caídos em seu redor. Você não sabe onde seus pés tropeçarão". Estas palavras de André Luíz nos alertam quanto ao dever de ajudar a todos os que caem, não só física, como moralmente. Não critique quem cair. Ajude-o a erguer-se, tal como você gostaria que fizessem com você, se estivesse no mesmo caso.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 150 -  Quando der uma esmola, não anuncie a todos. "Não saiba sua mão direita o que faz a esquerda". Ajude sem alarde, para não humilhar aquele a quem sua generosidade ajudou. Respeite o próximo e ajude sempre, mas em silêncio, porque o Pai, que vê no segredo, o recompensará muito mais do que o reconhecimento público que tiverem seus atos.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 151 -  Interprete corretamente a frase de Juvenal: "mente sã - corpo são". Não é a mente que depende da saúde do corpo. Ao contrário, é o corpo sadio que depende da mente sadia. Quando o espírito está perfeitamente equilibrado, não há enfermidades que nos ataquem. Cuide de sua mente, para que a saúde se reflita em todo o seu corpo.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 152 -  Para você subir na vida, dois degraus existem de suma importância. São representados por dois verbos: AMAR e SERVIR. Jamais desanime na escalada dos valores da alma, e procure em todas as circunstâncias Amar e Servir a todos e a tudo, para ajudar ao máximo o progresso do planeta que o recebe tão generosamente, auxiliando-lhe a evolução.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 153 -  Tenha coragem em todas as circunstâncias da vida. Por piores que lhe pareçam as dificuldades, tenha a certeza de que pode superá-las com a persistência e a força que provêm de seu íntimo. Deus está dentro de cada um de nós, pronto a dar-nos energia e vigor, ânimo e incentivo. Confie na bondade do Pai, que jamais desampara nenhum de seus filhos.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 154 -  O minuto que você está vivendo agora é o mais importante de sua vida, onde quer que você esteja. Preste atenção ao que está fazendo. O ontem já lhe fugiu das mãos. O amanhã ainda não chegou. Viva o momento presente, porque dele depende todo o seu futuro. Procure aproveitar ao máximo o momento que está vivendo, tirando todas as vantagens que puder, para seu aperfeiçoamento.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 155 -  Lembre-se de que não devemos humilhar ninguém. Os erros que os outros cometem hoje, nós podemos cometê-los amanhã. Não se julgue inatingível nem infalível. Todos podem falhar. Trate os outros com tolerância, para que possa reerguê-los, se errarem. A perfeição não é desta terra. Não exija dos outros aquilo que você também ainda não pode dar.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 156 -  Procure compreender o próximo. Não magoe aqueles que o beneficiaram. Procure compreender as palavras e ações dos outros, especialmente se o amam. Não fira a sensibilidade alheia, porque você sabe como sofre, quando fazem isso com você. Como dói ouvir palavras duras, de ingratidão, proferidas pelos lábios da pessoa a quem amamos! Não faça isso! Procure compreender os outros!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 157 -  Ajude a todos, como desejaria ser ajudado. Se tem empregados, saiba compreender suas dificuldades, tanto quanto você deseja que eles compreendam as suas. Coloque-se no lugar deles, e trate-os como você gostaria de ser tratado se ocupasse a posição deles. Seu empregado é um irmão seu, que está iniciando a sua carreira. Ajude-o o mais que puder e não se arrependerá.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 158 -  Você já reparou que é um herói? O trabalho diário, as conduções difíceis, a luta constante, tudo isso forma de você um herói. Então, não desanime, porque os heróis superam as dificuldades com alegria. Jamais se irrite! Olhe para todos com bons olhos, procurando distribuir a coragem e alegria que habitam em você. Você é um herói, comporte-se como um herói!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 159 -  Não se esqueça de que somos o reflexo daquilo que pensamos. O pensamento plasma nossa vida de amanhã. Aproveite, portanto, o momento que passa, a fim de construir um amanhã risonho. Plante em torno de você as sementes de otimismo e bondade, para que possa colher amanhã os frutos do amor e da felicidade. Se somos escravos do ontem, somos donos de nosso amanhã.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 160 -  Não duvide do poder da bondade, embora pareça que tudo está contra você. Um coração com Deus representa maioria, contra toda uma multidão desvairada. A bondade praticada em todos os momentos é uma sementeira que nos garantirá colheitas de felicidade e paz. Só quem planta bondade encontra dentro de si força de viver com Deus. Use, então, sem restrições, a bondade de seu coração.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 161 -  Nem tudo o que nos aborrece e faz sofrer é, forçosamente, um mal. Quando os irmãos de José o venderam, o que parecia um mal tornou-se maravilhoso bem, pois lhe deram oportunidade de chegar a ser governador do Egito. Tenha confiança no Pai, que sabe extrair o bem daquilo que nos parece um mal. Não se desespere. Confie e siga à frente!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 162 -  Viva com simplicidade. Porque complicar as coisas? Você acabará atrapalhando sua própria vida, porque as complicações nos atrasam. Seja simples e eficaz. A simplicidade olha a natureza sem colocar óculos. Quando puder resolver as coisas sem complicá-las, faça-o em seu próprio benefício. Busque na simplicidade a solução de todos os seus problemas.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 163 -  Mantenha seu equilíbrio. O equilíbrio depende da serenidade da mente. Jamais se aborreça nem se exalte. Não ligue importância às coisas passageiras que lhe vêm de fora. Não se impressione com o que os outros dizem. Siga a conduta ditada por sua consciência, e não perca seu equilíbrio. Caminhe para a frente, alegre e certo de que há de vencer, por maiores que sejam as dificuldades do caminho.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 164 -  Assim como os universos foram criados pela palavra de Deus, assim também nossos pequenos mundos individuais são criados pelas nossas palavras. E as palavras são a manifestação dos pensamentos, a fim de criar um mundo de paz e beleza, de saúde e felicidade, através de palavras amáveis e delicadas, corteses e animadoras. Lembre-se de que, uma vez proferida uma palavra, nada mais a destrói.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 165 -  O homem não pode viver isolado. Lembre-se de que cada companheiro de jornada é um amigo que o ajuda e a quem você precisa também ajudar. A cooperação existe entre todas as coisas criadas. Procure você também cooperar com tudo e com todos, em benefício da própria Terra que o acolhe bondosamente, permitindo sua evolução. Ajude sempre, e jamais desanime.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 166 -  Não sinta medo, para não atrair críticas. Se tem certa maneira de comportar-se que sabe que está certa, mas os outros julgam errada, não tenha medo. Se tiver, atrairá uma onda de críticas e maledicências. Se não tiver medo, ninguém terá coragem de falar de você. O medo irradia forças negativas, que atraem críticas. Se você não teme, paralisa a crítica nos outros, que se sentem tolhidos e dominados por sua força mental positiva.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 167 -  Não se deixe levar pela zanga nem se impaciente. Não permite que a inveja, a malícia, a idéia de vingança e o ressentimento encontrem lugar em sua mente. Essas emoções criam distúrbios no consciente e agem negativamente sobre seu corpo e seus tecidos, prejudicando a saúde. Cultive a paciência, a tolerância, o perdão e o Amor para com todas as criaturas.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 168 -  Não se desespere diante das dificuldades. Colhemos aquilo que plantamos. Somos escravos do ontem, mas somos donos de nosso amanhã. Se construiu um presente doloroso, fique alerta, para construir um futuro alegre, saudável, no qual possamos colher os frutos do amor e da felicidade sem limites. Faça o bem de todas as formas, para preparar um futuro melhor.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 169 -  O Amor é uma doação e não uma exigência. Quem realmente ama, dá tudo e nada pede. Quem pede e exige da pessoa que diz amar demonstra que verdadeiramente não ama: ao contrário, revela o egoísmo em alto grau.  Amar não é receber, é dar. Não é pedir, mas proporcionar felicidade desinteressadamente. O melhor exemplo do Amor verdadeiro é o das mães, que sabem amar com renúncia.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 170 -  Não repita apressadamente aquilo que ouve. Informe-se primeiro da verdade. Se for mentira, procure desmentir. Se for verdade, mesmo assim não o repita. Se não puder chegar à evidência, cale. A caridade consiste em saber calar os defeitos alheios, como você gosta que façam com os seus. Seja prudente: o silêncio é de ouro, quando se cala o erro do próximo.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 171 -  Quem é corajoso não foge da batalha da vida. Todos temos nossas lutas, mas só quem sabe suportá-las pode ser classificado de herói, de Homem em toda a extensão do termo. Saiba merecer o título de Homem, saiba ser herói, não desanime diante das dificuldades. Enfrente a vida, tal qual se apresenta, com suas alegrias e dores, e jamais pense em fugir covardemente.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 172 -  Você, que é pai, é a criatura mais feliz sobre a face da terra. Levante os braços aos céus e agradeça a Deus a misericórdia que lhe concedeu. Mas lembre-se de que não basta dar aos filhos o sustento e a instrução. Algo existe mais importante que tudo isso: é o exemplo. Dê a seus filhos o exemplo do trabalho, da honestidade, da dignidade em toda a sua vida.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 173 -  Se você enveredou na senda da política, saiba que não foi por acaso. Deus colocou em suas mãos o destino de sua pátria. Desperte sua consciência íntima, para assumir essa tremenda responsabilidade. Muito lhe foi dado e, por isso, muito lhe será pedido. Não deixe que a vaidade e os interesses pessoais o desviem da missão que o trouxe ao mundo. Conduza a pátria à felicidade e à paz.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 174 -  Para que discutir? Repare que, muitas vezes, um pequenino gesto, uma simples ação de benefício, equivalem a milhares de palavras, que o vento leva. A quem você quiser convencer de suas idéias, dê o exemplo vivo de suas ações. Um exemplo vale mais do que muitos discursos. Que adianta pregar aos outros se você não pratica? Dê o exemplo de suas ações, e conquistará a todos para suas idéias.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 175 -  Seja alegre e otimista: Deus está dentro de você. Não faça como os tolos, que pensam que Deus está muito longe, sentado num trono de ouro. Nada disso. Não o procure nas nuvens ou nas estrelas, tão alto que não o possa atingir. Ele está dentro de você, e lhe fala silenciosamente, pela voz de sua consciência. Procure descobri-lo, vivendo com pureza de coração e amando a todos como a si mesmo.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 176 -  Convença-se de que o mundo não é um parque de recreio: é um ambiente de trabalho! Não é um feriado que nos tenha sido dado para repousar, mas um curso de aprendizado intensivo. Procure, pois, aprender o máximo, aplicando à sua vida o maior mandamento: ame a todos indistintamente, e verá a felicidade morar dentro de seu coração. Viva dando um exemplo vivo de amor em todas as suas ações.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 177 -  Faça questão de ser alegre e otimista. Nada na terra pode destruir a felicidade do homem otimista e alegre. Se lhe chegarem dores, receba-as com calma e não se deixe atingir por elas. Não coloque sua felicidade no que lhe vem de fora. Construa sua felicidade dentro de você mesmo, fazendo consistir sua ventura no progresso constante da vida do espírito, na sabedoria do coração.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 178 -  Não se deixe abater pela tristeza. Todas as dores terminam. Aguarde que o Tempo, com suas mãos cheias de bálsamo, traga o alívio. A ação do Tempo é infalível, e nos guia suavemente pelo caminho certo, aliviando nossas dores, assim como a brisa leve abranda o calor do verão. Mais depressa do que supõe, você terá a resposta, na consolação que necessita.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 179 -  Seja humilde. A vaidade é o pior dos defeitos, porque engana a nós mesmos. Por mais que seja sábio, há sempre alguém mais sábio que você. Por mais forte que seja, haverá alguém mais forte. Portanto, seja humilde. Envaidecer-se de quê? A vaidade nos faz perder o sentido das proporções, e acabamos caindo no ridículo, porque nos enganamos a nós mesmos.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 180 -  "Se alguém diz que ama a Deus, mas não ama a seu semelhante, é mentiroso". Isto foi escrito pelo apóstolo São João, e expressa uma grande verdade. Deus está dentro de todas as criaturas. Então, se temos raiva de alguém, isto atinge o próprio Deus que nele habita. Demonstraremos nosso Amor a Deus, que não vemos, sabendo amar as criaturas que vemos e que vivem em torno de nós.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 181 -  Não perca seu equilíbrio interno. Por maior que seja a tempestade que o envolve, não perca seu equilíbrio. Todas as tempestades passam. E se soubermos recebê-las com serenidade, nenhum mal nos causarão. Jesus dormia no fundo da barca... Quando os discípulos o chamaram, nervosos, ele acalmou tudo. Faça o mesmo. Recorra ao Mestre Divino, para que as tempestades se acalmem a seu lado.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 182 -  Não se deixe levar pelo extremismo. Nem exagero para mais, nem para menos. Saiba permanecer no meio termo. Se correr demais, cansará. Se ficar muito parado, acabará consumindo o terreno debaixo dos próprios pés, e dentro de pouco estará pisando uma cova. Não pare, mas também não queira correr demais. Caminhe firme e com segurança, sem pressa, mas não se detenha jamais na senda do progresso.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 183 -  Esqueça-se um pouco de si mesmo e pense nos outros. Nestas poucas palavras está encerrado o maior segredo da felicidade. Quando nos preocupamos demasiado com nossas pessoas, nossos problemas crescem desmesuradamente. Mas quando esquecemos de nós um pouco para cuidar dos outros, esquecemos nossos problemas que se vão resolvendo por si mesmos. Então, esqueça-se de si mesmo, e pense nos outros, e achará a felicidade.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 184 -  Todos nós somos iguais perante o Pai, que habita dentro de cada um de nós. Vivendo o Pai em nosso íntimo, pouca importância dá ao nosso exterior, se somos brancos ou negros, pobres ou ricos, desta ou daquela religião. Diante de Deus não contam as diferenças externas: só o interior importa: se somos bons ou maus, generosos ou avarentos, amorosos ou egoístas. Pense nestas verdades.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 185 -  Já pensou em agradecer a Deus pelo ar que respira, desde que nasceu, sem que jamais lhe tenha faltado? O ar está sempre à sua disposição, de graça. Agradeça ao Pai também a água que o dessedenta, o sol que ilumina o seu dia, dando-lhe oportunidade de trabalhar, a noite que lhe proporciona o repouso, a saúde, a alegria, os amigos... O agradecimento é uma obrigação que não devemos jamais esquecer.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 186 -  Não tenha medo! Medo de quê? Nossa vida é eterna, nosso eu, que é nossa alma, não morre nunca. A vida continua eternamente. Procure sentir Deus palpitando dentro de si, na vida que pulsa em seu coração, nos pensamentos que povoam seu cérebro. Não tenha medo, porque Deus está permanentemente dentro de você. Siga seu caminho confiante e sereno, e descobrirá Deus em tudo.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 187 -  Saiba viver eternamente, buscando estudar e aprender coisas úteis e proveitosas a você e ao próximo. Quando paramos de aprender e de progredir, começamos a morrer realmente. Aprenda o mais que puder, em todos os ramos do saber, para iluminar ao máximo o seu espírito. Aproveite todos os seus minutos, para aprender, para aumentar seus conhecimentos.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 188 -  Não confunda cultura com sabedoria. A cultura vem de fora para dentro, penetra pelos olhos e ouvidos e pode fixar-se ou não em nosso cérebro. A sabedoria, ao contrário, nasce de dentro de nós, e se exterioriza; surge no coração e só pode ser adquirida por meio da meditação. Até os analfabetos podem conquistar a sabedoria, se souberem meditar em seus corações sobre as grandes verdades.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 189 -  Desperte para a vida. Medite em suas responsabilidades perante a humanidade e perante Deus. De você dependem criaturas que o cercam, na família, no trabalho, na sociedade. Não fuja à responsabilidade que você assumiu: realize seu trabalho com amor, produzindo o melhor que puder, e o máximo que suas forças o permitirem. Em suas mãos está uma parte do futuro da humanidade.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 190 -  Você não tem inimigos externos! Inimigos nossos são os pensamentos errôneos que todos nós temos, e que lançamos ao ar, atraindo pensamentos semelhantes no próximo. Na realidade, ninguém pode ser inimigo nosso, pois Deus habita dentro de cada um de nós. Anule as inimizades emitindo pensamentos de tolerância e de amor a todas as criaturas, que são templos de Deus.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 191 -  Seja alegre e otimista. Não perca tempo em olhar para trás, para ver o que já fez. Olhe para a frente e caminhe confiante e alegre, praticando o bem e ajudando a todos. Dê a mão a cada criatura que se lhe aproxima, diga sempre uma palavra de conforto e carinho, tenha para todos um sorriso de bondade, e a verdadeira felicidade passará a constituir seu clima permanente de vida.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 192 -  Procure anular a parte inferior, para desenvolver a parte superior de seu ser. Os antigos chamavam "centauros" àquele misto de homens na parte superior e cavalos na parte inferior do corpo. Não seja assim. Procure tornar-se totalmente homem, vencendo e dominando a parte inferior e animal de seu ser, para que apareça e sobressaia, apenas, a parte superior, inteligente e nobre.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 193 -  Quantas vezes queremos ser bons e amáveis, e vemos destruídos nossos propósitos de virtude. Mas ser bom com quem é bom não é vantagem. O heroísmo consiste, justamente, em ser bom com quem é mau. Em permanecer calmo diante das pessoas irritantes. Em ser generoso com as pessoas egoístas. Procure chegar a esse ponto e demonstre, com o exemplo, que você sabe ser bom.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 194 -  O mal não merece comentários, pois só traz resultados desagradáveis. Qualquer palavra produz vibrações, que atraem vibrações semelhantes. Portanto, o comentário sobre o mal atrai vibrações pesadas e nocivas. Fale apenas a respeito de coisas belas e boas, comente o bem e as ações nobres, e permanecerá envolvido por uma onda de paz, de alegria, de bem-estar.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 195 -  Jamais engane os outros, para não ser enganado. Seja sempre verdadeiro. Não minta, para que sua consciência permaneça tranqüila e seu sono seja calmo. Fuja do remorso e não prepare para si mesmo um futuro doloroso, pois nada torna uma pessoa tão infeliz quanto o sentir que ninguém mais confia nela. Seja sempre verdadeiro e há de angariar muitos amigos leais e sinceros.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 196 -  Você que tem a felicidade de ver seus netinhos, tão lindos, repare que eles têm os olhos fixos em você, tomando-o como exemplo e modelo do que diz e faz. Conte a eles histórias bonitas, de fundo moral, e desperte em suas alminhas o amor à virtude e ao trabalho. Mas, sobretudo, saiba dar-lhes a maior lição que terão em sua vida: seu próprio exemplo de trabalho e honradez.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 197 -  Aprenda a amar a todos, indistintamente, para conseguir encontrar a luz que tanto anseia. Procure não distinguir o sábio do ignorante, o rico do pobre, quando se trata de ajudar. Saiba levar aos tristes a consolação, aos que lutam, o incentivo da compreensão e do carinho. A quanta gente você pode ajudar com sua palavra, incentivar com um pensamento! Ame a todos, indistintamente.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 198 -  Cerque sua vida com o doce sentimento do Amor. Não tenha prevenção contra seus semelhantes. Se alguém não o compreender, se alguém o ferir ou magoar, procure retribuir com maior compreensão, com atenções redobradas. Só o amor é capaz de vencer as barreiras da separação, de aproximar as criaturas, de solidificar amizades. Então, cerque sua vida com o doce sentimento do amor.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 199 -  Desperte para as verdades superiores. Não se iluda com as conquistas fáceis, com os prazeres transitórios, com as sensações efêmeras. Busque intensamente as coisas sólidas e duradouras, e para isso espalhe em redor de você alegria e otimismo, bondade e amor, que são as bases firmes e eternas da felicidade que jamais termina. Só o amor constrói para a eternidade.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 200 -  A morte não existe. Se você perdeu um ente querido, não se desespere: tenha a certeza de que ele não morreu. Apenas mudou de estado e, mais cedo ou mais tarde, você o irá novamente encontrar. Não dê a ele, pois, a decepção de querer fugir da luta. Não pretenda ser superior a Deus: aceite o que Deus determinou em Sua Sabedoria, e será imensamente feliz.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 201 -  Observe o que se passa na vida: quando você necessita de alimento, é só você que pode comer. Ninguém pode fazê-lo por você. Assim, também, ninguém pode curá-lo. Você é a única pessoa capaz de curar-se, de fazer seu corpo revigorar-se e liberar-se das enfermidades. Emita pensamentos positivos de saúde e expulse de seu organismo todas as moléstias.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 202 -  A riqueza não depende do dinheiro que você haja acumulado. Quem tem riquezas e não sabe ajudar o próximo é pobre. Quem guarda com avareza os dons que recebeu de Deus é pobre. Quem não sabe dar de si mesmo uma palavra de conforto, um sorriso de encorajamento, é pobre. Mas aquele que, mesmo pouco ou nada tendo, sabe doar-se em ajuda ao próximo, esse é rico, imensamente rico!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 203 -  Mantenha seu bom humor em todas as circunstâncias. E procure manter vivo o bom humor de todos os que o cercam na vida. A alegria é um medicamento divino. A tristeza, ao contrário, nos mergulha num oceano de lama, que salpica e suja aos que de nós se aproximam. Mesmo entre sofrimentos e dores, busque ser alegre, porque a alegria é o melhor remédio para nos dar felicidade.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 204 -  Esteja certo de que a felicidade de sua vida não pode vir de fora. Você só poderá encontrar a felicidade quando souber fazê-la nascer dentro de seu coração, quando aprender a ajudar a todos indistintamente, com suas ações, suas palavras e seus pensamentos. Pense positivamente, desculpando a todos, e sentirá a maior felicidade de sua vida na alegria de viver bem.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 205 -  Ajude a todos, sem fazer exigências: quem estabelece condições para ajudar, escreveu o Marquês de Maricá, está reclamando pagamento, antes mesmo de emprestar dinheiro. Não exija condições: ajude sempre com desprendimento, e não exija agradecimento nem gratidão. Não se esqueça de que quem ajuda ao próximo está, na realidade, ajudando a si mesmo.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 206 -  "Faça aos outros o gosta que os outros façam a você". O grande filósofo que proferiu este ensinamento, Jesus, sabia o que estava dizendo. Se desprezar, será desprezado. Se criticar, será criticado. Mas se distribuir bondade, compreensão e amor, receberá em troca amor, compreensão e bondade. Cada um recebe de acordo com o que dá. Faça aos outros o que quer que façam a você.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 207 -  Se você ainda é estudante, aproveite o tempo ao máximo. Pense nos esforços de seus pais, em mantê-lo no colégio. Se você não estudar, está malbaratando o dinheiro de seus pais. Aproveite o período escolar para aprender, e não apenas para passar de ano. Forme uma base de conhecimentos sólidos, que lhe garantam a vitória na vida.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 208 -  Estamos vivendo no século da Luz: não se deixe arrastar por ilusões, embora bem intencionadas! Raciocine imparcialmente, e nada aceite sem entender. Se não compreende alguma coisa, não a rejeite. Procure aprofundá-la pelo estudo. Não se conforme com a pior das escravidões, que é a escravidão mental. Nascemos para ser livres, e só o seremos quando raciocinarmos livremente.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 209 -  Nossa mente é um aparelho de rádio, que transmite nossos pensamentos e recebe os alheios. Mas só receberemos os pensamentos que quisermos. Depende de nós fixarmos nossa mente numa faixa elevada de vibrações de Bondade e Amor, para que só sejamos atingidos por pensamentos idênticos. Desta maneira, nenhum pensamento de maldade e de enfermidade nos poderá atingir.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 210 -  Procure viver com equilíbrio, mesmo dentro da agitação da vida diária. Não se deixe levar pela onda desordenada que envolve a todos. Pode trabalhar muito, ter atividades grandes, mas nunca deixe de fazer tudo a tempo e a hora, equilibradamente. Reserve uma hora para sua leitura, para sua meditação, para sua higiene mental, a fim de manter-se constantemente em equilíbrio.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 211 -  Não pretenda que todos pensem como você. Cada pessoa está num grau diferente de evolução, num degrau diverso da grande subida. Ninguém possui a verdade total, porque a Verdade Absoluta e total é Deus, o Infinito. Nenhum ser finito pode conter o infinito. Busque a Verdade para si mesmo, mas não obrigue ninguém a pensar como você, tanto quanto não gosta que os outros lhe controlem o pensamento.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 212 -  Não se queixe de abandono. Ninguém está abandonado pelo Pai. Se notar que está só, que ninguém o procura, faça o inverso: procure você alguém que precise de sua ajuda. Visite os lares pobres, as crianças necessitadas, os corações famintos de seu carinho. Derrame seu coração afetuoso no seio daqueles que sofrem e jamais se sentirá abandonado.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 213 -  Mantenha-se calmo e sereno em qualquer circunstância. Quando qualquer aborrecimento o atingir, como primeiro remédio procure conter seu corpo físico: Não fique passeando de um lado para outro, torcendo as mãos, esmurrando a mesa. Não! Sente-se e esforce-se por ficar imóvel alguns minutos. Verá como conseguirá grande parte de sua serenidade... Mantenha-se calmo, o mais possível, e o problema se resolverá por si.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 214 -  Saiba compreender o que significa servir a Deus. Deus, a Onipotência Absoluta e Infinita, de nada precisa. Entretanto, quer ser servido, mas indiretamente, através de suas manifestações, que são as criaturas, animadas ou inanimadas. Todas as vezes que servimos a um semelhante, a um animal, a uma planta, estamos servindo a Deus, porque Deus se manifesta ao homem através do próprio homem.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 215 -  Não fique triste! Procure o conforto que o céu dá a todos aqueles que se conformam e aceitam as dores com resignação. Se aquela criatura que você ama acima de tudo, mais do que a você mesmo, foi ingrata com você, não fique triste: peça que o Pai a ajude e que ela se torne cada vez mais feliz... Entregue ao Pai Todo-Compreensivo aqueles a quem você ama, e ame-os você também.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 216 -  Expulse de seu espírito todas as lembranças tristes. Será que remoer os erros vai conseguir sarar o mal que já houve? Não! Quanto mais revolver em seu coração as tristezas do passado, mais vai sofrer, sem resultado nenhum. Dirija sua mente às recordações alegres, aos momentos felizes, aos fatos agradáveis do passado. Acenda a Luz, para que as trevas desapareçam.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 217 -  Aproveite ao máximo os momentos de alegria, para agradecer tudo o que tem recebido da bondade Divina. Seja grato ao Criador e Pai que lhe dá tantos ensejos de felicidade, e procure espalhar a maior alegria, o mais sadio otimismo com todos os que o cercam. A alegria é a saúde da alma, e o otimismo é a alegria de amanhã, bem aproveitada no dia de hoje. Espalhe alegria em torno de si.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 218 -  Viva sua vida interior com mais intensidade, porque Deus está permanentemente dentro de você, apesar de suas imperfeições e defeitos. O Pai habita em todas as coisas criadas, chamando todas as criaturas para o caminho da justiça, da virtude, do amor. Ninguém pode destruir esta verdade: Deus está dentro de você. Saiba descobri-LO e terá conquistado a felicidade.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 219 -  Logo que o sol despontar no horizonte, saúde-o com um pensamento de louvor ao Pai e Criador, levantando-se também e iniciando seu trabalho. Mantenha firme em sua mente o desejo de ajudar a todos e de cumprir com perfeição todas as suas obrigações. E, assim, poderá deitar-se, ao finalizar o dia, com a consciência feliz, por haver cumprido seu dever.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 220 -  Enquanto você espera pelo céu, não se esqueça de que a terra está esperando por você. Mantenha seus pés fixos no chão, mas eleve sua cabeça para o céu. Ajude a estrada que você palmilha, tornando-a mais confortável para todos aqueles que lhe seguem os passos. Dê trabalho a seus braços, leve consolo aos aflitos, enxugue as lágrimas dos que choram... Você não poderá caminhar sozinho. Ajude a todos os que caminham a seu lado para o mesmo objetivo: a perfeição.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 221 -  Procure corrigir com calma aqueles que erram, e saiba relevar as imperfeições dos outros, da mesma forma que espera a compreensão dos outros para os seus erros. A vida é um intercâmbio de boa vontade mútua, em que recebemos aquilo que damos. Dê tolerância, e receberá compreensão e amor, tornando-se sua vida um paraíso sem dores nem sofrimentos.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 222 -  Se você não sabe perdoar sem esquecer, é sinal de que não compreendeu ainda a Verdade e o Caminho a seguir. Procure perdoar e esquecer as mágoas e ofensas, as intrigas e calúnias. Mantenha-se em tal atitude, que nenhuma calúnia o possa atingir. Perdoe e siga seu caminho. Quando o caluniador abrir os olhos, você estará tão distante dele, que não poderá mais ouvir sua voz cheia de veneno.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 223 -  Lembre-se de que o amor ao próximo é o segredo de nossa felicidade. Não fale mal de ninguém, não tenha raiva, não cultive ódios em seu coração. A irritação e o ódio são venenos que atacam o fígado e descontrolam o sistema nervoso. Aprenda a relevar e esquecer, para ter seu coração em paz e não sofrer em sua saúde. A serenidade é o segredo das vidas longas e felizes.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 224 -  Cultive a Verdade em todos os momentos de sua vida, e a Verdade o levará triunfalmente ao progresso. Seja verdadeiro em todos os pensamentos, ações e emoções, e nada lhe ocorrerá de mal. Deixe que a Divindade se manifeste por seu intermédio, e procure ouvir a voz silenciosa que lhe fala do fundo de seu coração, por meio de sua consciência. Obedeça aos conselhos que ela lhe der!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 225 -  Nunca se irrite! Se a condução custa a chegar, tenha paciência. Se o vizinho o incomoda, suporte-o. Sua irritação não pode melhorar as coisas e... faz mal a seu fígado. A irritação causa mais sofrimentos a nós que aos outros, ao passo que a paciência é um bálsamo, sempre pronto a suavizar as feridas próprias e alheias.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 226 -  Faça da leitura um hábito diário. Acostume-se a ter sempre um bom livro à mão, e verificará que é seu melhor amigo, que conversará com você somente quando você o desejar. Escolha livros instrutivos, interessantes, sadios. Tanto quanto o corpo, o espírito também necessita de alimentar-se. Faça da leitura um hábito tão indispensável quanto a respiração.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 227 -  Saiba dominar-se e vencer-se a si mesmo. Vitorioso não é aquele que vence os outros, mas o que se vence a si mesmo, dominando seus vícios e superando seus defeitos. A vitória sobre si mesmo é muito difícil, e quem consegue isto pode ser classificado como verdadeiro herói. Aprenda a dominar-se, e jamais desanime. Se desta vez não conseguiu, recomece e um dia sairá vitorioso!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 228 -  Não se aborreça com seu amigo, só porque ele está mal humorado. Saiba desculpar. Quantas vezes também você está irritado, e responde mal a seus amigos... e no entanto gosta que eles o desculpem. Você não sabe o que lhe aconteceu, desconhece seus problemas íntimos... desculpe, então! Não leve a mal, releve, e continue a querer-lhe bem. É a melhor maneira de mostrar sua amizade e compreensão.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 229 -  Ajude a todos os que estão enfermos. Amanhã talvez deseje que alguém o visite em sua enfermidade. Procure os doentes solitários, que aspiram por uma palavra de conforto e de carinho. Não apenas seus parentes e amigos, mas até os pobres conhecidos e abandonados, que não encontram um sorriso de incentivo, e que estão famintos de solidariedade humana e de amor.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 230 -  Não se queixe contra a vida. Se está sofrendo, lembre-se de que ninguém passa por esta terra isento de dores, da mesma forma que um aluno não pode fazer o seu curso sem submeter-se aos exames de fim de ano. Prove que está preparado, suportando com paciência e resignação os exames a que é submetido. Tudo o que nos acontece tem sua razão de ser, e dos males surge sempre um bem.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 231 -  Não deixe de manifestar gratidão aos membros de sua família, aos amigos e conhecidos. Não é, porém, da gratidão comum, que consiste em dizer "muito obrigado", que estamos falando. É de gratidão continuada, demonstrada em nosso exemplo, pelo fato de eles nos cercarem com seu afeto e contribuírem para nosso aperfeiçoamento, com sua ajuda e até com suas incompreensões.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 232 -  Domine sua agitação! Só as criaturas calmas podem ser totalmente eficientes. A agitação cansa e produz tudo mal feito. A pressa é a inimiga da perfeição. A calma é o segredo daqueles que realizam tudo bem feito. Quanto mais trabalho, maior deve ser nossa calma. Domine sua agitação, permaneça sereno, e tudo lhe sairá bem.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 233 -  Contribua, com sua parcela, para tornar mais belo este mundo. Um pequenino gesto, uma ação insignificante, podem melhorar muito o ambiente em que nos encontramos, elevar o entusiasmo de quem está desanimado, reanimar aquele que está desiludido. Um simples aperto de mão confiante faz renascer, por vezes, a coragem de quem estava por fraquejar. Então! Contribua com algo de seu, para tornar mais belo este mundo!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 234 -  "Quem alimenta o ódio atira fogo ao próprio coração", escreveu André Luíz. Se alguém o magoou, se o ofendeu com calúnias, não o imite, repetindo os mesmos erros. Coloque-se acima dele, sabendo relevar. E procure esquecer, porque o pensamento negativo da raiva atrai, para nós, a onda de maldade que nosso infeliz adversário lança contra nós. Para ser feliz, saiba relevar e esquecer.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 235 -  Não existem pessoas realmente más. Ou são enfermos ou não têm conhecimento da grande lei de que recebemos exatamente aquilo que damos. Quem é enfermo precisa ser curado. Quem pratica o mal precisa ser elucidado. Mas de modo algum podemos agir com ódio e maldade. Procure ensinar aos outros pelo seu próprio exemplo, compreendendo que a maldade é uma situação transitória do homem.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 236 -  Não seja impaciente! Não tenha pressa em chegar ao fim. Deixe que o tempo amadureça os frutos, de um modo que possa colhê-los amadurecidos. Caminhe com segurança e constância, porque tudo nos chegará na hora exata e mais oportuna. Os frutos amadurecidos à força não são tão saborosos quanto os que amadurecem naturalmente. Saiba esperar com paciência e não desanime.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 237 -  Se você quiser encontrar paz e alegria neste mundo, espalhe em torno de si otimismo e bondade. Não se deixe ficar inativo na comodidade que nada produz. É pelo trabalho em benefício do próximo que armazenamos energias, a fim de vencer os embates da vida. Não pare jamais, não perca as oportunidades que se apresentam diariamente de fazer o bem, para que o bem venha abundante sobre você.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 238 -  Seja perseverante nas boas obras. Nada conseguiremos na vida sem perseverança. Para aprender piano, há necessidade de horas seguidas de estudo diário. O que é o estudo para o pianista, é a perseverança para qualquer outra atividade. Não se deixe arrastar pelo esmorecimento. Reaja com todas as forças que encontrar em seu coração, e terá a beleza da vida em redor de si mesmo.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 239 -  A vida é um canto eterno de beleza! Os homens complicam a vida e dificultam a existência, porque se acreditam diferentes uns dos outros. Mas a vida é uma só e os homens todos são irmãos. Portanto, não antagonize os outros. Distribua amor e compreensão a todos os que se chegam a você. Faça como o sol, que se dá a todos igualmente, em raios benéficos  de luz e de calor.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 240 -  Não ponha limites à sua vida! Procure ouvir as notas harmoniosas e sublimes do canto maravilhoso que se evola da natureza. Viva sorridente e alegre, para espantar as preocupações, para aliviar as lutas. Mergulhe sua alma na alma da natureza: absorva a luz do sol, goze a suavidade da lua, contemple o esplendor das estrelas, aspire o perfume das flores. A vida é bela, apesar das dores e dos contratempos.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 241 -  Se está desempregado, não se desespere, não amaldiçoe a sorte. Enfrente as dificuldades corajosamente. Não pense em abandonar a vida. Não seja covarde! Você pode vencer! Você vai vencer! Não recuse trabalho pelo fato de ser modesto. O grande Ford começou sua vida como simples mecânico. Tenha coragem, porque o Pai não abandona ninguém.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 242 -  O pensamento e a palavra tem poder curador. O corpo é o veículo através do qual se manifestam, no plano terrestre, o espírito e a alma, da qual o corpo é apenas o reflexo materializado. Por isso, espelha aquilo que pensamos, na saúde e na enfermidade, porque recebemos de acordo com os nossos pensamentos, e somos aquilo que pensamos. Pense sempre certo para ter saúde perfeita.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 243 -  Não se deixe derrotar em situação alguma. A derrota depende de nós, tanto quanto a vitória. Entretanto, a pior derrota é a de quem desanima. Perder, nem sempre é ser derrotado. Mas o desânimo estraga totalmente a vida. Não desanime jamais. Siga à frente corajosamente, porque a vitória sorri somente àqueles que não param no meio da estrada.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 244 -  Deus está em toda a parte ao mesmo tempo e, portanto, está também dentro de você, em redor de você, vendo o que você faz, sabendo até o que você pensa. Se você sofre é porque a dor lhe trará benefícios futuros, e não por "vontade" de Deus. Você deixa seu filho sofrer na cadeira do dentista, porque este beneficia seu filho, mesmo fazendo que ele sofra. Deus age também assim conosco.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 245 -  Mantenha sua mente limpa de qualquer pensamento menos digno. Só assim conservará a serenidade e a Paz, como base da felicidade que chegará a você. O corpo é o reflexo da mente. E a mente é o reflexo de nossa alma, que é o nosso verdadeiro eu. Pense coisas nobres e elevadas, e seu corpo manterá inalterável a saúde, trazendo-lhe a felicidade que tanto almeja.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 246 -  Seja sempre nobre em sua expressão de trabalho, se quiser atrair para si a nobreza dos companheiros de luta. Demonstre sempre, inicialmente, a sua própria nobreza, para que os outros se mirem no seu exemplo e o imitem. Seja bem educado, antes de exigir que os outros o sejam. A força do exemplo é a mais convincente e eficaz que existe no mundo. Vale mais um exemplo que mil palavras. Dê você, em primeiro lugar, o bom exemplo em sua conduta.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 247 -  Se a sombra dos dias tristes perturbar a subida, volte seu pensamento para Deus, que está dentro de cada um de nós. A vitória nos chega por meio das lutas que travamos dentro de nós mesmos. Se as quedas magoam o corpo, servem para libertar o coração. E, depois de vencer, espalharemos o amor em redor de todos nós, porque pelo amor conseguimos vencer a nós mesmos.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 248 -  Mantenha em sua vida uma unidade de plano, para conseguir seus objetivos. Veja um colar de pérolas: estão todas presas por um fio. Se este arrebentar, as pérolas se espalham. O que é o fio para o colar de pérolas, é a unidade de plano em nossa vida. Não deixe que as pérolas de suas ações se percam, por lhes faltar o fio que lhes mantém a unidade.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 249 -  Não seja cruel! Aprenda a ter compaixão daqueles que estão em pior situação que você. Lembre-se daquela máxima do maior dos filósofos: "felizes os misericordiosos, porque eles alcançarão misericórdia". Seja compassivo com os que erram, porque você não sabe quando poderá cometer erro semelhante, e gostará que o compreendam e lhe relevem. Releve também e seja misericordioso com quem erra!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 250 -  Leia mais! Aproveite seu tempo. Não deixe que a ociosidade alimente pensamentos negativos, porque estará perdendo um tempo precioso que não voltará mais. Leia mais! A boa leitura alimenta o cérebro e controla as emoções. O livro é um amigo discreto que não se impõe a ninguém, e só fala conosco quando temos vontade de conversar com ele. Leia mais, e faça do livro seu melhor amigo!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 251 -  Procure pensar. Não seja autômato! Você faz parte da Humanidade, é uma peça importante da Humanidade, e por menor que seja sua cultura, você tem o dom de raciocinar. Pense com sua própria cabeça, procure saber donde vem e para onde vai. Não viva às cegas! Seja você mesmo! Só você pode descobrir o caminho que lhe convém.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 252 -  Não se exalte, não se irrite, não discuta... A mansidão e a serenidade conquistam os corações e representam a felicidade. Ninguém resiste a uma pessoa calma e serena, e esta pode resistir a todos. Não há força que derrube a mansidão, e nada é empecilho para ela. Os mansos e serenos conseguem tudo o que desejam na terra, com a vantagem de jamais estragarem sua saúde tão preciosa.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 253 -  Não se envergonhe  de ser humilde. A humildade consiste no conhecimento perfeito daquilo que somos e que podemos, sem fantasiar-nos com qualidades que não temos. Humildade não é posição de corpo nem tom de voz: é posição de espírito, que sabe o que é e o que pode, e não precisa manifestar-se aos outros: vale para si mesmo. Seja, pois, humilde!', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 254 -  Seja tolerante com o próximo que erra. Quando erramos, queremos que os outros nos desculpem. Então, desculpe e procure ensinar-lhe, dando o seu exemplo. Não critique, porque a crítica destrói. Seja você "um exemplo vivo" e desculpe os erros alheios, porque  não há pessoas más: há enfermos e ignorantes da lei, que não sabem que volta para nós tudo o que fazemos aos outros, de mal ou de bem, de crítica ou de tolerância.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 255 -  Aprenda a dirigir palavras de louvor a tudo o que é belo e bom. Não retenha seus sentimentos de gratidão e louve tudo o que contribui para a beleza e o bem-estar da humanidade. Não se cale diante do que é belo! Dê expansão ao louvor que provém de seu íntimo, em favor de pessoas ou coisas. A gratidão traz alegria à vida! Cultive a virtude do louvor espontâneo e sincero e você aumentará o número de seus amigos.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 256 -  Faça tudo com amor! Tudo o que é feito sem amor sai mal feito, e tende à destruição. Só o amor constrói obras eternas e penetra profundamente o coração da humanidade, porque só o amor é positivo. Tudo o que não é amor é negativo. Faça tudo com amor, porque o próprio Deus é amor. Quando as criaturas fizerem tudo com amor, saberão o que é a saúde e a felicidade', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 257 -  Mantenha sempre no mesmo nível sua coragem para o bem. Não falamos da coragem de palavras, que é fácil. Contar vantagens, todos contam... Mas a coragem da luta contra seus próprios vícios é que tem valor, porque daí surgirá a vitória final. Seja constante e persistente, caminhe reto para a frente e para o alto, e mantenha firme sua coragem na ação de cada dia em busca do ideal.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 258 -  Seja na terra a pequenina chama que ilumina as trevas em que jazem milhares de criaturas. Seja a água benéfica que dessedenta todos aqueles que atravessam o deserto da existência, sequiosos de carinho e amor. Seja o alimento dos que nos procuram, famintos de compreensão e de incentivo. Procure "servir e amar", para ter a alegria de haver passado na terra distribuindo benefícios a todas as criaturas.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 259 -  Evite o álcool. Se pode ser remédio, quando usado em pequenas doses, traz malefícios incalculáveis, se nos leva ao abuso. Pare enquanto é tempo. Construa em sua mente a sua própria imagem livre de beber, e repita muitas vezes ao dia, seguidamente: "nada me vencerá! Sou forte e vencerei todos os meus vícios!" Não diga: "Não quero mais beber!" Diga antes: "Não gosto mais de bebida!"', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 260 -  Se alguém lhe mostrasse uma semente escura e feia, dizendo que dentro dela havia bela e perfumada flor, você acreditaria, porque sabe que da semente nasce a planta que produz a flor. Pois bem, acredite também que, dentro de você, por mais imperfeito que seja, nascerá, purificada e bela, a sua alma imortal que alcançará a felicidade! Tenha fé em si mesmo, e busque aperfeiçoar-se.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 261 -  Tenha a certeza de que nenhum mal pode lhe acontecer, porque a Força Divina é sua proteção permanente. O mal que lhe acontece talvez seja apenas uma experiência, pela qual você passa. "Mas tudo coopera para o bem daqueles que amam a Deus", mesmo as dores e sofrimentos, as doenças e perseguições. Nenhum mal pode atingi-lo, a não ser aquele que você mesmo pratica.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 262 -  Acenda sua luz interior, a luz da sabedoria e da bondade. Dedique alguns minutos de seu dia à meditação, porque o homem iluminado não encontra trevas em seu caminho. Por onde passa, a luz se irradia de si mesmo, atingindo todos os que estão perto. Mergulhe em seu íntimo, e ouça a voz de sua consciência, que é a voz silenciosa de Deus falando dentro de você mesmo.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 263 -  Onde quer que encontre uma criança, derrame sobre ela todo o seu carinho, estenda-lhe a mão para ajudá-la a crescer. Em cada criança, existe um dia novo que surge para a felicidade do mundo. Em casa, na escola, num jardim, num hospital, jamais olhe com indiferença para uma criança: facilite ao máximo a estrada que ela vai percorrer e semeie de flores o caminho que ela palmilhar.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 264 -  Jamais desanime! Embora sua dor pareça insuportável e sem remédio, ela há de terminar, e a alegria voltará a brilhar em seu coração. Não há noite eterna à qual não suceda a luz de um dia radiante. Dos sofrimentos passados, conservamos apenas uma lembrança quase apagada. Assim acontecerá amanhã com os sofrimentos de hoje. Entregue tudo ao tempo, que, com sua mão compassiva, balsamizará todas as suas dores.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 265 -  Procure cultivar a verdade, em relação aos outros, e também em relação a você mesmo. Só a verdade nos fará chegar à perfeição, porque ela nos faz conhecer o que real e verdadeiramente somos. E só chegaremos a ser perfeitos quando nos conhecermos, a fim de podermos corrigir-nos de nossos defeitos e lançar-nos à conquista das virtudes que nos faltam.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 266 -  Enquanto dispuser de tempo, nesta terra, dirija seus passos pela senda do bem. Procure agir, fazer sempre alguma coisa em benefício de alguém, embora seja apenas uma palavra de conforto, um gesto de carinho, um sorriso de incentivo. Faça alguma coisa em favor do próximo, e terá o coração cheio de alegria e de felicidade.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 267 -  Deus está dentro de você! Mas está também dentro de todas as demais criaturas que você encontra. Mesmo naqueles que não agem com acerto, está habitando permanentemente a Divindade, que dos erros das criaturas humanas faz nascer o bem e o progresso. Não julgue, pois, apressadamente, pois aquilo que lhe parece ser um erro pode ser o início de um resultado maravilhoso.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 268 -  Tenha dinamismo em sua vida! Não fique aí parado, de braços cruzados. Não são as idéias bonitas que valem. São as ações práticas! Os pés que não caminham criam raízes. A vida é luta! Não espere que os necessitados o venham procurar: vá visitá-los em seus tugúrios. Leve uma palavra de conforto, um sorriso de compreensão, um pensamento de ternura.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 269 -  Cultive a alegria em dose máxima. Alegria, porém, não é barulho: é um estado de alma de quem sente em si a plenitude da vida. A alegria provém de dentro de nós mesmos, da consciência tranqüila, do cumprimento exato de nossos deveres, e vibra em nós apesar de todos os sofrimentos, calúnias e injustiças. Seja alegre sempre e, quando a tristeza quiser encobrir o sol de sua vida, entoe um cântico de louvor ao Pai, e a Luz brilhará novamente em você.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 270 -  Mantenha aceso seu ideal de felicidade. Trabalhe visando ao bem próprio e ao bem da humanidade. Mas não tenha apenas a preocupação de acumular riquezas, que os vermes destroem e a ferrugem consome. Acumule riquezas duradouras, constituídas dos benefícios que presta a seus irmãos, porque amanhã você receberá de todos a alegria da vitória, auxiliada por você. A alegria do bem que se realiza é o maior tesouro que podemos obter.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 271 -  Procure ser humilde em todas as circunstâncias. Humildade não é dizer "sim" a tudo e a todos. Nem é apregoar que somos humildes. Não é agachar-se mentalmente a tudo o que os outros dizem. Não! Humildade é saber exatamente o que somos e o que valemos. É conhecer-nos a nós mesmos, procurando corrigir sinceramente nossos defeitos, e não nos querendo impor aos outros. Quem é humilde, em geral, não sabe que o é. Mas quem não é humilde é que pensa que é.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 272 -  Tenha firmeza em suas atitudes e persistência em seu ideal. Mas seja paciente, não pretendendo que tudo lhe chegue de imediato. Há tempo para tudo. E tudo o que é seu virá às suas mãos, no momento oportuno. Saiba esperar o momento exato em que receberá os benefícios que pleiteia. Aguarde com paciência que os frutos amadureçam para que possa apreciar devidamente sua doçura.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 273 -  Procure amar a tudo e a todos indistintamente. O amor é uma doação perene de luz e de felicidade, sem buscar retribuições e compensações. Em todas as criaturas está Deus, que habita dentro de cada um de nós. Ame a Deus, amando a seu próximo tanto quanto a si mesmo. Distribua a compreensão e paz, para que a felicidade possa morar definitivamente em seu coração.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 274 -  Alguns são mais lentos, outros mais rápidos na caminhada. Não queira exigir dos outros aquilo que nem sempre você mesmo consegue fazer. Tenha compreensão pelos erros do próximo, e aguarde que possam escalar aos poucos a montanha íngreme da virtude. Ninguém pode tornar-se santo da noite para o dia. Tenha paciência com os companheiros de sua jornada na terra.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 275 -  Mantenha-se calmo e sereno.  Confie na Força Cósmica que enche todo o universo, inclusive sua própria pessoa. Focalize sua confiança em Deus que habita dentro de você e dentro de todas as criaturas. Liberte-se do medo, caminhe com segurança e procure ouvir as palavras de orientação, ditadas, no mais profundo de seu coração, por Deus que habita dentro de você.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 276 -  Evite acusar e criticar. Procure, antes, colaborar, sobretudo "com seu exemplo" digno e nobre. Tudo tem sua razão de ser na vida, embora nem sempre saibamos compreender, porque não temos uma visão completa, já que só podemos ver a superfície das pessoas e coisas. Deixe o julgamento para  Aquele que vê os corações e que está dentro de cada um de nós, lendo os mais secretos pensamentos e intenções.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 277 -  A vida é alegria, quando espalhamos apenas otimismo e amor em redor de nós. Busque sempre ajudar e servir, derramando felicidade em torno de você, e a alegria voltará para você mesmo. Procure viver integrado na Energia Cósmica, que se dá igualmente a todos, e você verá que sua vida se transformará num ato de puro amor e num paraíso de felicidades sem limites.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 278 -  Seja o que você deseja ser. Não dê importância ao que os outros dizem. Você é filho de Deus, e como tal tem direito à sua liberdade. Não desanime diante dos impedimentos e das dores. Fique certo de que você, unicamente você, terá de dar contas de seus atos... Portanto, busque dentro de si mesmo a luz divina, e seja exatamente o que você deseja ser: subindo sempre.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 279 -  Procure viver mais sua vinda interior. A agitação da vida não deve atingir nosso eu verdadeiro, nossa alma. Não deve fazer esquecer a coisa mais importante. A Centelha Divina é que é nosso eu real, do qual nosso corpo é apenas um reflexo. Portanto, procure viver mais intensamente sua vida interior, a vida de seu eu verdadeiro, de sua alma.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 280 -  Não permaneça preso ao passado nem a recordações tristes. Não remexa uma ferida que está cicatrizada. Não revolva dores e sofrimentos antigos. O que passou, passou! Deste momento em diante, procure construir uma vida nova, na direção do alto, caminhando para a frente, sem olhar para trás. Faça como o sol que se ergue a cada novo dia, sem lembrar-se da noite que passou.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 281 -  Porque tem medo de que a riqueza não chegue para você? A riqueza pertence a todos, no universo. Se existem pessoas mais prósperas que outras, não pense que se trata de injustiça ou desequilíbrio da Lei. Se eles conseguiram essa abundância, você também poderá obtê-la. Não procure enriquecer tirando dos outros: busque-a na Energia Cósmica, no universo, que dá a todos oportunidades de acordo com as capacidades de cada um.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 282 -  Um corpo saudável reflete atitudes corretas e perfeitas da mente. Alimente seu cérebro com pensamentos saudáveis, para que seu corpo possa refletir saúde. Equilibre seus pensamentos num clima de bondade e compreensão, para que seus órgãos funcionem com regularidade. Mantenha viva a sensação da presença de Deus dentro de você, para que seu corpo irradie otimismo e amor.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 283 -  Trabalho é sinônimo de nobreza. Não desdenhe o trabalho que lhe coube realizar na vida. O trabalho enobrece aquele que o faz com entusiasmo e amor. Não existem trabalhos humildes. Só se distinguem por serem bem ou mal realizados. Dê valor ao seu trabalho, fazendo-o com todo o amor e carinho, e estará desta maneira dando valor a si mesmo.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 284 -  Controle o tom de sua voz! Já verificou como é desagradável quando alguém se dirige a você em tom áspero? Pois faça aos outros o que gosta que os outros façam a você. Mesmo quando repreender, faça-o com voz calma e educada, como gostaria que o repreendessem quando você erra. Lembre-se de que, em geral, somos odiados ou amados, de acordo com o tom de voz que empregamos.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 285 -  Cada dia, nova etapa de trabalho é iniciada! Lembre-se de agradecer ao Pai o ensejo do repouso que lhe concedeu, e prepare-se para executar as tarefas, de que está encarregado, com alegria e boa vontade. Agradeça, também, o trabalho que lhe proporciona o pão de cada dia, e procure executá-lo da melhor forma de que for capaz. O trabalho bem executado traz-nos a alegria do dever cumprido.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 286 -  Espalhe por todos a alegria que vive dentro de você. Seja sua alegria contagiante e viva, a fim de expulsar a tristeza de todos os que o cercam. A alegria é uma tocha de luz que deve permanecer sempre acesa, iluminando todos os nossos atos e servindo de guia aos que se chegam a nós. Se em você houver luz e você deixar abertas as janelas de sua alma, por meio da alegria, todos os que passarem pela estrada em trevas serão iluminados por sua luz.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 287 -  Faça diariamente, ao despertar, afirmações positivas de alegria e de vitória, procurando construir em torno de si um ambiente de serenidade e de harmonia. Aprenda a sorrir de coração para todos: parentes, amigos, conhecidos, de tal forma que baste a sua presença, para que a alegria penetre no coração das criaturas que lhe chegam perto. E verifique a felicidade que isto lhe causará.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },
    { id: _uid(), texto: 'Mensagem: 288 -  Não acumule em seu coração desejos de vingança, detritos do mal. Jogue-os fora, relevando e esquecendo o que lhe fizeram de mal, em palavras, atos e maledicências, calúnias e injustiças. Esqueça! Uma única pessoa lucrará com o seu perdão: você mesmo, que libertará seu coração do peso da mágoa e do ódio. Seja inteligente: perdoe e esqueça, para ser feliz.', autor: 'C. Torres Pastorino', categoria: 'Minutos de Sabedoria', ativo: true },

      // Mensagens importadas de Vida_Feliz_Mensagens1.xlsx
      { id: _uid(), texto: "Mensagem: I - Saúda o teu dia com a oração de reconhecimento. Tu estás vivo. Enquanto a vida se expressa, multiplicam-se as oportunidades de crescer e ser feliz. Cada dia é uma bênção nova que Deus te concede, dando-te prova de amor. Acompanha a sucessão das ho ras cultivando otimismo e bemestar.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: II - Considera o trabalho o melhor meio para progredir. Quem não trabalha, entrega-se à paralisia moral e espiritual. O homem que não se dedica à ação libertadora do trabalho fazse peso negativo na economia da sociedade. O trabalho é vida.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: III - Mergulha a mente, quanto possível, no estudo. O estudo liberta da ignorância e favorece a criatura com o discercimento. O estudo e o trabalho são as asas que facilitam a evolução do ser. O conhecimento é mensagem de vida. Não apenas nos educandários podes estudar. A própria vida é um livro aberto, que ensina a quem deseja aprender.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: IV - A paciência é a virtude que te auxiliará na conquista dos bens do corpo, da alma e da sociedade. Ela ensina a técnica de como se deve aguardar, quando não se pode ter imediatamente o que se deseja. Jamais te irrites. A paciência te auxiliará a tudo vencer.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: V - Concede ao teu próximo os mesmos direitos e favores que esperas dele receber. O egoísmo é doença que envenena a alma. O amigo ao teu lado anela pelos espaços para viver, conforme ocorre contigo. Lembra-te de não lhe interditar a oportunidade. O que te está reservado, aprende a repartir.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: VI - Quando estiveres em dúvida, resolve pela atitude menos prejudicial ao próximo e a ti próprio. Evita arriscar-te e arruinar outras pessoas. Age em serenidade, certo de que o teu gesto repercutirá nas demais pessoas, de acordo com a emoção e o conteúdo de que se revista.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: VII - Não ambiciones demasiadamente. \"Quem muito abarca, pouco aperta\" — afirma o refrão popular. A ambição desmedida enlouquece, quando já não infelicita antes. Cuida de lutar pelo necessário, repartindo o que te exceda, cer tamente, fazendo falta a outros.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: VIII - Vive sempre em paz. Uma consciência tranquila, que não traz remorsos de atos passados, nem teme ações futuras, gera harmonia. Nada de fora perturba um coração tranquilo, que pulsa ao compasso do dever retamente cumprido. A paz merece todo o teu esforço para consegui-la.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: IX - Mantém o teu controle emocional em todas as situações. Sistema nervoso alterado, vida em desalinho. Se dificuldades ameaçarem o teu equilíbrio, utiliza-te da oração. A prece é medicamento eficaz para todas as doenças da alma.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: X - Organiza a tua agenda, a fim de ganhares o tempo com propriedade. Cada tarefa deve ser exercida no seu respectivo momento. O tumulto na realização, não apenas prejudica a ordem, mas também, a sua qualidade. Um após outro, com calma e continuamente, realiza os teus deveres.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XI - Torna-te amigo de todas as pessoas. A amizade é um tesouro do espírito, que deve ser repartido com as demais criaturas. Como um sol, irradia-se e felicita quantos a recebem. Há uma imensa falta de amigos na Terra, gerando conflitos e desconfianças, desequilíbrio e insegurança. Quando a amizade escasseia na vida, o homem periga em si mesmo. Sê tu o amigo gentil, mesmo que, por enquanto, experimentes incompreensão e dificuldades.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XII - Nunca retribuas maldade com vingança ou desforço. O homem mau se encontra doente e ainda não sabe. Dâ-lhe o remédio que minorará o seu aturdimento, não usando para com ele dos recursos infelizes de que ele se utiliza para contigo. Se alguém te ofende, o problema é dele. Quando és tu quem ofende, a questão muda de configuração e o problema passa a ser teu. O ofensor é sempre o mais infeliz. Conscientiza-te disso e segue tranquilo.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XIII - Confia sempre na ajuda divina. Quando te sentires sitiado, sem qualquer possibilidade de liberação, o socorro te chegará de Deus. Nunca duvides da paternidade celeste. Deus vela por ti, e te ajuda, nem sempre como queres, porém, da melhor forma para a tua real felicidade. Às vezes, tens a impressão de que o auxílio superior não virá ou chegará tarde demais. Passado o momento grave, constatarás que o recebeste alguns minutos antes, caso tenhas perseverado à sua espera.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XIV - Aproveita cada oportunidade para agir de forma elevada. Há quem espere extraordinários momentos e ocasiões especiais, que possivelmente não chegarão. Não será o que faças, que te tornará grande e importante, porém como faças cada coisa que te transformará em valioso. A árvore gigante se origina em pequenina semente. O Cosmo é resultado de partículas e moléculas invisíveis. Torna-te grande nas pequeninas coisas, a fim de que não te apequenes nas grandiosas.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XV - \"Somente lobos caem em armadilhas de lobos\" — leciona o Evangelho de Jesus. Desse modo, jamais te permitas o espinho da humilhação ou da desonra, quando agredido ou malsinado. És o que vives interiormente e não aquilo de que te acusam. Não te tornarás melhor, porque estás elogiado ou ficarás pior, porque combatido. Permanece, honrado e discreto, sendo tu mesmo, em busca do aprimoramento íntimo.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XVI - Substitui, no teu vocabulário, as más pelas boas palavras. Expressões chulas e vulgares, talvez estejam na moda, porém \"envenenam o coração\". A palavra é instrumento da vida para a comunicação, o entendimento, e não arma de agressão, violência e vulgaridade O uso irregular das palavras corrompe a mente e rebaixa o homem. O verbo expressa a qualidade moral do indivíduo. Porque há pessoas que falam bem e são más, não é justo que sendo bom, te apresentes mal.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XVII - Mantém os teus pensamentos em ritmo de saúde e otimismo. A mente é dínamo poderoso. Conforme pensares atrairás respostas vibratórias equivalentes. Quem cultiva doenças, sempre padece problemas dessa natureza. Quem preserva a saúde, sempre supera as enfermidades. Pensa corretamente e serás inspirado por Deus a encontrar as soluções melhores. O pensamento edificante e bom é também uma oração sem palavras, que se faz sempre ouvida.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XVIII - A revolta constante gera desequilíbrios na mente, no corpo e na alma. Não é o corpo que é fraco, mas o Espírito que permanece rebelde. Controla as tuas energias, não deixando que elas te desconcertem. A revolta intoxica e expele venenos que a todos desagradam. A pessoa revoltada não inspira amizade, nem sequer compaixão. Tem calma sempre. O que agora não se resolva, está a caminho da solução.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XIX - Tolera as falhas alheias e não as apresentes no festival de fofocas. Todos erramos. Sábio é aquele que, no erro, aprende a agir com correção. Quando vejas alguém caído, dá-lhe a mão, ao invés de te comprazeres em censurá-lo. Ninguém tomba por querer. E se tal ocorre, nele predomina a ignorância, que é um cruel inimigo do homem. Ainda assim, o equivocado merece mais socorro do que reprimenda.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XX - Jamais te comprazas no mal feito. Concede-te o direito de errar, porém, exige-te o dever de corrigir. O azedume, a ira, a violência, devem ceder-te lugar à alegria, à bondade, à paz. Reencarnaste para crescer e ser feliz. Abandona os caminhos da viciação emocional e galga os degraus que te alçarão ao patamar da vitória sobre ti mesmo. Quem não doma as más inclinações, torna-se vítima do desregramento a que elas conduzem.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXI - O amor é tônico da vida. Quando se centraliza nos interesses inferiores do sexo e das paixões primitivas, torna-se cárcere e deixa de ser o sentimento elevado, que dignifica — libertando. Examina os teus sentimentos, na área afetiva e observa se eles te desarmonizam ou tranquilizam. Através da sua qualidade, detectarás, se amas ou apenas desejas. O verdadeiro amor supera o egoísmo e trabalha sempre em favor da pessoa querida. Ama, portanto, sem escravizar aquele a quem te devotas, não se lhe escravizando também.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXII - A presença do ciúme no teu comportamento é sinal de desequilíbrio. O ciúme jamais será o sal temperando o amor. Desconfiança e insegurança significam a manifestação do ciúme. Quando ele se introduz na afetividade a surgimento a pesadelos e perturbações prejudiciais. Supera as insinuações ciumentas na tua conduta, amando com tranquilidade e confiando em paz. Se a pessoa amada não te corresponder à expectativa, segue adiante, porque o prejuízo é dela.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXIII - Evita as contendas, sempre inúteis. Entre contendores a razão é sempre de quem não se envolve em discussões infrutíferas. Nessas lutas verbais e alterações violentas, surgem males de difícil reparação. As palavras que a ira põe na boca do altercador, raramente expressam o que ele pensa. Traduzem-lhe o estado de desarmonia e a necessidade de esmagar o antagonista. Esclarece com calma e argumenta serenamente. Se o outro não leva em consideração os teus conceitos, silencia e entrega-o ao tempo que a todos nos ensina sem pressa.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXIV - O repouso é necessário para o corpo e para a mente. Tem cuidado, porém, a fim de que ele não se te converta em ociosidade, em preguiça. È justo que, ao trabalho suceda o refazimento de energias, através da variação de atividade ou do repouso, do sono. As muitas horas de descanso, todavia, violentam o caráter moral do homem e desarticulam as fibras e músculos orgânicos destinados ao movimento, à ação. Repousa, pois, o tempo suficiente e não em demasia.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXV - Sempre que interrogado a respeito de alguém, fornece impressões positivas. Na impossibilidade de fazê-lo, porque a pessoa tenha uma conduta irregular, silencia ou elucida com bondade, evitando piorar-lhe a situação ou torná-la mais divulgada. Não és fiscal do comportamento alheio, nem podes imaginar se aquele equivocado de ontem, não se encontra hoje em processo de recuperação. Sejam tuas a opinião que edifica e a palavra que ajuda sempre.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXVI - Acalma os anseios de mudanças constantes. Deus te colocou no melhor lugar para o teu progresso moral e espiritual. O lar que tens, o trabalho em que te encontras, a cidade onde resides, são oportunidades de treinamento para a tua evolução. \"Pedra que rola, não cria limo\" — afirma o brocardo popular. Quem sempre está de mudança não amadurece, nem realiza bem coisa alguma. Cumpre a tarefa onde estejas, e, no momento próprio, após acurada meditação, toma o teu rumo definitivo.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXVII - Não desconsideres o valor e o poder da oração. O corpo necessita de alimento adequado para manter-se. Assim também o Espírito, que é a fonte de vitalização da matéria. A prece constitui um combustível de alta qualidade para a sua harmonia. Adquire o hábito dê orar, incorpora-o aos outros mecanismos naturais da tua existência e constatarás os benefícios disso decorrentes. Não te negues o pão da vida, que é a prece sincera e afervorada.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXVIII - Sê gentil com as crianças. Elas necessitam de oportunidade e de amor para lograrem o triunfo. Esses cidadãos em formação ignoram as lutas que os aguardam. Distende-lhes o gesto de simpatia, transmitindo-lhes confiança na humanidade que representas. Não as atemorizes, nem as maltrates. Quem visse aquele menino, em Nazaré, no passado, entre outras crianças, brincando descuidadamente, não poderia imaginar que era o Construtor da Terra, nosso Modelo e Guia.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXIX - Exercita a gentileza e a gratidão para com todas as pessoas, especificamente os idosos. A velhice é fase inexorável que alcançarás, caso a morte não te arrebate o corpo antes. Nesse período difícil, as forças diminuem, os órgãos se debilitam, as lembranças se apagam e a dependência física, emocional e afetiva se faz imperiosa. Pode parecer cansativa a presença do idoso; ele, porém, é rico da experiência que te pode brindar, mas carente dos recursos que lhe podes oferecer.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXX - Qualquer vício escraviza e mata. Não te vincules aos chamados \"aperitivos sociais\", que dão margem a lamentáveis processos de alcoolismo, nem adotes a posição de fumante, por parecer-te uma postura distinta e de elegância, mas que conduz às algemas do tabagismo assassino. Jogo, sexo, gula, anedotário servil, para citar somente alguns, iniciam-se em pequenas doses, para culminar em cárcere moral quando não em penitenciária comum. Uma vida sadia torna-se ditosa e prolongada, a benefício daquele que assim a preserva.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXXI - Torna-te pacificador. Onde te encontres, estimula a paz e vive em paz. Os tumultos que aturdem os homens e as lutas que se travam em toda parte poderiam ser evitados, ou pelo menos contornados, se os homens mantivessem o espírito de boa vontade, uns para com os outros. Uma ofensa silenciada, uma agressão desculpada, um golpe desviado, evitam conflitos que ardem em chamas de ódio. Confia na força da nãoviolência e a paz enflorescerá o teu e o coração de quantos se acerquem de ti.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXXII - Difunde a esperança em melhores dias. Nunca houve tanta necessidade da verde palma, quanto nestes momentos. A esperança dá forças aos ideais e coragem às criaturas, que se renovam, mesmo quando tudo parece a ponto de perder-se. È ela que sustenta o herói e mantém o santo nos propósitos superiores que abraçam. Preservando-a em ti, nunca desfalecerás, nem te sentirás abandonado, quando as circunstâncias te convidarem ao testemunho e à solidão.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXXIII - Tem piedade dos ingratos. Eles asfixiaram os sentimentos nobres nos vapores da soberba. A gratidão é o sentimento digno que deve viger no homem que recebe benefícios da vida. Todos a devemos a alguém ou a muitas pessoas que nos socorreram nos momentos graves da existência. A ajuda na hora certa é responsável por tudo de bom que te venha a acontecer, impelindo-te ao reconhecimento perene. Sê grato em todas as situações.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXXIV - Preserva a jovialidade na tua conduta. Um cenho carregado reflete aflição, desgosto, contrariedade. Podes ser de atitudes retas e comportamento sério, sem que te afixes a máscara contraída do mau humor. Jovialmente e com alegria esparze bom ânimo, irradiando o bem-estar de que esteja rico o teu coração. O tesouro de um comportamento jovial tem o preço da felicidade que oferece a todas as pessoas.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXXV - Reserva algum período do teu tempo ao serviço sem remuneração à caridade fraternal, à ação em favor da comunidade. A \"hora vazia\" é sempre espaço mental perigoso. Oferece-a ao teu próximo, a alguma Sociedade ou Agremiação que se dedique à benemerência, à construção de vidas. Pequenas ajudas produzem os milagres das grandes realizações. Jamais te escuses a este mister de ajuda desinteressada, não retribuída. Há muita aflição esperando socorro e compreensão.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXXVI - Assume, contigo próprio, o propósito de desincumbir-te bem de todos os teus compromissos com ordem e sem pressa. Quem valoriza o que faz dá-lhe beleza e sentido, melhor realizando-o. Todo serviço é nobre, por mais insignificante seja considerado ou por mais humilde se apresente. O Universo e o verme, tão diferentes e antagônicos, sâo importantes na criação divina. Realiza cada tarefa com respeito e prazerosamente.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXXVII - Nunca enganes a ninguém. A vida é grande cobradora e exímia retribuidora. O que faças com os outros sempre retornará a ti. À sementeira sucede a colheita. Segarás conforme hajas plantado. Quem engana, ilude, trai, a si próprio se prejudica, desrespeitando-se primeiro e fazendo jus depois aos efeitos da sua conduta reprochável. Sê honesto para contigo, e, como consqüência, para com teu próximo.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXXVIII - Usa a verdade com o objetivo de ajudar, jamais como uma arma de agressão ou revide. A verdade é qual diamante que exige adequado envoltório para manter-se seguro, e, quando atirado para alguém, não o ferir. A tua talvez não seja a verdade legítima ou pelo menos não será a completa. Preserva-a para o momento próprio, no qual possas dignificar e erguer quem caia ou se esteja precipitando em abismos de loucura e ilusão.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XXXIX - Não te esqueças das pessoas que transitam em situações mais humildes e difíceis do que a tua. Faze-te amigo delas. È fácil desejar compartir das alegrias, dos momentos de triunfo, das situações invejáveis que os outros experimentam. O ideal é ser companheiro de todos. A situação financeira, o poder, a saúde e a juventude são transitórios. Converte o teu amor na mais valiosa conquista da tua vida, repartindo-o com todos os indivíduos.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XL - Enquanto alguém estiver sendo acusado, mantêm-te em silêncio. Os acontecimentos quando estouram, têm antecedentes que são ignorados pela maioria dos circunstantes. As coisas nem sempre são conforme se apresentam, mas consoante são nos seus valores íntimos. Não faças coro com as acusações expostas. O delinquente e o infeliz pecador, merecem, quando menos, comiseração e oportunidade de reeducação.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XLI - Depois que cometas um erro e tenhas consciência dele, começa a reabilitação. Nada de entregar-te ao desalento ou ao remorso. Da mesma forma como não deves insistir no propósito inferior, não te podes deixar consumir pelo arrependimento. Este tem somente a função de conscientizar-te do mal feito. Perdoa-te, encoraja-te e dá início à tarefa de reequilíbrio pessoal, diminuindo e reparando os prejuízos causados.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XLII - No tumulto que toma conta do mundo e das pessoas, reserva-te alguns momentos de silêncio, que se transformem em quietude interior. A agitação, a balbúrdia, o falatório, desarmonizam os centros emocionais do equilíbrio. Cala mais do que fala. Reflexiona antes de expender a tua opinião. Ouve a zoada e alija-te do burburinho, preservando-te em paz. Este comportamento é salutar para todos os momentos da tua vida.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XLIII - A tua felicidade é possível. Crê nesta realidade e trabalha com afinco para consegui-la. Não a coloques nas coisas, nos lugares, nem nas pessoas, a fim de que não te decepciones. A felicidade é um estado íntimo, defluente do bem-estar que a vida digna e sem sobressaltos proporciona. Mesmo que te faltem dinheiro, posição social de relevo e saúde, podes ser feliz, vivendo com resignação e confiança em Deus.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XLIV - Ama-te mais. Certamente, não nos referimos ao sentimento egoísta, ambicioso, envenenador. Amar-se, é respeitar-se, proporcionando-se as conquistas superiores da vida, os anseios elevados do coração. Intenta estabelecer um pequeno programa de amor para ti e executa-o. Mantém acesa a luz do entusiasmo em tuas realizações e sabendo-te fadado à Grande Luz, deixa que brilhem as tuas aspirações nobres. Escolhe \"a melhor parte\" em tudo e supera aquelas nefastas, que prejudicam e envilecem.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XLV - O corpo merece cuidados para ser preservado, sadio. Desprezá-lo, sob qual for o pretexto, é ato de rebeldia contra Deus, que no-lo concede com a finalidade de crescimento íntimo e elevação moral. Sem o ataviar com exageros ou viver para ele conforme fazem muitas pessoas, resguarda-o e protege-o, amando-o de forma a prolongar-lhe a existência útil. O corpo é o \"jumentinho\" que carrega a alma na Terra, conforme ensinava São Francisco de Assis, credor de ternura e afeto.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XLVI - Alimenta-te para viver, sem a gulodice que leva o homem a viver para comer. Morre-se mais de excesso ou alimentação irregular, do que pela falta de pão. O exagero e desperdício de uns respondem pela falta e escassez na mesa de outros. O alimento é bênção para a existência corporal, mas as complexas misturas e extravagantes apresentações constituem paixão injustificável ou vício pernicioso. Usa o alimento com sabedoria e frugalidade para viveres por longos anos com saúde ideal.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XLVII - Acompanha a marcha dos acontecimentos sem sofreguidão. A tua ansiedade ou o teu receio não alterarão o curso das horas. Aguarda o que há de suceder, sem que te imponhas sofrimento desde a véspera. O que pensas que acontecerá, talvez se dê, não porém da forma como aguardas, porquanto, a vida obedece a um plano de incessantes mudanças e transformações. Desse modo, espera com harmonia íntima, afastando do teu programa a agitação e o medo.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XLVIII - Ouve com atenção e cuidado. Não te apresses em cortar o assunto, como se já o tivesses entendido. Há pessoas que têm dificuldade de expressão e tornam-se difíceis de ser compreendidas. Após ouvires, se a circunstância permitir, dialoga um pouco com o expositor, a fim de que o tema te fique esclarecido e o apreendas. Quem ouve bem, penetra melhor nos ensinamentos que lhe chegam. Ouvir, é ainda uma arte pouco exercitada.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XLIX - Muita gente se compraz na transmissão de comentários infelizes, veiculando idéias e opiniões malsãs, tomando-se estafeta da insensatez. Permanece discreto diante dos maledicentes e injuriosos, que te testam as resistências, trazendote mensagens infames, a fim de levarem a outrem, distorcidas, as tuas palavras. O silêncio, em tais circunstâncias, é como algodão que abafa e amortece o ruído do mal em desenvolvimento. Não são teus amigos, aqueles que te trazem o lixo da notícia maldosa.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: L - Deus dotou-te de força de vontade. Se te parece fraca, é porque nâo a tens exercitado. Toda e qualquer função orgânica ou moral necessita de exercício a fim de atender com rapidez aos comandos mentais. Treina-a nos pequenos hábitosviciosos, buscando corrigi-los, e, lentamente, vai passando para desafios mais expressivos. Através de uma vontade disciplinada conseguirás atingir os objetivos máximos da tua atual existência. Não desistas, se, de início, fracassares.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LI - Quem guarda rancor, coleciona lixo moral, e, consequentemente, termina enfermando. O mal que te façam, não deve merecer o teu sacrifício. Se alguém deseja ver-te infeliz, age de forma contrária, vivendo com alegria. Se outrem planeja perturbar-te, insiste na posição de harmonia. Se aquele que se tornou teu adversário trabalha pela tua desdita, continua em paz. Para quem procura infelicitar os outros, a maior dor é velos imperturbáveis. Sê inteligente e não te desgastes à toa.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LII - O perdão real é sempre acompanhado pelo esquecimento do mal recebido. Se perdoas, porém te referes ao acontecimento, estás vitalizando o erro. Trabalha a inferioridade pessoal que se fixa na lembrança do sofrimento experimentado e agradece a oportunidade de perdoar. Como evoluir sem os testes de aprimoramento moral? O perdão, que agora concedes, será o teu padrinho amanhã quando necessites da benevolência e da desculpa de outra pessoa. Perdoar é sempre melhor para quem o faz. Age sempre assim e viverás.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LIII - Os maus pensamentos intoxicam a alma. Atraem o pessimismo e as presenças doentias dos Espíritos perturbados e maus. Mantém a tua mente presa às idéias positivas, iluminativas, aos programas de enobrecimento, de cuja conduta te advirá o bem-estar íntimo e a alegria de viver. O que pensares com insistência, hoje ou mais tarde se concretizará. Os fatos se corporificam, de início, no campo mental, para depois se tornarem realidade no corpo físico. Pensa no bem e banha-te com a luz do amor.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LIV - Sê gentil e bondoso, sem te tornares servil. A humildade é uma virtude nobre que não convive com as situações vis. íntegra, enriquece o homem de valores espirituais, que o tornam forte, na sua aparente fraqueza e poderoso na sua pobreza. Sócrates, Cristo e Gandhi são os exemplos máximos da humildade e os expoentes mais belos da evolução. Abatidos por homicidas loucos, preferiram morrer a ceder, permanecendo imortais na sua grande vitória.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LV - Não troques a paz da tua consciência de amanhã, pelo prazer corruptor de hoje. O que não é moral, jamais proporciona harmonia. Fugidio e devorador, passa rápido, deixando ácido de insatisfação a queimar o corpo e sombra de remorso na consciência magoada. Permanece sedento, mas não arrependido. O que não experimentaste, não te atormenta, e, o que te falta agora, mais tarde chegará bem para a tua satisfação.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LVI - As vitórias das questões ilegais são utópicas. Deixam paladar de amargura. Injustas, ferem os outros, não podendo beneficiar, realmente, a ninguém. Quem edifica sobre terreno alheio, termina por perder a construção. Nunca será justa a alegria conseguida no rio das lágrimas alheias. Cuida bem das tuas causas e luta somente quando tiverem o apoio legal e se firmarem nos alicerces da moral.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LVII - Canaliza bem a tua energia, a fim de que se não converta e,n presunção e violência. Podes e deves ser enérgico nunca, porém, agressivo. É justo que te sintas jubiloso com os teus recursos, todavia, não te tornes jactancioso. Quando a tentação do revide perturbar-te o discernimento, reage e atua com severidade, entretanto sem exagero. A força que edifica, também derruba. Os fortes e temperamentais terminam os dias com os nervos em frangalhos e a sós...", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LVIII - Compadece-te dos fracos. Dá-lhes mão amiga em qualquer situação. Além da fragilidade orgânica, são tímidos e dependentes, reconhecendo a deficiência de energias. Ajuda-os com um sorriso afável de companheirismo, com uma promessa de silencioso apoio, mediante um gesto que lhes dê segurança. Coloca-te no lugar deles, e faze, em seu favor, o que gostarias de receber, estando na sua situação.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LIX - Conserva a coragem na luta, seja qual for a situação. Há caminhos menos difíceis de ser percorridos, no entanto, todos exigem que se os vençam. Pensa-se que, pelo fato de estar-se trabalhando peto bem do próximo, não se enfrentam dificuldades e obstáculos. É puro engano. Em toda parte e posição a criatura humana é a mesma. São Vicente de Paulo, que tanto se dedicou aos pobres, afirmava que estes \"eram muito exigentes e ingratos\". Tem, pois, bom ânimo sempre.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LX - Vez que outra, dedica algum tempo para meditar a respeito da morte. A morte arrebata os inimigos, os afetos, e te chegará num momento qualquer. Prepara-te todo dia, como se ele fosse o teu último na Terra. Acostumando-te a pensar na morte, ela não te ferirá quando passe pela tua porta ou conduza alguém que te seja amado. São Francisco de Assis aguardava-a com a tranquilidade com que \"capinava o jardim\".", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXI - A tua posse em relação aos bens terrestes é relativa. Num mundo transitório, no qual tudo passa, o que agora te pertence, amanhã terá mudado de mãos. Usa, mas não abusa dos recursos de que disponhas. Não te escravizes ao que deténs por momentos, evitando-te sofrimentos quando se transfiram para outrem. Os únicos bens de duração permanente são os tesouros dos sentimentos, da cultura e das virtudes. \"Acumula tesouros no céu\", ensina o Evangelho.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXII - Tua experiência é um valor que logras através do tempo, vivendo as lições da vida, no teu processo de evolução. Estrada percorrida, caminho conhecido. Face a tal conquista, descobres que há uma grande distância entre a teoria e a prática. Medita mais, antes de agires, tomando decisões tranquilas e alentadoras. Quando ages por impulso, estás sujeito a erros graves. Há acontecimentos que sucedem no momento próprio, no entanto, é o homem sábio quem estabelece a hora para as realizações superiores.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXIII - As coisas mais importantes da vida somente são valorizadas depois que passam ou se as perdem. Na maior parte das vezes, as pessoas vivem sob automativos, sem valorizar estes inestimáveis recursos divinos. A saúde, o sono, a razão, os fenômenos digestivos, a respiração, os órgãos dos sentidos, os movimentos, são tesouros colocados por Deus a teu serviço e não te dás conta da sua grandiosidade, gastando-os com sofreguidão, para adquirir outros bens que são secundários. Pára a pensar no significado de cada um destes dons e resguardaos dos fatores que os consomem.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXIV - Caminha um pouco ao ar livre. Tranquilamente, redescobre a natureza que te abençoa a vida. Espairece, saindo deste turbilhão em que te encontras e deixando a imaginação voar. Evita os lugares movimentados, para o teu passeio, e aspira o oxigênio balsâmico da floresta, da montanha, do mar... Refaze conceitos, acalma-te e abençoa a vida na forma como se te apresente. A tua atual existência é rica do que necessitas para ser feliz.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXV - \"Nem tanto ao mar, nem tanto à terra,\" ensina a filosofia popular. Isto é um convite ao comedimento, a uma posição sem extremismos. Toda vez que te apaixonas e tomas uma postura exagerada, cometes os mesmos erros que censuras nas outras pessoas. O meio-termo em matéria de discussão é uma situação ideal. Não por comodidade ou medo, mas, porque desconhece a questão na profundidade que exige. Um comportamento equilibrado se revela nos momentos em que são tomadas as decisões e assumidas as posturas.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXVI - Sê uma pessoa aberta às idéias, aos conceitos novos. Discute-os, compara-os com o que sabes e pensas, retirando o melhor proveito das informações que desconheces. As idéias salutares renovam a emoção, abastecendo os sentimentos com estímulos e entusiasmo. Ninguém é tão sábio que não necessite aprender mais, nem tão completo que possa dispensar outros contributos para o seu crescimento íntimo. Aprende mais, estando receptivo a novas contribuições.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXVII - Os ingredientes que excitam a mente, o corpo, a emoção, devem ser evitados por ti. As melodias suaves, na boa música, harmonizam, enquanto outras, programadas para a luxúria e a violência, desassossegam, alterando o ritmo nervoso. As leituras edificantes instruem e educam da mesma forma que as extravagantes e sensuais corrompem e alteram a escala de valores morais para pior. As conversações sadias levantam o ânimo, quanto as vulgares relaxam o caráter. Poupa-te à onda de indignidade que toma conta do mundo e das pessoas.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXVIII - Quando desconheceres um assunto, confessa a tua ignorância a seu respeito. Não tens obrigação de saber tudo, de estar informado sobre todas as coisas. Questão de apreço é a honestidade de quem reconhece os próprios limites. E mesmo que estejas inteirado da informação que alguém te dá, ouve-a com paciência. Terás ensejo de conferi-la com as notícias que já tens, enriquecendo mais o teu conhecimento ou corrigindo-o. Uma pessoa que parece muito bem informada, às vezes tem somente um conhecimento superficial, aparentando mais do que sabe. Quem sabe ouvir, lucra sempre.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXIX - Ser pai ou mãe é uma grande responsabilidade. Cada criatura traz o destino que organizou para si mesma em reencarnações passadas. No entanto, ela nunca deixará de assimilar os exemplos vividos no lar pelos pais. A primeira escola é, pois o lar, e este, por sua vez é o resultado da conduta dos esposos que se devem esforçar para fazê-lo agradável, honrado e rico de paz. Abençoa o teu filho com as tuas palavras e conduta, fazendote amigo dele em todas as situações. Os filhos, como todos nós, somos de Deus, e prestarás conta do empréstimo que te foi concedido para educar.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXX - Ninguém colhe em seara alheia, que não haja semeado, no que diz respeito aos valores morais. Cada um é herdeiro de si mesmo. Espírito imortal que é, evolui de etapa em etapa, como aluno em educandário de amor, repetindo a lição quando erra e sendo promovido quando acerta. Assim, numa existência dá prosseguimento ao que deixou interrompido na outra, corrige o que fez errado ou inicia uma experiência nova. O que, porém, não realiza por amor, a dor o convocará a executar.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXI - Estás mergulhado no oceano do amor de Deus. Jamais te encontras sozinho. Deus está em ti e em torno de ti. Descobre-O e deixa-te conduzir por Ele com sabedoria. És Seu herdeiro, possuidor do universo. Permite que o Seu amor te permeie totalmente, comandando a tua vontade e os teus passos, facultando-te crescer com menor ou nenhuma dose de sofrimento. Em Deus tudo encontras, plenificando-te completamente.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXII - Abençoa com alegria cada oportunidade evolutiva. A dor enfrentada com resignação diminui de intensidade, tanto quanto suportada em silêncio passa com mais rapidez. Nunca te alcançam os sofrimentos que não mereças, assim como não passarás pela Terra, em regime de exceção, sem os enfrentares. As Leis de Deus são iguais para todos. Substituindo o amor que escasseia, a dor é a mestra que impulsiona ao avanço.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXIII - As lesões da alma são mais mortificadoras. As feridas externas são de fácil cicatrização, enquanto aquelas que pululam no íntimo tornam-se de mais demorado curso. Banha-te nas águas da confiança em Deus, da paciência, da humildade, do perdão e do amor, não permitindo que o ódio, o egoísmo, a revolta e a mágoa te macerem os tecidos da alma. Muitas enfermidades do corpo procedem do espírito danificado pelos conflitos da emoção ou pelo ácido das imperfeições morais. Cuida dos equipamentos internos, resguardando-os da agressão contumaz do vício e da irresponsabilidade.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXIV - O que não possas concluir agora, não te seja motivo de agastamento. Faze o possível em esforço e dedicação, no entanto, evita o aborrecimento que o aparente fracasso produz. Quando alguma ação ultrapassa a tua capacidade de executála ou a circunstância não te permita fazê-la, cabe-te o dever da serenidade. Quem faz o que lhe está ao alcance, realiza o máximo. ... E o que não possas concluir agora, terminarás amanhã, se porfiares fiel ao compromisso.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXV - Afugenta o melindre da área do teu comportamento pessoal. Sempre encontrarás pessoas simpáticas como inamistosas pelo caminho por onde segues. Não vale a pena melindrar-se, remoendo insatisfação. Toda marcha está sujeita a tropeços e dificuldades, que constituem desafio e emolução para o avanço. Uma jornada sem problemas torna-se monótona e desmotivadora. Tu cresces em razão das lutas que enfrentas. Permanece, pois, de bom humor sempre, mesmo diante das pessoas congeladoras ou agastantes.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXVI - Dilui a queixa sistemática, que te torna uma pessoa de difícil convivência. È muito desagradável a companhia de alguém que está sempre a reclamar, vendo defeitos em tudo e desejando que o mundo gire na sua órbita e de conformidade com a sua maneira de ver as coisas. Não poderás modificar os outros, porém, deves empenhar-te para conseguir a própria transformação para melhor. Se tudo te desagrada e estás, costumeiramente, reclamando, cuidado, porquanto esta é uma atitude de quem está de mal com a vida e vive mal consigo mesmo. É necessário que te toleres, aprendendo a ser tolerante com o próximo.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXVII - No dia de hoje, pelo menos, coloca beleza nos teus olhos, a fim de fitares a vida com lentes mais claras. Liberta-te das impressões negativas que te acompanharam ao leito, na noite passada, e dispõe-te a encarar o mundo e as pessoas com uma dose de boa vontade. Notarás que o teu estado íntimo se renovará e tudo adquirirá vida agradável ao teu redor. A boa vontade, em relação aos outros, retorna como simpatia e camaradagem deles, em relação a ti. Enfrenta o dia novo, disposto a vencer e conquistando o espaço bom que te está reservado no mundo.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXVIII - Se uma dificuldade surge, impedindo-te a caminhada, não percas tempo. Detém o passo e contorna o obstáculo. Se algum problema inesperado ameaça o teu equilíbrio, não te aflijas. Silencia a revolta e busca solucioná-lo conforme as tuas possibilidades. Se alguém, a quem amas, mudou de conduta em relação a ti ou abandonou-te, mantém-te sereno. O rebelde e o desertor, com as suas atitudes intempestivas, já perderam a razão. Permanece em paz. O que agora percas, conseguirás mais tarde. Quanto te aconteça, sabendo te portares, será sempre para o teu bem futuro.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXIX - Tranforma as tuas horas num rosário de bênçãos. Aproveitando-as com sabedoria, no trabalho edificante, formarás um patrimônio de felicidade, o qual não podes imaginar. Desperdiçando-as, não conseguirás recuperá-las. A hora que passa não retorna, qual a água que corre sob a ponte. A eternidade é feita de segundos, e o tempo medido pelas horas é a concessão de Deus para te proporcionar bem-estar. Trabalha sem desânimo e acumula as tuas horas de ação benéfica.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXX - Podes fazer mais em favor da humanidade se te dispuseres a isto. Distende a mão a alguém caído; dize uma palavra cortês a outrem; sorri para uma pessoa solitária, acenando-lhe fraternidade; presenteia um amigo com uma flor; faze sorrir um triste; enlaça em ternura um desafortunado... Há moedas de amor que valem mais do que os tesouros bancários, quando endereçadas no momento próprio e com bondade. Ninguém dispensa um amigo, nem desdenha um gesto socorrista. Disputa a honra de ser construtor do mundo melhor e de uma sociedade mais ditosa.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXXI - Jesus disse: \"Não se turbe o teu coração\", ensinando que a calma e a confiança em Deus devem ser o lema de toda criatura que deseja encontrar a felicidade. Nunca faltam motivos para preocupações, inquietando o coração, perturbando a vida. A existência humana é uma oportunidade de valorização dos bens eternos e de iluminação íntima. Se colocas as tuas ansiedades em Deus e Lhe confias a tua vida, tudo transcorre normalmente, e, se algo perturbador acontece, a serenidade assume o controle da situação e age com acerto. Deste modo, não te permitas turbar o coração nem a mente, ante as ocorrências malsucedidas.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXXII - Quando assumas um compromisso honra-o com a tua presença. Antes de aceitares qualquer incumbência, medita a respeito, a fim de que não te situes numa posição desagradável. Sucedendo algum impedimento à tua comparência ou desincumbência da tarefa, comunicao com antecipação, de modo a não prejudicares quem te aguarda, ou aquele que confia na tua palavra. Sejam de pequena monta ou alta responsabilidade, desincumbete de todos os deveres que assumires.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXXIII - Não temas os teus acusadores, quando estiverem mentindo contra ti, através de calúnias, desejem arrastar-te para as lutas inglórias. Quando sejas acusado e o fato seja verdadeiro, agradece a Deus a oportunidade de repará-lo em tempo, reabilitando-te para o teu próprio bem-estar. É sempre melhor recuperar-se do erro enquanto se está com a sua vítima ao alcance. Toda dívida que se adia, fica majorada com a carga dos juros, portanto, mais penosa para ser resgatada.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXXIV - Seleciona as tuas companhias. Os maus companheiros tornam-se presenças inconvenientes na tua vida e perturbam-te a marcha. Ninguém é tão independente e pleno que não corra o perigo de contaminar-se, com aqueles que estagiam e se comprazem na delinquência ou na insensatez viciosa. Sê gentil com os maus e estúrdios, porém, não te imiscuas com eles, seu comportamento, suas atividades e filosofia de vida. As enfermidades morais também contagiam os incautos que delas se aproximam.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXXV - Sê ordeiro nas tuas atividades. Não te apoquentes ante o muito a fazer, nem te descuides em relação às tuas tarefas. À medida que o tempo te permita, vai realizando cada uma delas até que as conclua todas. Um homem disciplinado é um tesouro. Quem sabe desincumbir-se dos serviços monótonos e constantes, pode empreender grandes realizações com a certeza do êxito. Agir com ordem e ter consciência de que a vida é uma ação que não cessa, significa um avançado passo no caminho da evolução.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXXVI - Insiste na preservação da tua saúde. Muitas enfermidades têm origem no temperamento desajustado, nas emoções em desalinho, em influências espirituais negativas. .. A ansiedade, o medo, o pessimismo, a ira, o ciúme, o ódio, são responsáveis por males que ainda não se encontram catalogados, prejudicando a saúde física, emocional e mental. Esforça-te por permanecer em paz, cultivando os pensamentos bons, que te propiciarão inestimáveis benefícios. Conforme preferires mentalmente, assim te será a existência.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXXVII - O conselho somente terá valor se estiveres disposto a segui-lo. Quando estejas com dificuldade em qualquer assunto, recorre a uma pessoa mais experiente, mais bem equipada, pedindo-lhe ajuda e orientação. Todavia, não leves a tua própria opinião, tentando prová-la verdadeira. Ouve com cuidado, reflexiona e, depois, toma a decisão que te pareça mais acertada. Por outro lado, não faças ouvidos moucos às orientações e conselhos que te dêem ou que busques. \"Examina tudo e retém o que é bom\", ensina o Apóstolo, em nome do Bem.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXXVIII - Ninguém resolverá os teus problemas se não te dispuseres a enfrentá-los e solucioná-los. Encontrarás quem te empreste uma soma, a fim de resgatares uma dívida. Entretanto, o débito permanece, havendo, somente, mudança de credor. O amigo pode tornar-se um cireneu junto a ti, mas a cruz é pessoal, e cada criatura tem o dever de conduzi-la até o seu calvário libertador. Desta forma, não sobrecarregues os teus afeiçoados com as tuas queixas, reclamações e problemas. Busca equacionar os teus problemas, um de cada vez, até vencê-los todos.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: LXXXIX - Se a tua palavra não tiver o objetivo de auxiliar, não a apresentes para criticar. Há dois tipos de comportamento: o daqueles que fazem e o daqueloutros, que ficam de palanque, apontando erros, criticando, atormentando a vida das pessoas. Faze quanto te seja possível, sem aguardar aplauso, nem temerpedradas. Torna-te membro do grupo que opera e fala com o objetivo superior de ser útil. Se, os que dizem saber como se fazem as coisas, deixassem de opinar e as executassem, o mundo mudaria de feição.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XC - Não te isoles, no círculo social onde te encontras. A solidão aconselha mal. Quem se afasta do convívio familiar, do trabalho, da comunidade, perturba se. A fuga do mundo gera distrofia da razão, apresentando uma visão desfocada a respeito das pessoas e das coisas. Os homens existem para viver em sociedade, ajudando-se reciprocamente e aprendendo uns com os outros. Na luta diária e na atividade humana aferem-se os valores, que se devem desenvolver e aprimorar.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XCI - Pensa em termos de vida eterna. A morte é somente um veículo para a mudança de domicílio. Quando os tecidos físicos se gastam ou se rompem violentamente, libertam o Espírito eterno, que retorna à Pátria Espiritual. Tudo se transforma. O corpo se altera e decompõe, indo vitalizar outras expressões materiais. Já o ser espiritual, que nele habita transitoriamente, deixa-o para assumir a sua realidade estrutural. Vive, portanto, considerando que a morte pode alcançar-te em qualquer momento, devendo te prapares desde já para a viagem inevitável.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XCII - Não coloques as tuas aspirações nos entretenimentos, viagens, festas e folguedos... Caso te surjam as oportunidades para gozá-los, muito bem, aproveita e constatarás que estes prazeres passam como outras satisfações quaisquer, deixando-te ansioso por novas ocasiões de fruí-los, e assim, incessantemente. Há quem sacrifique o futuro, utilizando-se de empréstimos e prestações com juros extorsivos para viver estas ilusões, que retornam como pesadelos, no momento dos resgates das dívidas. Busca os prazeres simples e duradouros, aqueles que não te perturbam o presente nem te escravizam no futuro.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XCIII - Cuida-te, para que o pessimismo e a revolta não se agasalhem nos teus sentimentos, anestesiando ou exacerbando os teus nervos. Reconsidera atitudes e ocorrências desagradáveis, revestindo-te de bom ânimo e prosseguindo imperturbável. O teu estado de espírito muito contribui para o resultado das tuas aspirações e dos teus atos. Quando encetas uma tarefa com mau humor ou rebeldia já perdes a melhor parte da realização. Em todos os teus empreendimentos coloca o sol da esperança com o calor do otimismo e o êxito te será inevitável.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XCIV - \"Não só de pão vive o homem — disse Jesus — mas também da palavra de Deus.\" A preocupação com o alimento diário e o vestuário, o domicílio e a convivência social não deve anular o interesse pela vida espiritual. Reserva, diariamente, algum tempo para te alimentares com a \"palavra de Deus\". O pão sustenta o corpo e a fé mantém a alma. O pão fortalece a matéria e a fé dignifica a vida. O pão mata a fome por pouco tempo, mas a fé atende a necessidade para sempre. Cuida do corpo e nutre a alma, a fim de que te sintas completado.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XCV - Refreia os impulsos, que procedem dos instintos desgovernados, e age sob o comando da razão. É verdade que o sentimento bom deve derreter o gelo da lógica racional, no entanto, muitas vezes, a frieza da emoção ou a sua loucura agressiva necessitam da vigilância do raciocínio. Cérebro e coração devem atuar juntos, proporcionando as vantagens do equilíbrio e do comedimento, em favor de uma vida sadia. Ouve com o sentimento e age com a razão, dosando bem a participação de cada um.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XCVI - Apresenta-te sempre bem, quanto te seja possível, sem o excesso de esmero, parecendo um manequim, ou descuidado, qual se fosse uma pessoa displicente. A roupa é feita para o homem, e não este para viver em função daquela. As modas são caprichos de mercado, para granjear recursos, estimulando a insensatez e a imaturidade das pessoas. O traje asseado que proteja o corpo, embora ultrapassado, é mais importante do que o último figurino em exibição, muitas vezes, ridícula. Não te atormentes, face à insignificante justificativa de não estares na moda, sempre de passagem.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XCVII - A dor que te alcança é tua. Ninguém a sofrerá por ti. Os amigos se apiedarão, buscarão auxiliar-te, porém, o empenho estará cravado nas carnes da tua alma. Da mesma forma, a felicidade que te chega, é tua. Haverá riso e satisfação entre aqueles que te amam, todavia, a sensação de júbilo não a podes repartir com ninguém. Isto posto, no sofrimento, não imponhas amargura àqueles que te cercam, conforme na alegria, não podes fazer que eles se sintam ditosos.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XCVIII - Exila das províncias da tua vida a maldade. Rebate o pensamento doentio com o saudável; corta a rede perniciosa das suspeitas injustificáveis com a tesoura da confiança no teu próximo. É tormentoso viver armado contra os outros, ver primeiro o lado negativo, detectar a imperfeição. Ninguém há, na Terra, sem defeitos, como não existe uma só pessoa que não possua também virtude, por pior que este indivíduo seja. Procura o lado bom de todos e te descobrirás bem, renovado e afável.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: XCIX - Os violentos terminam por exterminarem-se uns contra os outros ou cada qual por si mesmo. A atitude de paz resolve qualquer situação beligerante, se o amor comandar os contendores. Toda reação, para cessar, deve ter sustada a causa que a desencadeia. Se esta é a violência, somente o seu antídoto, a prudência, conseguirá fazê-la passar. Uma pessoa pacífica acalma outra, as duas alteram o comportamento de um grupo, este pode modificar a comunidade, e, assim, por diante. Faze a tua parte, vencendo a violência.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: C - Não grites. Nenhuma situação exige a gritaria, que confunde e mais perturba. Se falares em tom adequado, os barulhentos silenciarão para ouvir-te. Se desejares competir com eles em altura de voz, ficarás rouco e não serás escutado. A voz caracteriza o comportamento e a emoção das pessoas. Não nos referimos às técnicas de prosódia, que têm a sua finalidade, porém à tonalidade natural, audível, sem agressividade. Já te escutaste num gravador, especialmente quando em desequilíbrio? Faze a experiência.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CI - Necessitas de serenidade a cada passo. Serenidade para discernir, atuar e viver. A vida é galopante e muda os seus cenários a cada minuto, exigindo permanente serenidade a fim de não esmagar as pessoas. Quem se aflija, e tente seguir a velocidade ciclópica destes dias, arrebenta-se, porque sai de uma para outra situação com muita rapidez, sem mesmo tempo para adaptação na fase anterior. As notícias chegam e os acontecimentos passam, produzindo imenso desgaste emocional, mental e físico: Resguarda-te na serenidade, preservando os equipamentos da tua existência, que estão programados para uso adequado e não para o abuso.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CII - Este teu cansaço contínuo, acompanhado de insatisfação e de mau humor, é um sinal vermelho de perigo em tua vida. Resulta da maneira irregular de como vens aplicando os teus recursos e energias, sem o competente refazimento. Não te bastará dormir, dar descanso ao corpo, se permaneceres emocionalmente inquieto, ansioso. Assim, dá um balanço dos teus atos, medita em profundidade e perceberás que te está faltando o \"pão do espírito\", que nutre e reconforta. Reorganiza a vida e busca o equilíbrio, enquanto é tempo.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CIII - Examina quanto tempo diariamente dedicas à tua vida espiritual. Trabalhas, veste-te, distrai-te, alimenta-te, dormes e reservas breves minutos ao espírito encarnado, mediante uma rápida oração, uma pequena leitura, ou ouves uma palestra, às vezes nenhuma destas concessões lhe facultas. O homem não é somente o corpo-mente. Antes de tudo é o ser espiritual, que conduz os implementos corpo-mente e exige atendimento espiritual para bem executar as tarefas que lhe dizem respeito. O corpo necessita de cuidados para viver, mas, a alma, também.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CIV - A inveja é um grande inimigo, que necessitas combater no teu mundo íntimo. Ela se insinua, cruel, nas telas mentais, e desequilibra a emoção. Torna-se fiscal impiedosa e capataz insensível. Arma ciladas, vinga-se pelo pensamento, através da palavra e da ação, persegue implacavelmente. Incontáveis crimes se originam na inveja, fora aqueles que não chegam a consumar-se. A inveja é inferioridade que tem de ser corrigida e transformada em camaradagem e satisfação.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CV - Não dês os teus espaços mentais para os pensamentos vulgares. Preenche todas as brechas com idéias de edificação, da ação do bem, da felicidade própria e alheia. É na mente que se iniciam os planos de ação. A mente ociosa cria imagens infelizes que se corporificam com alto poder de destruição, consumindo quem os elabora e atingindo as outras pessoas. Luta com vontade para que a \"hora vazia\" não se preencha de lixo mental tornando-te infeliz ou vulgar.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CVI - A tristeza é mensageira de sofrimento. Não te prendas a ela, nem te permitas contaminar pelos seus miasmas. É certo, que nem todos os dias são claros e ricos de alegria. Há ocasiões em que o sofrimento parece dominar os quadros da tua atividade. No entanto, examinadas as dificuldades e sentidas as dores, faze sol íntimo, afugentando a tristeza da tua mente, a fim de que mais facilmente superes os acontecimentos provacionais. O cultivo da tristeza abre campo a várias enfermidades da mente, da emoção e do corpo.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CVII - Sê cordato sempre. É melhor perderes algo numa disputa, do que te engalfinhares numa luta mais prejudicial, que te trará danos maiores. Não se trata de ter medo, porém de possuir sabedoria. O homem pacífico é feliz, e as quinquilharias não o podem perturbar. O problema é de eleição. Que será melhor: ganhar uma altercação, para não ser ignorante ou bobo, ou perdê-la, sendo prudente e sábio? A cordura sempre vence. O que não logra exteriormente, consegue em paz interna.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CVIII - Sê amigo de quem te busque o apoio, a presença. As criaturas necessitam tanto de pão quanto de amigos para viver. Há quem caminhe na multidão, sofrendo a soledade, necessitando de companhia, de amizade. Nunca permitas que a outra pessoa se afaste da tua presença sem que leve algo bom dos minutos passados contigo. Tens muito a oferecer. Descobrir tais valores, seja o teu primeiro passo. Pô-los a benefício do próximo, o imediato. Ninguém está privado dos bens espirituais, que não possa dispor de alguma coisa para oferecer.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CIX - Não descarregues o teu azedume, conflitos e recalques nos servidores da tua casa, do teu trabalho, da tua esfera social. Eles já sofrem o suficiente, dispensando a carga de amargura e mal-estar que lhes destinas. Coloca-te no lugar deles e verás quanto gostarias de receber gentilezas, ter atenuadas as humilhações que passasses, as dores que carpisses... São teus irmãos carentes. Se te fazem grosserias e são rudes, educa-os com o silêncio e a bondade. Eles desconhecem as boas maneiras, necessitando do teu exemplo.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CX - Concede uma nova oportunidade ao teu desafeto, facilitando-lhe a aproximação. Mantém-te receptivo. É possível que ele tenha mudado de opinião, reconhecido o erro, e esteja aguardando ensejo. Todos nos enganamos, e desejamos ocasião para nos reabilitarmos. Se te encerras na mágoa e nada mais queres com ele, a tua é uma postura igual ou mais censurável que a dele. Não deixes que um capricho do amor-próprio ou do orgulho ferido te roube uma excelente ensancha de ser vencedor em ti mesmo.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXI - Faze um exame de consciência, quando possas e quantas vezes te seja viável. Muitas queixas e reclamações desapareceriam se o descontente analisasse melhor o próprio comportamento. Sempre se vê o problema na outra pessoa e o erro estampado no semblante do outro. Normalmente, quando alguém te cria dificuldades e embaraços está reagindo contra a tua conduta, à forma como te expressaste e à maneira como agiste. Tem a coragem de examinar-te com mais severidade, rememorando atitudes e palavras. Ao descobrires erros, apressa-te em corrigilos; busca aquele a quem magoaste e recompõe a situação. Não persevere em erro, seja qual for a justificação.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXII - Lê uma pequena página, cada dia, na qual encontres alento e inspiração. Incorpora este dever aos teus hábitos. Ela te enriquecerá de júbilo, clareando as nuvens que possam envolver-te nas horas seguintes e arrimando-te ao bem-estar, caso suceda alguma surpresa desagradável. Todas as pessoas necessitam de um bom conselheiro, e, nessa página, que extrairás do Evangelho, terás a diretriz de segurança e a palavra de sabedoria para qualquer ocorrência. Se os homens reflexionassem um pouco mais antes de agirem, evitariam males incontáveis. Já que outros não o fazem, realiza-o tu.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXIII - Nunca percas a esperança. Haja o que houver, permanece confiando. Se tudo estiver contra, e o insucesso te ameaçar com o desespero, ainda aí espera a divina ajuda. Somente nos acontece o que será de melhor para nós. A lei de Deus é de amor. E o amor tudo pode, tudo faz. Quando pensares que o socorro não te chegará em tempo, se continuares esperando, descobrirás, alegre, que ele te alcançou minutos antes do desastre. Quem se desespera já perdeu parte da luta que irá travar, avançando prejudicado.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXIV - A juventude do teu corpo é breve. Utiliza-a para armazenar valores eternos. O verdor dos anos passa com celeridade, porém, os compromissos firmados se alongam por toda a existência. Tem cuidado com eles. Os bons serão sentinelas da tua jornada, abençoando-te as horas, e os maus se transformarão em cobradores impiedosos, perturbando-te a paz. Coloca sinais de luz pela senda, significando conquistas do terreno percorrido. Mantém-te jovem em todas as idades, através de uma consciência sem remorsos e de uma conduta reta.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXV - Disciplina a vontade, im pedindo-te ser vítima da irresponsabilidade. Começa tuas atividades de pequena monta, mantendo a ordem e a eficiência em cada realização. Quando tiveres muitas tarefas a realizar, não percas tempo, escolhendo por qual iniciar. Executa a que esteja mais próxima, passa à seguinte, e, sucessivamente, desincumbe-te de todas. Enquanto não dês o primeiro passo, não chegarás ao fim do caminho. A primeira palavra dá início ao discurso. A disciplina é responsável pelo êxito das elevadas realizações.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXVI - Com certeza não solucionarás todos os problemas do mundo. Não obstante, podes e deves contribuir para que isto aconteça. Se não impedes a guerra, tens recursos para evitar as discussões perturbadoras que te alcançam; se não consegues alimentar a multidão esfaimada, possuis uma côdea de pão para oferecer a alguém; se não dispões de saúde para brindar aos enfermos, logra socorrer um padecente; se não solucionas os dramas humanos, concorre para acalmar uma pessoa; se não tens meios para liderar grupos acelerando mudanças que se devem operar no mundo, modifica-te, interiormente, enobrecendo-te na ação do bem e da solidariedade.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXVII - Reserva um breve espaço de tempo entre os teus deveres para a beleza. Desperta cedo, a fim de acompanhar o nascer do dia, embriagando-te com a pujança da luz. Caminha por um bosque, silenciosamente, aspirando o ar da Natureza. Movimenta-te numa praia deserta e reflexiona em torno da grandiosidade do mar. Contempla uma noite estrelada e faze mudas interrogações. Contempla uma rosa em pleno desabrochar... Detém-te ao lado de uma criança inocente... Conversa com um ancião tranquilo... Abre-te à beleza que há em tudo e adorna-te com ela.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXVIII - Aceita as pessoas, conforme estas se te apresentam. Este homem prepotente que te desagrada, está enfermo, e talvez não o saiba. Esse companheiro recalcitrante é infeliz em si mesmo. Aquele conhecido exigente sofre dos nervos. Uns, que parecem orgulhosos, são apenas portadores de conflitos que procuram ocultar. Outros, que se apresentam indiferentes, experimentam medos terríveis. A Terra é um grande hospital de almas. Quem te veja, apenas, superficialmente, não terá como analisarte com acerto. Concede a liberdade para que cada um seja conforme é e não como pretendes que sejam.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXIX - Sê sábio, investindo no futuro. O que ora te acontece, resulta do passado que não podes remediar. Mas, aquilo que irá suceder, depende do que realizes a partir de hoje. Enquanto recolhes efeitos de ações passadas, estás atuando para consequências futuras. Conforme semeares, assim colherás. A tua fatalidade é o bem. Como atingi-lo, será opção tua, mediante ação rápida ou retardada e contra-marchas. Ninguém está fadado ao sofrimento. Este é o resultado da escolha errada. Investe no amanhã e serás feliz desde hoje.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXX - Mesmo que não saibas, és exemplo para alguém. Sempre existem pessoas que estão observando os teus atos, mesmo os equivocados, e se afinam com eles. Desse modo, és responsável, não só pelo que realizes, como também, pelo que as tuas idéias e atitudes inspirem a outros indivíduos. Os ditadores e arbitrários, a sós, nada conseguiriam fazer, não fossem aqueles que pensam de igual modo e os apoiam. Assim também, a obra do bem faleceria, se não houvesse pessoas que se lhe vinculassem com sacrifício e amor. Cuida do que fales e realizes, ensejando seguidores que se edifiquem e ajam corretamente.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXI - Ouve com serenidade sempre que a tal sejas convocado. Permite que o outro conclua o pensamento, não antecipando conclusões, certamente incorretas. Nem todos sabem expressar-se com rapidez e clareza. Escuta, portanto, com boa disposição, relevando as colocações e palavras indevidas, assim, buscando entender o que ele te deseja expor. Se te acusa, procura a raiz do mal e extirpa-a. O diálogo deve sempre transcorrer sem azedume, deixando saldo positivo. Se te esclarece ou ensina, absorve a lição. Se acusa alguém, diminui a intensidade da objurgatória com expressões de conforto ao ofendido.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXII - Em qualquer circunstância, mantém-te tu mesmo. Não te apresentes superior ao que és, nem te subestimes, a ponto de parecer o que não sejas. Anelando por uma posição melhor, empenha-te para lográ-la. Descobrindo imperfeições, luta por te aprimorares. Mente, todo aquele que exibe dotes que não possui, quanto o indivíduo que os esconde e os nega. Ser autêntico, é forma de adquirir dignidade. A ascensão é lenta para todos. Quem hoje triunfa, começou a batalha antes. Quem está combatendo, logrará a vitória depois. Não te constranjas por seres um Espírito em provação. Os amigos de hoje atravessaram, oportunamente, o caminho por onde agora seguem os teus pés.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXIII - O teu serviço, aparentemente humilhante, que outras pessoas menosprezam, é o teu tesouro, o ganha-pão que te concede honradez. Realiza-o consciente da sua importância, desincumbindo-te dele com nobreza. O diamante que fulgura veio da entranha da terra onde confraternizava com os vermes, e o pão saboroso, que enriquece a mesa, nasceu do trigo que se desenvolveu no charco... Trabalhar, constitui desafio para todos. Enquanto o homem produz, a marcha do progresso não se interrompe. Dignifica as tuas atividades, sendo-lhes fiel servidor.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXIV - O despeito responde por muitos males humanos. Planta maligna, enraíza-se na inveja doentia. Inspirando atitudes infelizes, o despeito fomenta perseguições gratuitas, acusações incessantes, informações venenosas. O despeitado não perdoa o triunfo do próximo. Sempre descobre o lado infeliz de qualquer questão, o \"alfinete perdido no palheiro\". Sofre sem necessidade, amargura-se constantemente e luta contra os dragões que vê nos outros, quando o problema é somente dele. Aprende a compartilhar do triunfo do teu irmão e vencerás o despeito.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXV - Estuda sempre. Incorpora às tuas atividades o hábito da boa leitura. Uma página por dia, um trecho nos intervalos do serviço, uma frase para meditação, tornam-se o cimento forte da tua construção para o futuro. O conhecimento é um bem que, por mais seja armazenado, jamais toma qualquer espaço. Pelo contrário, faculta mais ampla facilidade para novas aquisições. As boas leituras enriquecem a mente, acalmam o coração, estimulam ao progresso. O homem que ignora, caminha às escuras. Lê um pouco de cada vez, porém, fá-lo constantemente.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXVI - Um pouco de silêncio interior far-te-á muito bem. A azáfama desgastante, as preocupações contínuas, os sobressaltos, diminuem as resistências morais. Indispensável que te reserves tempo emocional para o teu refazimento, o teu silêncio interior. Ora, sem palavras, e acalma-te, deixando as idéias fluírem com espontaneidade, recompondo as paisagens emocional e nervosa, a fim de prosseguires na luta. Nesses instantes, encontra-te contigo mesmo e experimenta o júbilo de te amares, cuidando de ti e renovando-te, a fim de que nenhum mal permaneça contigo.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXVII - Não conduzas o ultraje que alguém te atirou, desmoronando o teu dia. Certamente, há pessoas que não simpatizam contigo e até te detestam. Mas, isto não é surpresa, porque te ocorre o mesmo em relação a outras. Este é um problema que os corações pacificados resolvem com facilidade, nunca valorizando ofensas, nem se importando com elas. Há um grande número de pessoas gradas e afetuosas que te cercam, que não é justo te agastares com aquelas, as que constituem exceção no teu caminho. Deixa no chão do esquecimento a ofensa que te dirigem e segue na direção do amor que te aguarda.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXVIII - Há um sol brilhando dentro de ti. É a presença do Cristo no teu coração. Não lhe empanes a claridade com as nuvens tio mau humor, da revolta, da insatisfação... A luz que vem do exterior clareia, mas, projeta sombra, quando enfrenta qualquer obstáculo. O teu sol interior jamais provoca treva, porque ilumina de dentro para fora, em jorros abundantes. Usando o combustível do amor, tua luz se fará sempre mais poderosa, irradiando-se, abençoada, em todas as direções. Permite, pois, que brilhe a tua luz em toda parte.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXIX - Ainda é tempo de recompores uma situação infeliz que está ficando para trás. Enquanto estás no caminho com o outro, há oportunidade para refazer e corrigir. Se ele não aceita a tua disposição, o problema já não é teu. Enquanto, porém, não te disponhas ao ato nobre, permaneces em débito. O mau momento ocorre sempre. A manutenção dele é opcional do capricho humano. Saneia-te com a disposição superior de não conservar lixo emocional, buscando todo aquele com quem não foste feliz, a fim de retificar a situação.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXX - A pontualidade, além de um dever, é também uma forma de respeito e homenagem a quem te espera ou depende de ti. Agindo com cuidado, o tempo jamais te trairá deixando-te em atraso. O hábito de chegar em tempo é adquirido da mesma forma que o da irregularidade de horários. Programa os teus compromissos e desincumbe-te serenamente de todos eles, cada um de sua vez. Quando não possas comparecer, ou tenhas que te atrasar, dizeo antes, a fim de liberar quem te aguarda. Deste modo, quando ocorrer um imprevisto, e tenhas que chegar tarde, mesmo que não acreditem na tua justificativa, estarás em paz.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXXI - Ante as dificuldades do caminho e as rudes provas da evolução, resguarda-te na prece ungida de confiança em Deus, que te impedirá resvalar no abismo da revolta. Um pouco de silêncio íntimo e de concentração, a alma em atitude de súplica, aberta à inspiração, eis as condições necessárias para que chegue a apaziguadora resposta divina. Cria o clima de prece como hábito, e estarás em perene comunhão com Deus, fortalecido para os desafios da marcha.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXXII - São considerados infortúnios as ocorrências naturais do processo da existência humana: perda de pessoas queridas, acidentes com sequelas dolorosas, ruína económica, falência afetiva, terremotos e outros cataclismas... Certamente, constituem problemas graves, não, porém, desgraças reais, exceto p ira quem se deixa revolucionar pelos seus efeitos, destruindo os valores elevados da vida. Sabendo-se enfrentar esses fenômenos geradores de dissabor, deles se retiram valiosos bens que felicitam.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXXIII - A oportunidade de elevação moral que a vida te permite, deve ser aproveitada com sabedoria e imediatamente. A sucessão do tempo é inevitável, e, passada a ocasião, ei-la perdida. Tempo e vento que passam, não retornam jamais. Assim, utilizares-te proveitosamente de cada ensejo de crescimento íntimo, é bênção que liberta. Permanece vigilante, de modo a aproveitares todas as horas da tua existência carnal.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXXIV - Repete a lição equivocada, sem qualquer mágoa. A aprendizagem dispõe de várias técnicas para fixar o conhecimento. A do \"erro e o acerto\" constitui a mais comum e normal. Na área dos acontecimentos morais o processo ocorre da mesma forma. Erro de hoje, reparado mediante a repetição da experiência, aprendizagem fixada para sempre.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXXV - Enquanto disponhas de recursos, cultiva a solidariedade. És um ser social e necessitas da convivência com o teu próximo, a fim de colimares as metas para as quais renasceste. A solidariedade é um dos instrumentos mais valiosos para o êxito do tentame. Torna-te útil, sé gentil, esparze a bondade, e, em compensação jamais te encontrarás a sós.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXXVI - Usa da medida de tolerância para com o teu próximo, conforme a esperas receber de alguém em momento próprio. Ninguém existe, na Terra de hoje, que marche sem equívocos, sem temor, sem tormentos, gerando aflições quando desejava acertar e produzindo sofrimento quando intentava apaziguar, necessitando compreensão, como efeito, tolerância. Assim, semeia hoje a tolerância, de forma a colhê-la amanhã.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXXVII - Não obstante o relacionamento afetivo e social que manténs, os testemunhos que te dimensionarão em outra posição fazem-se sempre sem condições de surpresa, colhendo as pessoas a sós. Os afetos, os amigos, os companheiros, poderão partilhar-te as dores, porém, a tua, será sempre uma cruz pessoal. Nem poderia ser diferente. Ao amparo da justiça divina , cada homem resgata de acordo com a dívida e cresce conforme a circunstância em que delinqúiu. Equipa-te de paz e fé, preparando-te para a ascensão que se te impõe, inevitável.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXXVIII - Sê amigo conveniente, sabendo conduzir-te com discrição e nobreza junto àqueles que te elegem a amizade. A discrição é tesouro pouco preservado nas amizades terrenas, normalmente substituída pela insensatez, pela leviandade. Todas as pessoas gostam de companhias nobres e discretas, que inspiram confiança, favorecendo a tranquilidade. Ouve, vê, acompanha e conversa com nobreza, sendo fiel à confiança que em ti depositem.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXXXIX - Há quem cultive a verdade, tornando-a arma para agredir os outros. A verdade, porém, reflete luz mirífica, aclaradora de incógnitas, que jamais fere ou aflige. É como pão, que deve ser ingerido sem exagero, ou como linfa, que merece ser sorvida na quantidade exata. À medida que nutre e dessedenta, acalma e felicita, enriquecendo de compreensão e afabilidade aquele que a penetra. Jamais a apliques com dureza, qual se fosse uma arma para destruir os outros, pois que, assim tornada, perde a finalidade precípua que é a de libertar.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXL - Não te canses de amar. É possível que a resposta do amor não te chegue imediatamente. Talvez te causem surpresa as reações que propicia. É possível que as haja desencorajadoras. Sucede que, desacostumadas aos sentimentos puros, as pessoas reagem por mecanismos de autodefesa. Insistindo, porém, conseguirás demonstrar a excelência desse sentimento sem limite e mimetizarás aqueles a quem amas, recebendo de volta a bênção de que se reveste. Ama, portanto, sempre.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXLI - Dosa com cuidado as tuas emoções. Uma atitude afetada é sempre desagradável, tanto quanto o retraimento injustificável é responsável por muitas dificuldades no relacionamento social. A afetação é distúrbio de conduta, e o retraimento é sintoma de insegurança. Auto-analisa-te com carinho e sinceridade, buscando superar as ansiedades e os temores que respondem pelo teu comportamento. Atitudes tranquilas são resultado de realização íntima, que somente conseguirás mediante exercícios de prece, paciência e meditação. Assim, o controle das tuas emoções se fará possível.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXLII - As tuas necessidades reais não exorbitam a área das tuas posses. Cada criatura nasce ou renasce dentro do esquema que lhe faculta as melhores possibilidades para ser feliz. A inconformação e a rebeldia, porém, normalmente armam o indivíduo com ambição e violência que geram estados desditosos, mesmo quando ele consegue acumular excessos e quinquilharias a que atribui valores relevantes, exagerados. Nunca faltariam os recursos para a sobrevivência humana, caso não houvesse nos corações o predomínio do egoísmo, da avareza e do desinteresse fraternal.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXLIII - Sê amigo da verdade, sem a transformares numa arma de destruição ou de ofensa. Não é tanto o que se diz, que oferece resultados positivos ou desagradáveis, mas, a forma como se diz. Ademais, a tua pode não ser a verdade real, senão, um reflexo dela. E mesmo que o fosse, não estás autorizado a esgrimi-la com finalidades perturbadoras. Antes de assumires a postura de quem corrige e ensina com a verdade, coloca-te no lugar do outro, aquele a quem te irás dirigir, e a consciência te apontará o rumo a seguir e a melhor maneira de te expressares.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXLIV - Guia-te sempre pela decisão que produza menor soma de prejuízos a ti mesmo e ao teu próximo. Antes de assumires compromissos, reflexiona a respeito dos possíveis resultados, e mais facilmente saberás eleger aqueles que te proporcionarão melhores frutos para o futuro. Sempre que algumas vantagens para ti ofereçam danos para outrem, recusa-as, porquanto ninguém poderá ser feliz erguendo a sua alegria sobre o infortúnio do seu próximo. Isto equivale a dizer: \"Não faças ao outro aquilo que não gostarias que ele te fizesse.\" O que hoje percas a favor de alguém, amanhã receberás sem prejuízo de ninguém.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXLV - Não és um observador distante da vida. Estás na condição de membro do organismo universal, investido de tarefas e responsabilidades, de cujo desempenho, por ti, resultarão a ordem e o sucesso de muitas coisas. A postura de quem observa de fora produz enfoques e conclusões equivocados. No entanto, a participação consciente dá medida correta e propicia melhor compreensão dos dados ao alcance. Considera-te pessoa valiosa no conjunto da Criação, tornando-te, cada dia, mais atuante na Obra do Pai e fazendo-a melhor conhecida e mais considerada Tu és herdeiro de Deus, e o Universo, de alguma forma, te pertence.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXLVI - A irritabilidade é espinho cravado nas carnes da emoção, que deve ser extirpado. Quanto mais permanece, piora o estado de quem o conduz, gerando infecções duradouras quão perniciosas. A pessoa irritável não necessita de motivos para o mau humor, a insatisfação. Gera-os com facilidade, por conduzir-lhes os germes nos sentimentos agressivos e amargurados. Faz-se intratável e exala o morbo que lhe caracteriza a conduta. Agrada-se, quando desagrada; alegra-se, quando se desforça em quem defronta, mesmo que este nada lhe tenha feito de mal. É sempre infeliz por prazer. Vence a irritação, ou, do contrário, serás por ela destruído.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXLVII - Se algum projeto que elaboraste redundou em fracasso, não te aborreças, nem o abandones por isso. O aparente fracasso é a forma pela qual a Divindade te ensina a corrigir a maneira de atuar, facultando-te repetir a experiência com mais sabedoria. Quem se recusa a reencetar o trabalho, porque foi mal sucedido antes, não merece desfrutar o êxito dos resultados. A arte de recomeçar é medida de engrandecimento para quem aspira mais altos cometimentos. Ninguém logra respostas felizes, sem as tentativas do insucesso. A vida é constituída de lições que se repetem até fixarem-se corretamente.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXLVIII - Todos sofrem, enquanto estão no mundo. A dor é um método eficiente para a renovação, quando falecem os benefícios do amor não vivido. Diante desta fatalidade inevitável, que o Espírito enfrenta nos mais variados matizes, cumpre-lhe recebê-la com dignidade e confiança. O que hoje se apresenta atormentante, ameaçador, amanhã se converte em paz. A doença física ou mental, a aflição econômica ou moral, passam, deixando os resultados conforme o grau de elevação pessoal através do qual foram recebidas. Não te consideres, pois, infeliz, quando sofrendo. Retira os benefícios da injunção expungitiva e segue adiante, encorajado.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXLIX - Deus conhece o teu destino e comanda a tua vida. O que te ocorre, mereces, a fim de conquistares novas marcas na escala da evolução. Deus é Pai Misericordioso e vela por ti. Jamais te consideres desprezado, resvalando pela rebeldia e blasfêmia. O homem deve treinar coragem e resignação, sem cujos valores permanece criança espiritual. Deus não tem preferências e nos ama a todos. Deixa-te conduzir pelas ocorrências que não podes mudar, e altera com amor aquelas que te irão beneficiar. Desesperar-te? Nunca!", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CL - Porque as pessoas se te apresentem más e egoístas, ou porque te aflijam e desconsiderem, não planejes o revide. Há quem ainda se compraz no mal, quem perturba e se ufana disso. São seres mal saídos do primarismo, adquirindo a luz da razão e a sensibilidade da emoção. Não é justo que desças e a elas te niveles, sofrendo mais, quando podes ascender e elevá-las, alterando a paisagem moral do mundo para melhor. Seja tua a ação de engrandecimento e compreensão das falhas e limites do teu próximo. Jamais te arrependerás, agindo assim.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLI - Cuidado com as fantasias morais negativas que afetam as áreas do sexo, e da emoção que se perverte! Elas se enraízam nas telas mentais, e criam dependências aflitivas que se convertem em tormentos e desequilíbrios. O que cultives pela imaginação pode tornar-se anjo de auxílio, se nobre, ou fantasma, quando vulgar. Há condutas morais graves no campo físico, sob o açodar de paixões mentais alucinantes. Pensa e age com harmonia. Cultiva as idéias edificantes e te sentirás ditoso.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLII - Acalma as ânsias do teu coração. O que ainda não alcançaste, está a caminho. Não sofras de véspera, entregando-te a estados deprimentes, por ausências que certamente não fazem falta. A carência pode proporcionar recurso de valorização das pessoas e coisas. Quem desfruta de benefícios, com facilidade subestima o que possui. Aprende a conviver com a escassez, a solidão, e saberás evitar a embriaguez dos sentidos, a volúpia da luxúria, a exacerbação da posse. És o que tu realizas e não o que tens ou com quem te encontras.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLIII - Reserva-te o direito de permanecer indiferente às provocações de qualquer natureza. Numa época de insensatez como esta, o mal anda em liberdade, seduzindo os incautos. Aqui, é a ira dos outros que te agride. Ali, está o sexo sem freio que te sensibiliza. Acolá, eis a ambição que te desperta o interesse. Próximo se encontra o vício, enredando vítimas. Em torno de ti, a diversão perturbadora campeia. Por toda parte, a vitória do crime e da dissolução dos costumes multiplica os seus tentáculos qual polvo cruel e dominador. Olha essas facilidades como sendo a estrada de espinhos venenosos que a grama verde e agradável esconde no chão, e não te permitas pôr-lhe os pés, evitando-te os acidentes de efeitos danosos.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLIV - Quando assumas resoluções superiores e te poupes a loucura do desequilíbrio, serás visitado por pessoas que te buscarão convencer de que estás equivocado. Insiste nos teus propósitos sadios e não lhes dês ouvidos. Ao tombares, são poucas as mãos que tentarão erguer-te. Nunca falta quem empurre, mais, o caído no fosso do desespero. Infelizmente, são ainda escassos os indivíduos que estão dispostos a ajudar desinteressadamente, enquanto se multiplica o número daqueles que se comprazem infelicitando. Segue adiante no bem e o Bem te fará um grande bem.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLV - Aprende com as lições da vida, mas, principalmente, com as tuas próprias experiências, confiando menos nos cantos de sereias, que seduzem arrastando para os abismos. Se o ébrio deseja liberar-se do alcoolismo, encontra com mais facilidade quem lhe sirva um novo trago, ao invés de quem lhe dê um pão. Se o fumante quer abandonar o tabagismo, a ironia dos amigos tenta ridicuiarizá-lo,insistindo com ele para que continue envenenando-se. Se o toxicômano faz esforço para deixar a droga, o traficante ameaça-o e chantageia-o. Se o delinquente de qualquer matiz intenta a reabilitação, enxameiam ao seu lado os que conspiram contra o seu esforço. Tem, pois, cuidado, e mantémte sadio, física e moralmente.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLVI - Acostuma-te à verdade. O hábito da mentira branca também chamada inocente ou social, levar-te-á às graves, empurrando-te para o lodaçal da calúnia e da maledicência frequente. A fagulha produz incêndios semelhantes aos gerados pela labareda crepitante... Os grandes crimes se originam em pequenos delitos, não alcançados pela Justiça, que e sejam o agravamento do mal. Usa de severidade moral para contigo, não embarcando nas canoas das conveniências gerais. Cada pessoa responde por si mesma, e os seus atos ficam gravados na consciência individual. Sê tu mesmo, em constante progresso moral.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLVII - Sempre que possível, luariza-te com a oração. Faze espaços mentais e busca as Fontes da Vida, onde haurirás energias puras e paz. Todos os santos e místicos que alteraram o rumo moral da Humanidade para melhor, no Oriente como no Ocidente, são unânimes em aconselhar a prece como o recurso mais eficaz para preservarse ou conquistar-se a harmonia íntima. Jesus mantinha a convivência amiga com os discípulos e o povo, no entanto, reservava momentos para conversar com Deus através da oração, exaltando a excelência desses colóquios sublimes. Sai, portanto, do turbilhão em que te encontras mergulhado e segue no rumo do oásis da prece para te refazeres e te banhares de paz.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLVIII - Os negócios escusos dão rendimentos venenosos. Muitas pessoas justificam-nos e exaltam os lucros deles advindos, informando que são frutos da época e todos devem aproveitar a ocasião. Como a moral está desgovernada, não te deixes conduzir por ela, antes controla os abusos e excessos que te cheguem, a fim de corrigires a situação caótica. O erro nunca deve ser tomado como exemplo. Numa época de epidemia gripal, o estado normal de saúde não passa a ser este, somente porque a maioria das pessoas está infectada. Vacina-te contra os abusos e permanecerás com a vida em ordem, talvez sem os supérfluos, nunca, porém, com escassez ou falta.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLIX - Quando o homem se resolve por modificar a conduta moral para melhor, parece defrontar uma conspiração geral contra os seus propósitos de enobrecimento. Tudo se altera e desgoverna. As mínimas coisas fazem-se complicadas, e o ritmo dos acontecimentos, por algum tempo, muda para pior. Esse estado de coisas leva o canditado à reforma íntima a retroceder, a desistir. É natural, porém, que assim aconteça. Toda transferência modifica o habitual. Na área das ações morais a reação é maior, porquanto se penetra nas raízes do mal para extirpálo, a fim de dar surgimento a novos e equilibrados costumes. Não abandones, desse modo, os teus intentos de moralidade e crescimento interior, em razão das primeiras dificuldades a enfrentar.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLX - Num dia extenso com 24 horas, reserva alguns momentos à reflexão. Quem caminha sem meditar, perde o contato consigo mesmo. Encurralado nos ponteiros do relógio, ou disparado à frente deles, ou vagarosamente após eles, aturde-se, esquecendo o rumo... É indispensável ao êxito fazer periódica revisão de metas e de ações. Usando a reflexão, repassarás os equívocos e terás tempo de repará-los, reprogramarás os deveres e te renovarás com mais facilidade. Fala menos, dorme um pouco menos e medita mais. Minutos que desperdiças, se os usares para a meditação, se transformarão em pontos luminosos do teu dia.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXI - Todos estamos fadados à felicidade, à perfeição. O caminho a percorrer é longo, às vezes assinalado pela urze ou entulhado pelos calhaus. Todavia, o roteiro é igual para todos, porque ninguém existe que seja considerado como exceção. Aqueles que encontram menos dificuldades, fazem jus às circunstâncias, em razão do seu comportamento em reencarnações passadas. Os mais atribulados, da mesma forma, procedem dos seus atos infelizes. Desse modo, ganha a distância evolutiva, passo a passo, e alegrate com o destino feliz que te aguarda e que alcançarás.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXII - Acautela-te dos amigos frios, de coração enregelado. Há homens que mataram as emoções e deixam-se vegetar em relação ao bem, exalando miasmas que contaminam, portadores do pessimismo malfazejo que termina por infelicitar quem deles se acerca. Dilata o círculo das tuas afeições, no entanto, cuida-te quanto às influências de tal natureza, que terminam por perturbar, levando ao desencanto. Esses indivíduos amargos perambulam sem norte, e, tudo quanto vêem, sombreiam com a sua óptica escura. Deixa que brilhe o sol em ti.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXIII - Incessantemente, busca a tua identidade real, isto é, descobrete para o bem de ti mesmo. Constatarás que não és melhor nem pior do que os outros, mas, sim, o que te faças, isto contará. Com esta conscientização, perceberás que não tens direito a privilégios nem sofres abandono da Divindade. Tudo quanto te ocorra, transforma em lição proveitosa para o teu crescimento espiritual, pois que para tal estás na Terra. Amealha todas as conquistas e converte-as em lições de sabedoria, com que te enriquecerás de bênçãos.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXIV - Há muita gente preocupada com o mal que os outros lhes possam fazer. Transferem para o próximo a responsabilidade dos seus insucessos e vivem descobrindo inimigos em toda parte, fugindo a uma auto-análise de indispensável lucidez. Deambulam por caminhos de maldades e acusações. Com tal conduta, ferem, prejudicam, perturbam os outros e não se dão conta do mal a que se entregam e movimentam, desassisados. O mal que reside em cada indivíduo, este sim, torna-o um homem mau# que, assim, se torna um elemento pernicioso no contexto social.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXV - Irriga o teu organismo com pensamentos saudáveis. A ação da mente sobre a emoção, o corpo e toda a aparelhagem fisiológica é incontestável. Grande número de enfermidades se deve à ociosidade mental, ao desânimo, à revolta, às idéias autodestrutivas. Canaliza o teu modo de pensar para as questões agradáveis, salutares, otimistas, e viverás sob o seu reflexo, desfrutando do bemestar que se irradiará a outros mimetizando e produzindo paz.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXVI - A tua importância está na razão direta do que faças a benefício próprio. Contigo ou sem ti, a vida prossegue, o mundo continuará a sua marcha. Não te creias detentor de recursos excepcionais, sem cuja presença os seres depereceriam e a Humanidade sofreria decadência. Tuas conquistas e perdas fazem a contabilidade dos teus valores reais. Sê simples e torna-te humilde qual lâmpada diante do Sol e este em confronto com uma galáxia...", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXVII - A grandeza de um homem pode ser medida pela sua capacidade de serviço ao próximo, de humildade e de amor. Os homens grandes chamam a atenção e projetam sombra, mas, os grandes homens, onde quer que se encontrem tornam-se claridade inapagável, apontando rumos libertadores. Os verdadeiros heróis se ignoram, preocupados que vivem em ajudar mais do que fazer a propaganda dos próprios atos. Torna-te um deles, no silêncio das tuas realizações e na grandeza da tua pequenez.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXVIII - Sorrateiramente, a intriga se insinua no teu coração, cerrando a porta dos teus sentimentos à serenidade. Torna-te frio e calculista, impiedoso e armado contra o outro, que talvez não mereça esta reação de tua parte. O intrigante sempre encontra uma forma de envenenar-te. Conhecendo o teu temperamento, infiltra-se com suavidade e te alcança, alanceando-te com a informação infame. Reage à intriga e educa o intrigante, a fim de que ele te deixe em paz e passe a ter paz, ao mudar de atitude mental e moral.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXIX - Vez que outra acompanha um féretro, a fim de aprofundares reflexão no fenômeno biológico da vida e no da morte. Diante da ocorrência com os outros, poderás despertar para o que te irá suceder, inevitavelmente. A eternidade é do Espírito, enquanto a experiência do corpo é transitória e breve. Por este momento tens a sensação de que tudo está bem e será duradouro. Até quando, porém? E qual a garantia que tens, a respeito do prazo que te está concedido? Assim, vive bem; entretanto, não descartes a possibilidade do teu retorno, o que, aliás, é o mais seguro de todos os acontecimentos.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXX - Age com calma em todas as circunstâncias. Há muita gente que está vivendo em clima de desespero e pressa exaurinte. Atropela e deixa-se atropelar, numa volúpia de alucinação, sem que frua o resultado do que conquista, nem se compraza com aquilo que já amealhou. A serenidade é irmã da ventura, por propiciar o prazer que abençoa, que transmite satisfação. Rearmoniza-te, conduzindo o carro das tuas horas com tranquilidade e vivendo com a serena alegria de estar na Terra e poder avançar para Deus, a nossa meta final.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXI - Controla a vontade, gerando um clima de disciplina para os teus hábitos e evitarás o desregramento, os conflitos comportamentais, os desajustes. Quem não acredita em disciplina, pode ser* comparado a uma pessoa que dirige um veículo sem freio, numa descida... Candidatase ao desastre. O que vitalizas pelo pensamento, converte-se em realidade no mundo das formas. Sabendo discernir e lutar pelo que te convém e te será melhor, aprenderás a conduzir-te com o equilíbrio que te poupará inúmeros dissabores. A vontade bem canalizada consegue realizações gigantescas. Conduze-a, pois, com sabedoria e nunca te arrependerás.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXII - A conquista do conhecimento é um logro pessoal, intransferível. Esse tesouro sempre se multiplica, quando é repartido, e ninguém pode usurpá-lo de quem o possui. Nem a morte o arrebata, porquanto continua com o Espírito que o detém, constituindo-lhe um tesouro de valor constante e fácil manejo. Luta por adquiri-lo, jamais considerando ser tarde demais para este empreendimento, aumentando-o, seja o possuis ou iniciando-o, caso ainda não tenhas experimentado o prazer que dele se exterioriza. O homem que sabe, conduz-se com mais segurança, poupandose a incontáveis sofrimentos. Por outro lado, a ignorância é a responsável por males sem conta.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXIII - Usa a cortesia nos teus movimentos e ações, gerando simpatia e amizade. O que possas fazer, não delegues a outrem. Porque alguém trabalha contigo, não te cabe o direito de sobrecarregá-lo, exigindo-lhe além das suas possibilidades. Mesmo os teus serviçais merecem a tua consideração e respeito. Cooperam contigo e são remunerados. Faze mais: torna-os teus amigos. Há pequenas e cansativas tarefas a eles afetas que podes executar sem te cansares nem os mortificar. No trato com eles, usa as expressões: \"Por favor\" e \"muito obrigado\", desse modo, educando-os mais e espalhando afeição em torno dos teus passos.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXIV - A verdadeira coragem é demonstrada pela maneira como se enfrenta a batalha da vida, no seu dia-a-dia. Convém não confundir a coragem com a temeridade. Aquela é calma e constante, lúcida e criativa, enquanto a outra se apresenta desesperada, agressiva, irritada. A coragem nasce na fé que sabe o que deseja e se empenha para consegui-lo. Enfrenta os obstáculos sem enfraquecer-se e resiste ao tempo sem perder o valor. Raciocina antes de agir e permanece iluminada pelo ideal, enquanto se mantém no campo das lutas. Demonstra a tua coragem, agindo sempre com acerto e equilíbrio.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXV - Silencia o que ouves. Muitas aflições seriam poupadas às criaturas, se se soubesse ouvir e reflexionar. Infelizmente, muitas pessoas se apressam a passar adiante o que ouvem, alterando-lhe o conteúdo e salientando os pontos delicados ou negativos. As mensagens truncadas, os assuntos adulterados possuem o condão miraculoso de perturbar, gerando conflitos e situações insustentáveis. Não transmitas informações malsãs. Escuta com calma, sem apressar conclusão. Se pretendes comentar a respeito, tem o cuidado de fazê-lo, colocando a situação como se fosse a tua e apresentando-a com benignidade.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXVI - Mantém-te apresentável, de forma simples e higiênica. Confunde-se muito humildade com imundície, dando-se margem a descuidos lamentáveis. Da mesma forma se pensa, erradamente, que boa apresentação pessoal é requinte ou moda afetada. \"As vestes de Jesus resplandeciam\" — narram as Escrituras, demonstrando a pureza dEle e o Seu poder, refletidos no traje modesto que usava. Nunca enfermou e jamais se apresentou de forma desagradável ou que surpreendesse pelo exotismo. À semelhança dos amigos, vestia-se com a indumentária da época, porém, emprestava-lhe a Sua irradiação superior. O teu magnetismo se exteriorizará, acentuando ou diminuindo a tua aparência, que te merece o zelo competente.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXVII - Deixa o outro terminar o assunto, sem interrupção. Certamente, há um limite para deixá-lo falar. Não obstante, ouvindo-o, e equiparás mais de argumentos para esclarecê-lo. Se o interrompes, talvez concluas equivocadamente o tema e não consigas entender o que ele te desejou dizer. Nem todos explicam o que pensam com facilidade, complicandose, às vezes, ou falando de maneira nebulosa. Busca penetrar na idéia e dialoga, sem enfado nem exasperação. Não imponhas os teus pensamentos, nem tentes impedir a apresentação de outras idéias que não as tuas.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXVIII - Controla a tua ansiedade. A ansiedade mal dirigida produz danos orgânicos de variada classe e gera mal-estar onde se apresenta. Irradia uma onda inquietante e espalha insegurança em volta. A pessoa ansiosa requer mais atenção, que nem sempre se lhe pode dispensar; está sempre queixosa e acarreta problemas para as demais. Vê o que ainda não está ocorrendo e precipita-se a situações indesejáveis, para arrepender-se depois. A calma é o abençoado antídoto da ansiedade, que advém quando desejas esforçar-te para viver em paz e confiança em Deus.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXIX - A cobiça dos bens alheios é um mal que se generaliza. Lentamente, as pessoas se apresentam insatisfeitas, cobiçando os pertences que não possuem e de que não têm real necessidade. Se cada um bastar-se com os recursos de que dispõe, a vida se tornaria mais rica de beleza e de experiências. Há uma falsa proposta de felicidade muito propalada nestes dias, que chamaremos a posse mesmista. Todo mundo deseja as mesmas coisas que o próximo possui, e a imitação das fantasias e quimeras produzidas pela imaginação passou a ser meta a alcançar-se. Quem não consegue o mesmismo, considera-se rejeitado, infeliz. Não cobices nada de ninguém. Realiza-te em ti mesmo e frui de paz.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXX - Irradia a claridade da tua fé, através do teu sorriso, das tuas palavras, da tua atitude perante a vida. O mundo necessita de luz para superar as sombras dominantes. Distende a tua presença confiante e rica de luminosidade, auxiliando os tímidos e os desanimados, os que caíram e os revoltados. A luz atrai sempre, enriquecendo de beleza. Não deixes que se apague essa estrela, porque haja fatores dissolventes e agressões em volta. Deixa-a brilhar, apontando rumos ditosos para os que anelam por uma oportunidade de realização.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXXI - A máxima lição da vida é o amor. Sem ele os objetivos a alcançar perdem a finalidade, deixando a criatura à mercê das suas paixões inferiores. O amor dilui as sombras dos sentimentos negativos, imprimindo o selo da mansidão em todos os atos. Ama, portanto, tudo e todos. Exercita-te no amor à Natureza, que esplende em Sol, ar, água, árvore, flores, frutos, animais e homens. Deixa-te enternecer pelos convites silenciosos que o Pai Criador te faz e espraia as tuas emoções por sobre todas as coisas, dulcificando-te interiormente. Quanto mais ames, menos serás atingido pelas farpas do mal, pois que a tua compreensão dilatada abrirá os espaços à vida, colhendo somente os efeitos da paz.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXXII - Há uma permanente luta íntima, quando o homem se resolve por abraçar a vida nobre. Quais dois exércitos em fúria, no campo mental, surgem constantes confrontos. Os guerreiros habituais — o egoísmo, o orgulho, a violência, a ambição — tentam superar os novos combatentes — o amor ao próximo, a humildade, a pacificação, a renúncia. O indivíduo sente-se dividido e angustiado. Nesse terreno áspero brilha, porém, a luz da inspiração superior que lhe aclara a alma e a estimula a insistir nos propósitos elevados. Investe na batalha da vida os teus esforços nobres e não desistas. Cada dia de resistência representa uma vitória até o momento da glória total.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXXIII - Desculpa, sinceramente, a ignorância dominante. Não esperes justificação do outro, o teu ofensor. Supera os ingredientes indigestos da agressão dele e mantémte bem, buscando esquecer de fato a ocorrência má. Quem guarda mágoas intoxicase com os miasmas que elas exalam. O agressor está muito desequilibrado e necessita da medicação da bondade para recuperar-se. Perdeu a lucidez, e por isto agride. Concede-lhe a oportunidade que ele não te dá. É sempre mais confortável a posição de quem é generoso. Melhor que sejas tu o doador, significando que já conseguiste o que ao teu próximo falta.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXXIV - No teu local de trabalho descobrirás, talvez, conspiradores da tua paz. O mundo é uma arena ampliada, e as pessoas desprevenidas, ao invés de se amarem umas às outras, armam-se umas contra as outras. Em algumas circunstâncias tornam-se feras inconscientes que apenas reagem, sempre assumindo posturas inadequadas à sua situação de humanidade, buscando tomar o lugar dos outros, derrubar, ver sofrer... Evita essa competição criminosa, essa disputa desequilibradora, atuando com retidão e consciência. A tua parte ninguém tomará, nem o teu mérito calúnia alguma ofuscará. Age, pois, com correção e fica tranquilo.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXXV - Mais dia, menos dia, o sofrimento chegará ao teu coração, pois que ele faz parte dos fenômenos da vida em progresso. Sem a sua presença a soberba, o despotismo, a agressividade se fazem insuportáveis. Porque o homem ainda não entende a voz suave do amor, defronta a aflição que lhe lima as arestas e o persuade à reflexão, ao bem. Às vezes, o indivíduo reage, blasfema, esperneia e termina por ceder, única maneira de liberar-se. Desta forma, não te rebeles ante a dor, piorando a tua situação e desgastando-te inutilmente. A aceitação dinâmica, isto é, a transformação do sofrimento em experiência, realiza o milagre do êxito.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXXVI - O lar é o templo da família. Os filhos são empréstimos divinos para a construção do futuro ditoso. Todo o tempo possível deve ser aplicado na convivência familiar, através dos diálogos, dos exemplos, tomando-se o método mais eficaz de educação. Os hábitos adquiridos no lar permanecem por toda a existência e se transferem para além do corpo. Educar é viver com dignidade, deixando que se impregnem dos conteúdos, com vigor, aqueles que participam da convivência doméstica. Tudo quanto invistas no lar, retornará conforme a aplicação feita. Faze do teu lar a oficina onde a felicidade habita.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXXVII - Nestes dias agitados a angústia caminha com o homem, disfarçada de medo, de ansiedade, de sentimento de culpa. Naturalmente, as pressões a que a pessoa está sujeita respondem por tal situação. A ansiedade pelo prazer exorbitante frustra; os fatores agressivos amedrontam, e a timidez encontra uma forma de levar ao complexo de autopunição. Afasta da mente esses fantasmas responsáveis por males inumeráveis. És filho de Deus, por Ele amado, que te protege e abençoa. Não te afastes das Suas Leis e se te enganares, ao invés de te entregares a conflitos desnecessários, retorna ao caminho do dever, sem receio algum.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXXVIII - Nunca te omitas ante a tarefa de auxiliar. Não somente com o dinheiro, a posição social relevante, o poder se dispõe de recursos para ajudar. A palavra gentil é geradora de estímulos e valores que logram resultados preciosos. O verbo tem erguido civilizações, como levado multidões à guerra, à destruição. Usa a palavra para socorrer, emulando as pessoas caídas a levantar-se, os que dormem a despertar, os errados a corrigir-se, os agressivos a acalmar-se. Fala com elevação e bondade, tornando-te microfone fiel a serviço do bem.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CLXXXIX - A tua vida não termina no túmulo. Com esta consciência aprende para a eternidade, reunindo valores que jamais se consumam. Toda lição que liberta do mal se incorpora à alma, como força de vida indestrutível. Fosse a morte o fim da vida, e sem sentido seria o Universo. A criação se esmaeceria e o ser pensante estaria destituído de finalidade. Tudo, porém, conclama o ser à glória eterna, à continuidade do existir, ao progresso incessante. Estuda e trabalha sem cessar, com os olhos postos no teu futuro espiritual, vivendo alegre, hoje e pleno, sempre.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXC - Os problemas são desafios para o homem. Toda pessoa que pensa, enfrenta problemas, porquanto a vida no corpo transcorre sob a ação de variadas situações difíceis. Aprende a conviver com eles, tentando resolvê-los, quanto possível, sozinho. Se não o conseguires, busca a experiência de outrem e luta até solucioná-los no momento próprio. Não os transfiras para os outros, que também os têm, embora não o demonstrem. É desrespeito sobrecarregar o próximo com os nossos problemas, sem considerar as aflições que, certamente, lhe pesam sobre a existência. Um problema hoje solucionado é lição para os que estão por vir. Aprende a resolvê-los, para viver em paz.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXCI - A tua vida possui um alto significado. Descobrir o sentido da existência e para que te encontras aqui, eis a tua tarefa principal. Muitos indivíduos, por ignorância, colocam os objetivos que devem alcançar nas questões materiais e, ao consegui-los, ficam entediados, sofrendo frustrações e tão infelizes quanto aqueles que nada lograram. Se observas a questão espiri tual da vida, a necessidade de te iluminares com o pensamento divino, toda a tua marcha se realizará segura e frutuosa. Ninguém pode sentir-se completado, se não estiver em constante ligação com Deus, a Fonte Geradora do Bem. Pensa nisso e segue o rumo da vida permanente.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXCII - Generaliza-se a idéia falsa de que o homem honesto e trabalhador é um idiota. Assim afirmam diante da prosperidade material da injustiça e do furto, da ignomínia e do suborno, que assumem proporções devastadoras no organismo social. Não têm, porém, razão aqueles que assim pensam e agem, porquanto, a abundância material sem a dignidade perverte os costumes, desorganiza o homem e envilece a alma. Só a honra prevalece, e o bem subsiste a tudo. Continua sábio, agindo com elevação.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXCIII - Em toda parte a astúcia, a violência e o crime se apresentam vitoriosos. Estes são dias de insensatez e cálculo para o mal. Certamente há uma avalanche de loucura ameaçadora. Jamais, houve, no entanto, na Terra, tanto amor e tanta bondade! Veicula-se mais a calamidade do que a renúncia, o escândalo do que o bom-senso. Todavia, há inumeráveis pessoas que acreditam e trabalham pelo seu próximo, promovendo a Era da felicidade. Une-te a estes heróis anónimos do bem e projeta o homem, ajudando-o a ser livre e ditoso.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXCIV - Apregoa as vantagens de uma vida sadia, estimulando os companheiros a experimentá-la. Divulgam-se com entusiasmo as excelências dos prazeres estonteantes, dos gozos desgastantes, dos excessos aniquiladores. Não se comentam, todavia, com o mesmo ardor, a decadência dos ases e campeões do sexo desalinhando, a alucinação dos que viveram as experiências embriagadoras... Os vitoriosos, considerados manchetes de jornais e revistas, sucessos de rádio e televisão de ontem, hoje estão no ostracismo e na queda, esquecidos e desprezados, substituídos por novos joguetes do mercado da loucura. Vive com saúde moral e demonstra aos outros quanto isto é bom.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXCV - Quem aspira por um futuro melhor para a Humanidade, deve contribuir para a educação e a vida infantil. O que se aplique na criança, será devolvido com juros. O investimento de amor retornará em forma de bênçãos salvadoras e o de abandono volverá como delinquência e desgraça. Se te faltam recursos mais específicos para auxiliar a criança, oferece-lhe palavras lúcidas, que não corrompem, e exemplos que as estimulem a ser verdadeiros cidadãos mais tarde. Constrói hoje os teus dias de amanhã.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXCVI - Quando estiveres a ponto de desistir de uma ação edificante, ora e continua até o fim. Quando te encontrares no momento de cometer um erro, ora e desiste com tranquilidade. Quando perceberes que as forças não te auxiliarão no trabalho do bem, ora e reanima-te, chegando ao termo planejado. Quando fores aliciado para uma situação vexatória, ora e retoma o teu equilíbrio. Quando te sentires abandonado pela pessoa em quem confias ou a quem amas, ora e tem paciência, permanecendo no teu posto. Quando, desarvorado, desejes tombar, sem mais estímulo, ora e te serão concedidas as resistências para o triunfo. Não deixes nunca de orar.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXCVII - Reserva momentos para que se refaçam os teus equipamentos mentais. Da mesma forma que o corpo se desgasta, a mente se cansa e desarmoniza. A mudança de atividade, o espairecimento, os jogos que distraem, os desportos, a meditação, funcionam como recursos valiosos para o reajuste mental. Dedica algum tempo à tua renovação interior, examinando o que fazes e como torná-lo mais agradável, ensejando-te equilíbrio e menos fadiga. A mente é espelho que reflete o estado do espírito, merecendo carinho e desvelo, a fim de funcionar bem e com êxito.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXCVIII - Em qualquer atividade que exerças, considera-te servidor de Deus. Por mais humilde seja a tua profissão, ela é por demais valiosa no conjunto social em que te encontras. Cumpre com os teus deveres com alegria, e consciente do seu significado, do valor que eles têm e de quanto são importantes para a comunidade. Ilhas imensas surgem nos mares, construídas por humildes ostras. Desertos colossais resultam de pequenos grãos de areia que se acumulam. Oceanos volumosos são nada mais do que gotinhas de água. A tua parcela no mundo é de grande relevância. Portanto, trabalha com disposição e nobreza.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CXCIX - Nunca te apóies no pessimismo para deixar de lutar. O que os outros conseguem através do trabalho, obterás também, se tiveres paciência e perseverança. Não pretendas iniciar a vida por onde outros a estão concluindo. O êxito depende de muitas tentativas que não deram certo. O fracasso sempre ensina o modo como não se devem fazer as coisas. Insiste no teu serviço com otimismo e avança com vagar na direção da tua vitória. Cada dia vencido são vinte e quatro horas que ganhaste.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
      { id: _uid(), texto: "Mensagem: CC - Agradece a Deus a tua existência. Louva-O através de uma vivência sadia. Exalta-lhe o amor por meio dos deveres retamente cumpridos. Dignifica-O, sendo-Lhe um servidor devotado e fiel. Apresenta-O à humanidade, tornando-te exemplo de amigo e irmão em todas as circunstâncias. Glorifica-O, trabalhando pelo bem de todos, teus irmãos em humanidade. Respeita-O, obedecendo às Soberanas Leis que governam a vida. Reconhece-O em tudo e todos, mediante uma vida feliz, na tua condição de filho bem amado.", autor: "Joanna de Ângelis (Espírito), Divaldo Pereira Franco (Psicografado por)", categoria: "Vida Feliz", ativo: true },
    ];
    const frasesKey = `pcf_frases_${userId}`;
    _seedIfEmpty(frasesKey, frases);
    const frasesAtuais = _get(frasesKey) || [];
    if (!frasesAtuais.some(f => f.categoria === 'Vida Feliz')) {
      _set(frasesKey, [...frasesAtuais, ...frases.filter(f => f.categoria === 'Vida Feliz')]);
    }

    // Roda da Vida config padrão
    const rodaVidaConfig = [
      {
        id: 'pessoal', label: 'Pessoal', cor: '#22c55e',
        categorias: [
          { id: 'saude',       label: 'Saúde – Disposição e Bem-estar',    labelCurto: 'Saúde',       icon: '❤️',  cor: '#4ade80', integracaoFonte: 'imc'           },
          { id: 'intelecto',   label: 'Intelecto – Conhecimento',           labelCurto: 'Intelecto',   icon: '🧠',  cor: '#22c55e', integracaoFonte: 'habitos_mente' },
          { id: 'emocoes_rv',  label: 'Emoções – Equilíbrio Emocional',     labelCurto: 'Emoções',     icon: '😊',  cor: '#166534', integracaoFonte: 'emocoes'       },
        ],
      },
      {
        id: 'profissional', label: 'Profissional', cor: '#f97316',
        categorias: [
          { id: 'carreira',     label: 'Carreira – Realização e Propósito', labelCurto: 'Carreira',    icon: '💼',  cor: '#0d9488', integracaoFonte: ''              },
          { id: 'contribuicao', label: 'Contribuição Social',                labelCurto: 'Contribuição',icon: '🤝', cor: '#f472b6', integracaoFonte: ''              },
          { id: 'financas_rv',  label: 'Finanças – Recursos Financeiros',   labelCurto: 'Finanças',    icon: '💰',  cor: '#f97316', integracaoFonte: 'financas'      },
        ],
      },
      {
        id: 'relacionamentos', label: 'Relacionamentos', cor: '#3b82f6',
        categorias: [
          { id: 'familia',  label: 'Amizade e Família',       labelCurto: 'Família', icon: '👨‍👩‍👧', cor: '#1e40af', integracaoFonte: '' },
          { id: 'afeicao',  label: 'Afeição e Amor',          labelCurto: 'Amor',    icon: '💕',  cor: '#db2777', integracaoFonte: '' },
          { id: 'social',   label: 'Vida Social',             labelCurto: 'Social',  icon: '🎉',  cor: '#3b82f6', integracaoFonte: '' },
        ],
      },
      {
        id: 'qualidade', label: 'Qualidade de Vida', cor: '#a78bfa',
        categorias: [
          { id: 'lazer',           label: 'Lazer – Criatividade e Hobbies',    labelCurto: 'Lazer',     icon: '🎨', cor: '#bef264', integracaoFonte: '' },
          { id: 'plenitude',       label: 'Conquista, Plenitude e Felicidade', labelCurto: 'Plenitude', icon: '🌟', cor: '#22d3ee', integracaoFonte: '' },
          { id: 'espiritualidade', label: 'Espiritualidade',                   labelCurto: 'Espirit.',  icon: '✨', cor: '#cbd5e1', integracaoFonte: '' },
        ],
      },
    ];
    _seedIfEmpty(`pcf_rodavida_config_${userId}`, rodaVidaConfig);

    // Linha do tempo: sempre começa na data de nascimento do perfil.
    const perfil = getUserById(userId) || {};
    const nascimento = perfil.dataNascimento || '';
    const eventosBase = nascimento ? [{
      id: _uid(), dataInicio: nascimento, dataFim: '', titulo: 'Meu nascimento',
      descricao: `Início da história de vida de ${perfil.nome || 'usuário'}.`,
      categoria: 'Família', local: '', destaque: true, origem: 'cadastro'
    }] : [];
    _seedIfEmpty(`pcf_linha_tempo_${userId}`, eventosBase);
  };

  /* ---------- RESTAURAR PADRÕES (por tipo) ---------- */
  const restoreDefaultCategorias    = () => { const uid = currentUserId(); _seedDefaults(uid, [`pcf_categorias_${uid}`]); };
  const restoreDefaultEmocoesConfig = () => {
    const publicadas = _cache['pcf_emocoes_defaults'];
    if (Array.isArray(publicadas)) {
      saveEmocoesConfig(_criarEmocoesDoModelo(publicadas));
      return;
    }
    // O administrador responsável é a origem do padrão. Na ausência de um
    // modelo global, preserva e publica a configuração dele em vez de aplicar
    // o catálogo fixo antigo e apagar emoções recém-cadastradas.
    if (_currentUserControlsEmocoesDefault()) {
      _publishEmocoesDefault(getEmocoesConfig());
      return;
    }
    const uid = currentUserId();
    _seedDefaults(uid, [`pcf_emocoes_config_${uid}`]);
  };
  const restoreDefaultHabitos       = () => saveHabitos(_criarHabitosDoModelo());
  const restoreDefaultFrases        = () => { const uid = currentUserId(); _seedDefaults(uid, [`pcf_frases_${uid}`]); };
  const restoreDefaultVirtudes      = () => { const uid = currentUserId(); _seedDefaults(uid, [`pcf_virtudes_config_${uid}`]); };

  /* ---------- HÁBITOS ---------- */
  const _hkU = () => `pcf_habitos_${currentUserId()}`;
  const _nomeHabitoNormalizado = (nome) => String(nome || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const getHabitos = () => {
    const key = _hkU();
    const atuais = _get(key) || [];
    let mudou = false;
    const normalizados = atuais.map(h => {
      const padrao = HABITOS_DEFAULT.find(p =>
        p.chavePadrao === h.chavePadrao ||
        _nomeHabitoNormalizado(p.nome) === _nomeHabitoNormalizado(h.nome)
      );
      if (!padrao) return h;
      const complemento = {};
      ['chavePadrao', 'tipoExecucao', 'metaDiaria', 'duracaoMinutos'].forEach(campo => {
        if (h[campo] === undefined || h[campo] === null || h[campo] === '') {
          complemento[campo] = padrao[campo];
          mudou = true;
        }
      });
      return Object.keys(complemento).length ? { ...h, ...complemento } : h;
    });
    if (mudou) _set(key, normalizados);
    return normalizados;
  };
  const _currentUserControlsHabitosDefault = () => {
    const user = getUserById(currentUserId());
    return !!user?.isAdmin && (user.nome || '').trim() === HABITOS_DEFAULT_ADMIN;
  };

  const _publishHabitosDefault = (habitos) => {
    if (!_currentUserControlsHabitosDefault()) return;
    const modelo = habitos.map(({ id, dataCriacao, ...parametros }) => ({ ...parametros }));
    _cache['pcf_habitos_defaults'] = modelo;
    _db().collection('meta').doc(HABITOS_DEFAULT_DOC).set({
      value: modelo,
      administrador: HABITOS_DEFAULT_ADMIN,
      atualizadoEm: new Date().toISOString(),
    }).catch(err => console.warn('[PCF] Firestore hábitos padrão:', err.message));
  };

  const saveHabitos = (h) => {
    _set(_hkU(), h);
    _publishHabitosDefault(h);
  };
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
  const deleteRegistroHabito = (id) => { const all = getRegistrosHabitos().filter(r => r.id !== id); saveRegistrosHabitos(all); return all; };

  /* ---------- FRASES / MENSAGENS DO DIA ---------- */
  const _fkU = () => `pcf_frases_${currentUserId()}`;
  const getFrases = () => _get(_fkU()) || [];
  const saveFrases = (f) => _set(_fkU(), f);
  const addFrase = (f) => { const all = getFrases(); all.push({ id: _uid(), ...f }); saveFrases(all); return all; };
  const updateFrase = (id, data) => { const all = getFrases(); const i = all.findIndex(f => f.id === id); if (i >= 0) { all[i] = { ...all[i], ...data }; saveFrases(all); } return all; };
  const deleteFrase = (id) => { const all = getFrases().filter(f => f.id !== id); saveFrases(all); return all; };

  /* ---------- CONTATOS PESSOAIS ---------- */
  const _ctkU = () => `pcf_contatos_${currentUserId()}`;
  const getContatos = () => _get(_ctkU()) || [];
  const saveContatos = (c) => _set(_ctkU(), c);
  const addContato = (c) => { const all = getContatos(); all.push({ id: _uid(), dataCadastro: new Date().toISOString().split('T')[0], ...c }); saveContatos(all); return all; };
  const updateContato = (id, data) => { const all = getContatos(); const i = all.findIndex(c => c.id === id); if (i >= 0) { all[i] = { ...all[i], ...data }; saveContatos(all); } return all; };
  const deleteContato = (id) => { const all = getContatos().filter(c => c.id !== id); saveContatos(all); return all; };

  /* ---------- DIÁRIO TABS (sugestões de reflexão) ---------- */
  const _dtU = () => `pcf_diario_tabs_${currentUserId()}`;
  const DIARIO_TABS_DEFAULT = [
    { id: 'relacionamentos', icon: '👥', label: 'Relacionamentos', perguntas: [
      'Como eu tenho descrito as pessoas mais próximas no meu diário?',
      'Como tenho lidado com os conflitos nos meus relacionamentos?',
      'Como tenho demonstrado meu carinho por aqueles que são importantes para mim?',
      'Quem são as pessoas que eu mais escrevo sobre?',
    ]},
    { id: 'trabalho', icon: '💼', label: 'Trabalho / Rotina', perguntas: [
      'Como tem sido minha relação com o trabalho?',
      'O que aprendi com os desafios que enfrentei até agora?',
      'O que posso aprender com os momentos que já passei?',
      'Como foi o meu dia?',
    ]},
    { id: 'reflexao', icon: '🔮', label: 'Reflexão / Futuro', perguntas: [
      'Como posso usar o que escrevi no diário hoje para crescer no futuro?',
      'O que já me fez sentir satisfeito de mim mesmo?',
      'O que tem me feito feliz?',
    ]},
    { id: 'passado', icon: '📖', label: 'Passado', perguntas: [
      'Que memórias do passado me trazem alegria e como posso valorizá-las?',
      'Que lembrete positivo posso guardar para superar dias difíceis?',
    ]},
    { id: 'sonhos', icon: '🌟', label: 'Sonhos', perguntas: [
      'Quais são os meus sonhos e objetivos?',
      'O que posso fazer hoje para me aproximar dos meus sonhos?',
      'Que passos eu estou dando para ir em busca dos meus sonhos e aspirações?',
      'Qual pequeno passo eu posso dar hoje?',
    ]},

  ];
  const getDiarioTabs = () => _get(_dtU()) || DIARIO_TABS_DEFAULT;
  const saveDiarioTabs = (tabs) => _set(_dtU(), tabs);

  /* ---------- RODA DA VIDA CONFIG ---------- */
  const _rvCfgU = () => `pcf_rodavida_config_${currentUserId()}`;
  const RODA_VIDA_CONFIG_DEFAULT = [
    {
      id: 'pessoal', label: 'Pessoal', cor: '#22c55e',
      categorias: [
        { id: 'saude',       label: 'Saúde – Disposição e Bem-estar',    labelCurto: 'Saúde',      icon: '❤️',  cor: '#4ade80', integracaoFonte: 'imc'          },
        { id: 'intelecto',   label: 'Intelecto – Conhecimento',           labelCurto: 'Intelecto',  icon: '🧠',  cor: '#22c55e', integracaoFonte: 'habitos_mente' },
        { id: 'emocoes_rv',  label: 'Emoções – Equilíbrio Emocional',     labelCurto: 'Emoções',    icon: '😊',  cor: '#166534', integracaoFonte: 'emocoes'       },
      ],
    },
    {
      id: 'profissional', label: 'Profissional', cor: '#f97316',
      categorias: [
        { id: 'carreira',    label: 'Carreira – Realização e Propósito',  labelCurto: 'Carreira',   icon: '💼',  cor: '#0d9488', integracaoFonte: '' },
        { id: 'contribuicao',label: 'Contribuição Social',                labelCurto: 'Contribuição',icon: '🤝', cor: '#f472b6', integracaoFonte: '' },
        { id: 'financas_rv', label: 'Finanças – Recursos Financeiros',    labelCurto: 'Finanças',   icon: '💰',  cor: '#f97316', integracaoFonte: 'financas'      },
      ],
    },
    {
      id: 'relacionamentos', label: 'Relacionamentos', cor: '#3b82f6',
      categorias: [
        { id: 'familia',     label: 'Amizade e Família',                  labelCurto: 'Família',    icon: '👨‍👩‍👧', cor: '#1e40af', integracaoFonte: '' },
        { id: 'afeicao',     label: 'Afeição e Amor',                     labelCurto: 'Amor',       icon: '💕',  cor: '#db2777', integracaoFonte: '' },
        { id: 'social',      label: 'Vida Social',                        labelCurto: 'Social',     icon: '🎉',  cor: '#3b82f6', integracaoFonte: '' },
      ],
    },
    {
      id: 'qualidade', label: 'Qualidade de Vida', cor: '#a78bfa',
      categorias: [
        { id: 'lazer',       label: 'Lazer – Criatividade e Hobbies',     labelCurto: 'Lazer',      icon: '🎨',  cor: '#bef264', integracaoFonte: '' },
        { id: 'plenitude',   label: 'Conquista, Plenitude e Felicidade',  labelCurto: 'Plenitude',  icon: '🌟',  cor: '#22d3ee', integracaoFonte: '' },
        { id: 'espiritualidade', label: 'Espiritualidade',                labelCurto: 'Espirit.',   icon: '✨',  cor: '#cbd5e1', integracaoFonte: '' },
      ],
    },
  ];
  const getRodaVidaConfig = () => _get(_rvCfgU()) || RODA_VIDA_CONFIG_DEFAULT;
  const saveRodaVidaConfig = (cfg) => _set(_rvCfgU(), cfg);

  /* ---------- DIÁRIO PESSOAL ---------- */
  const _dkU = () => `pcf_diario_${currentUserId()}`;
  const getDiario = () => _get(_dkU()) || [];
  const saveDiario = (arr) => _set(_dkU(), arr);

  /* ---------- RODA DA VIDA REGISTROS ---------- */
  const _rvRegU = () => `pcf_rodavida_reg_${currentUserId()}`;
  const getRodaVidaRegistros = () => _get(_rvRegU()) || [];
  const saveRodaVidaRegistros = (regs) => _set(_rvRegU(), regs);
  const deleteRodaVidaRegistro = (id) => { const all = getRodaVidaRegistros().filter(r => r.id !== id); saveRodaVidaRegistros(all); return all; };

  /* ---------- VIRTUDES CONFIG ---------- */
  const _vcU = () => `pcf_virtudes_config_${currentUserId()}`;
  const getVirtudesConfig = () => _get(_vcU()) || [];
  const saveVirtudesConfig = (v) => _set(_vcU(), v);
  const addVirtude = (v) => { const all = getVirtudesConfig(); all.push({ id: _uid(), ativo: true, ...v }); saveVirtudesConfig(all); return all; };
  const updateVirtude = (id, data) => { const all = getVirtudesConfig(); const i = all.findIndex(v => v.id === id); if (i >= 0) { all[i] = { ...all[i], ...data }; saveVirtudesConfig(all); } return all; };
  const deleteVirtude = (id) => { const all = getVirtudesConfig().filter(v => v.id !== id); saveVirtudesConfig(all); return all; };

  /* ---------- ENTRETENIMENTO: CAÇA-PALAVRAS ---------- */
  const _jpwU = () => `pcf_jogo_palavras_${currentUserId()}`;
  const _jpwStateU = () => `pcf_jogo_palavras_estado_${currentUserId()}`;
  const getJogoPalavras = () => _get(_jpwU()) || [];
  const saveJogoPalavras = (arr) => _set(_jpwU(), arr || []);
  const addJogoPalavra = (item) => { const all = getJogoPalavras(); all.push({ id: _uid(), ativo: true, ...item }); saveJogoPalavras(all); return all; };
  const updateJogoPalavra = (id, data) => { const all = getJogoPalavras(); const i = all.findIndex(p => p.id === id); if (i >= 0) { all[i] = { ...all[i], ...data }; saveJogoPalavras(all); } return all; };
  const deleteJogoPalavra = (id) => { const all = getJogoPalavras().filter(p => p.id !== id); saveJogoPalavras(all); return all; };
  const _normalizeJogoPalavrasEstado = (state) => {
    if (!state) return null;
    const copy = { ...state };
    if (Array.isArray(copy.gridRows)) copy.grid = copy.gridRows.map(row => String(row).split(''));
    if (Array.isArray(copy.words)) {
      copy.words = copy.words.map(word => ({
        ...word,
        cells: Array.isArray(word.cells) ? word.cells : String(word.cellsText || '').split('|').filter(Boolean),
      }));
    }
    return copy;
  };
  const _serializeJogoPalavrasEstado = (state) => {
    if (!state) return null;
    const copy = { ...state };
    if (Array.isArray(copy.grid)) {
      copy.gridRows = copy.grid.map(row => Array.isArray(row) ? row.join('') : String(row || ''));
      delete copy.grid;
    }
    if (Array.isArray(copy.words)) {
      copy.words = copy.words.map(word => {
        const item = { ...word };
        if (Array.isArray(item.cells)) {
          item.cellsText = item.cells.join('|');
          delete item.cells;
        }
        return item;
      });
    }
    return copy;
  };
  const getJogoPalavrasEstado = () => _normalizeJogoPalavrasEstado(_get(_jpwStateU()));
  const saveJogoPalavrasEstado = (state) => _set(_jpwStateU(), _serializeJogoPalavrasEstado(state));

  /* ---------- VIRTUDES REGISTROS ---------- */
  const _vrU = () => `pcf_virtudes_reg_${currentUserId()}`;
  const getVirtudesReg = () => _get(_vrU()) || [];
  const saveVirtudesReg = (r) => _set(_vrU(), r);
  const toggleVirtude = (virtudeId, data) => {
    const hoje = data || new Date().toISOString().split('T')[0];
    const all = getVirtudesReg();
    const idx = all.findIndex(r => r.virtudeId === virtudeId && r.data === hoje);
    if (idx >= 0) { all.splice(idx, 1); }
    else { all.push({ id: _uid(), virtudeId, data: hoje }); }
    saveVirtudesReg(all);
    return all;
  };
  const deleteVirtudReg = (id) => { const all = getVirtudesReg().filter(r => r.id !== id); saveVirtudesReg(all); return all; };

  /* ---------- IMPORT / EXPORT ---------- */
  const exportData = (userId) => {
    const uid = userId || currentUserId();
    return {
      transacoes: _get(`pcf_transacoes_${uid}`) || [],
      categorias: _get(`pcf_categorias_${uid}`) || [],
      emocoes: ((_get(`pcf_emocoes_${uid}`) || []).map(_normalizeEmocao)),
      emocoes_config: _get(`pcf_emocoes_config_${uid}`) || [],
      imc: _get(`pcf_imc_${uid}`) || { peso: 0, altura: 0 },
      saude_eventos: _get(`pcf_saude_eventos_${uid}`) || [],
      habitos: _get(`pcf_habitos_${uid}`) || [],
      reg_habitos: _get(`pcf_reg_habitos_${uid}`) || [],
      frases: _get(`pcf_frases_${uid}`) || [],
      agenda: _get(`pcf_agenda_${uid}`) || [],
      contatos: _get(`pcf_contatos_${uid}`) || [],
      diario: _get(`pcf_diario_${uid}`) || [],
      diario_tabs: _get(`pcf_diario_tabs_${uid}`) || [],
      plano_acao: _get(`pcf_plano_acao_${uid}`) || [],
      linha_tempo: _get(`pcf_linha_tempo_${uid}`) || [],
      uso_funcionalidades: _get(`pcf_uso_funcionalidades_${uid}`) || [],
      atividades: _get(`pcf_atividades_${uid}`) || [],
    };
  };

  const importTransacoes = (data) => { _set(_tkU(), data); };
  const importCategorias = (data) => { _set(_ckU(), data); };

  return {
    loadAll, registerSelf, loginWithGoogle,
    getUsers, saveUsers, getUserById, getUserByLogin, createUser, updateUser, deleteUser,
    getSession, setSession, clearSession, currentUserId, currentUserIsAdmin,
    getLinhaTempo, saveLinhaTempo, addEventoLinhaTempo, updateEventoLinhaTempo, deleteEventoLinhaTempo,
    getTransacoes, saveTransacoes, addTransacao, updateTransacao, deleteTransacao,
    getCategorias, saveCategorias, addCategoria, updateCategoria, deleteCategoria,
    getEmocoes, saveEmocoes, addEmocao, updateEmocao, deleteEmocao,
    getEmocoesConfig, saveEmocoesConfig,
    getIMC, saveIMC,
    getAtividadesUsuario, registrarAtividade,
    getUsoFuncionalidades, saveUsoFuncionalidades, registrarUsoFuncionalidade, getRelatorioUsoFuncionalidades,
    getAgendaConfig, saveAgendaConfig,
    getSaudeEventos, saveSaudeEventos, addSaudeEvento, updateSaudeEvento, deleteSaudeEvento,
    getCompromissos, saveCompromissos, addCompromisso, updateCompromisso, deleteCompromisso,
    getPlanoAcoes, savePlanoAcoes, addPlanoAcao, updatePlanoAcao, deletePlanoAcao,
    getHabitos, saveHabitos, addHabito, updateHabito, deleteHabito,
    getRegistrosHabitos, saveRegistrosHabitos, upsertRegistroHabito, deleteRegistroHabito,
    getFrases, saveFrases, addFrase, updateFrase, deleteFrase,
    getContatos, saveContatos, addContato, updateContato, deleteContato,
    getDiarioTabs, saveDiarioTabs,
    getDiario, saveDiario,
    getRodaVidaConfig, saveRodaVidaConfig,
    getRodaVidaRegistros, saveRodaVidaRegistros, deleteRodaVidaRegistro,
    getVirtudesConfig, saveVirtudesConfig, addVirtude, updateVirtude, deleteVirtude,
    getJogoPalavras, saveJogoPalavras, addJogoPalavra, updateJogoPalavra, deleteJogoPalavra,
    getJogoPalavrasEstado, saveJogoPalavrasEstado,
    getVirtudesReg, saveVirtudesReg, toggleVirtude, deleteVirtudReg,
    exportData, importTransacoes, importCategorias,
    restoreDefaultCategorias, restoreDefaultEmocoesConfig, restoreDefaultHabitos, restoreDefaultFrases, restoreDefaultVirtudes,
    _uid,
  };
})();
