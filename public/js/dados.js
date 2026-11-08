/* Camada de dados: tudo que lê e grava no Firestore passa por aqui.

   ESTRUTURA DO BANCO
   usuarios/{uid}                         perfil: nome, casaId, cartao {fecha, vence}, ultimoBackup
   usuarios/{uid}/categorias/{id}         grupo ("s" gasto | "e" entrada), nome, subs[], ordem, excluido
   usuarios/{uid}/lancamentos/{id}        tipo ("s"|"e"), valor, categoriaId, categoriaNome, sub, desc,
                                          data, mes, pag, fixoId?, fixoMes?, excluido, criadoEm...
   usuarios/{uid}/fixos/{id}              nome, valor, categoriaId, sub, pag, dia, inicio, parcelas, excluido
   usuarios/{uid}/futuras/{id}            nome, valor, categoriaId, quando, obs, excluido

   casas/{casaId}                         membros [uid, uid], nomes {uid: nome}
   casas/{casaId}/parcelamentos/{id}      autor, desc, categoriaNome, valorTotal, n, dataCompra,
                                          parcelas [{n, data, mes, valor}], excluido   (COMPARTILHADO)
   casas/{casaId}/investimentos/{id}      autor, tipo ("i" aplicar | "r" resgatar | "a" já tinha),
                                          valor, tipoInvId, tipoInvNome, data, mes, excluido   (COMPARTILHADO)
   casas/{casaId}/tiposInvestimento/{id}  nome, ordem, excluido   (COMPARTILHADO)

   Valores sempre em centavos. Nada é apagado de verdade de primeira: vai para a lixeira (excluido: true). */

import {
  db, doc, collection, query, where, onSnapshot, getDocs, getDocsFromServer, setDoc, updateDoc, deleteDoc,
  writeBatch, arrayUnion, serverTimestamp
} from "./firebase.js";
import { hoje, mesHoje, isoDe, addMeses, mesesEntre, toast } from "./util.js";

export const PAGAMENTOS = ["Pix", "Débito", "Crédito", "Dinheiro", "Boleto"];

const CATS_PADRAO = {
  s: [
    ["Mercado"], ["Comida na rua/Delivery"],
    ["Contas", ["Luz", "Água", "Condomínio", "Internet", "Gás", "Celular"]],
    ["Hobbies"], ["Saídas"], ["Casa"], ["Transporte"], ["Saúde"], ["Compras"], ["Outros"]
  ],
  e: [["Salário"], ["Renda extra"], ["Outros"]]
};
const INV_PADRAO = ["Reserva de emergência", "Tesouro Direto", "CDB/LCI/LCA", "Ações", "FIIs", "Cripto", "Previdência"];

/* ---------- Estado em memória (espelho do banco) ---------- */

export const st = {
  uid: null,
  perfil: undefined,     // undefined = carregando; null = ainda não tem perfil
  casa: null,
  cats: [], fixos: [], futuras: [],
  lancMes: [],           // lançamentos do mês aberto na tela
  lancFuturos: [],       // lançamentos deste mês em diante (para as faturas)
  parc: [], inv: [], tiposInv: [],
  mesSel: mesHoje(),
  pronto: {},
  erro: null
};

let aoMudar = () => {};
export function quandoMudar(fn) { aoMudar = fn; }
let agendado = false;
export function atualizarTela() {
  if (agendado) return;
  agendado = true;
  queueMicrotask(() => { agendado = false; aoMudar(); });
}

const assinaturas = {};
function ouvir(nome, alvo, aplicar) {
  if (assinaturas[nome]) assinaturas[nome]();
  assinaturas[nome] = onSnapshot(alvo,
    snap => { aplicar(snap); st.pronto[nome] = true; atualizarTela(); },
    erro => {
      console.error(nome, erro);
      st.erro = erro.code === "permission-denied"
        ? "Sem permissão para ler os dados. Confira se as regras do banco foram publicadas."
        : "Não deu para carregar os dados. Confira a conexão.";
      atualizarTela();
    });
}
export function pararTudo() {
  Object.keys(assinaturas).forEach(k => { assinaturas[k](); delete assinaturas[k]; });
  Object.assign(st, { uid: null, perfil: undefined, casa: null, cats: [], fixos: [], futuras: [], lancMes: [],
    lancFuturos: [], parc: [], inv: [], tiposInv: [], pronto: {}, erro: null, mesSel: mesHoje() });
  pessoaisLigados = false; casaLigada = null;
}

const lista = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
const colU = nome => collection(db, "usuarios", st.uid, nome);
const colC = nome => collection(db, "casas", st.perfil.casaId, nome);
const COLECOES_CASA = ["parcelamentos", "investimentos", "tiposInvestimento"];
const refDe = (colecao, id) => COLECOES_CASA.includes(colecao)
  ? doc(db, "casas", st.perfil.casaId, colecao, id)
  : doc(db, "usuarios", st.uid, colecao, id);

/* Grava sem travar a tela: com o cache local a gravação aparece na hora
   e vai para a nuvem assim que houver conexão. */
function gravar(promessa) {
  promessa.catch(e => {
    console.error(e);
    toast(e.code === "permission-denied" ? "Sem permissão para salvar isso." : "Não deu para salvar. Tente de novo.");
  });
}
const carimbo = () => ({ atualizadoEm: serverTimestamp() });
const novo = () => ({ excluido: false, criadoEm: serverTimestamp(), criadoLocal: Date.now(), atualizadoEm: serverTimestamp() });

/* Espera a resposta do servidor (para ações que precisam de internet, como entrar numa casa) */
function comPrazo(promessa, ms = 15000) {
  return Promise.race([promessa, new Promise((_, n) => setTimeout(() => n({ code: "timeout" }), ms))]);
}

/* ---------- Início ---------- */

let pessoaisLigados = false;
let casaLigada = null;

export function iniciar(uid) {
  st.uid = uid;
  ouvir("perfil", doc(db, "usuarios", uid), snap => {
    if (!snap.exists()) {
      // sem internet e sem cópia local: ainda não sabemos se o perfil existe
      st.perfil = snap.metadata.fromCache ? undefined : null;
      return;
    }
    st.perfil = snap.data();
    if (!pessoaisLigados) ligarPessoais();
    if (st.perfil.casaId && st.perfil.casaId !== casaLigada) ligarCasa();
  });
}

function ligarPessoais() {
  pessoaisLigados = true;
  ouvir("cats", colU("categorias"), s => (st.cats = lista(s).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))));
  ouvir("fixos", colU("fixos"), s => (st.fixos = lista(s)));
  ouvir("futuras", colU("futuras"), s => (st.futuras = lista(s)));
  ouvir("lancFuturos", query(colU("lancamentos"), where("mes", ">=", mesHoje())), s => (st.lancFuturos = lista(s)));
  ligarMes();
}
function ligarMes() {
  ouvir("lancMes", query(colU("lancamentos"), where("mes", "==", st.mesSel)), s => (st.lancMes = lista(s)));
}
function ligarCasa() {
  casaLigada = st.perfil.casaId;
  ouvir("casa", doc(db, "casas", casaLigada), s => (st.casa = s.exists() ? { id: s.id, ...s.data() } : null));
  ouvir("parc", colC("parcelamentos"), s => (st.parc = lista(s)));
  ouvir("inv", colC("investimentos"), s => (st.inv = lista(s)));
  ouvir("tiposInv", colC("tiposInvestimento"), s => (st.tiposInv = lista(s).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))));
}

export function mudarMes(mk) {
  st.mesSel = mk;
  st.pronto.lancMes = false;
  st.lancMes = [];
  ligarMes();
  atualizarTela();
}

/* ---------- Primeiro acesso: criar ou entrar numa casa ---------- */

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O e 1/I para não confundir
const gerarCodigo = () => Array.from(crypto.getRandomValues(new Uint32Array(8)), n => ALFABETO[n % ALFABETO.length]).join("");
export const codigoBonito = c => c ? c.slice(0, 4) + "-" + c.slice(4) : "";

function lotePerfil(b, nome, casaId) {
  b.set(doc(db, "usuarios", st.uid), {
    nome, casaId, cartao: { fecha: 0, vence: 10 }, ultimoBackup: null, criadoEm: serverTimestamp()
  });
  let ordem = 0;
  for (const g of ["s", "e"]) {
    CATS_PADRAO[g].forEach(([n, subs = []]) =>
      b.set(doc(colU("categorias")), { grupo: g, nome: n, subs, ordem: ordem++, ...novo() }));
  }
}

export async function criarCasa(nome) {
  let casaId;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    casaId = gerarCodigo();
    try {
      await comPrazo(setDoc(doc(db, "casas", casaId), { membros: [st.uid], nomes: { [st.uid]: nome }, criadoEm: serverTimestamp() }));
      break;
    } catch (e) {
      if (tentativa === 2 || e.code === "timeout") throw e;
    }
  }
  const b = writeBatch(db);
  lotePerfil(b, nome, casaId);
  await comPrazo(b.commit());
  const b2 = writeBatch(db);
  INV_PADRAO.forEach((n, i) => b2.set(doc(collection(db, "casas", casaId, "tiposInvestimento")), { nome: n, ordem: i, ...novo() }));
  await comPrazo(b2.commit());
}

export async function entrarNaCasa(nome, codigoDigitado) {
  const casaId = codigoDigitado.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (casaId.length !== 8) throw { code: "codigo" };
  await comPrazo(updateDoc(doc(db, "casas", casaId), { membros: arrayUnion(st.uid), [`nomes.${st.uid}`]: nome }));
  const b = writeBatch(db);
  lotePerfil(b, nome, casaId);
  await comPrazo(b.commit());
}

/* ---------- Cartão ---------- */

export function datasParcelas(dataCompra, n) {
  const { fecha = 0, vence = 10 } = st.perfil?.cartao || {};
  let primeira = dataCompra;
  if (fecha > 0) {
    const [y, m, d] = dataCompra.split("-").map(Number);
    const mesFech = d >= fecha ? m + 1 : m;           // comprou no dia do fechamento ou depois: próxima fatura
    const mesVenc = vence <= fecha ? mesFech + 1 : mesFech;
    primeira = isoDe(y, mesVenc, vence);
  }
  return Array.from({ length: n }, (_, i) => addMeses(primeira, i));
}

export function salvarCartao(fecha, vence) {
  gravar(updateDoc(doc(db, "usuarios", st.uid), { cartao: { fecha, vence } }));
}

/* ---------- Lançar ---------- */

export const nomeCat = id => (st.cats.find(c => c.id === id) || {}).nome;
export const nomeTipoInv = id => (st.tiposInv.find(c => c.id === id) || {}).nome;

export function lancar({ tipo, valor, categoriaId, sub, desc, data, pag, parcelas, fixo }) {
  sub = sub || ""; desc = desc || "";

  if ("ira".includes(tipo)) {
    gravar(setDoc(doc(colC("investimentos")), {
      autor: st.uid, tipo, valor, tipoInvId: categoriaId, tipoInvNome: nomeTipoInv(categoriaId) || "",
      desc, data, mes: data.slice(0, 7), ...novo()
    }));
    return;
  }

  const categoriaNome = nomeCat(categoriaId) || "";
  let dataFinal = data;

  if (tipo === "s" && pag === "Crédito" && !fixo) {
    const n = Math.min(48, Math.max(1, parcelas | 0));
    const datas = datasParcelas(data, n);
    if (n > 1) {
      const parte = Math.floor(valor / n), resto = valor - parte * n;
      gravar(setDoc(doc(colC("parcelamentos")), {
        autor: st.uid, desc, categoriaId, categoriaNome, sub, valorTotal: valor, n, dataCompra: data,
        parcelas: datas.map((d, i) => ({ n: i + 1, data: d, mes: d.slice(0, 7), valor: parte + (i === 0 ? resto : 0) })),
        ...novo()
      }));
      return;
    }
    dataFinal = datas[0];
  }

  gravar(setDoc(doc(colU("lancamentos")), {
    tipo, valor, categoriaId: categoriaId || null, categoriaNome, sub, desc, data: dataFinal, mes: dataFinal.slice(0, 7),
    pag: tipo === "s" ? pag || "" : "", ...(dataFinal !== data ? { dataCompra: data } : {}),
    ...(fixo ? { fixoId: fixo.id, fixoMes: fixo.mes } : {}),
    ...novo()
  }));
}

export function pagarFixo(f, mk) {
  const k = mesesEntre(f.inicio, mk) + 1;
  const [y, m] = mk.split("-").map(Number);
  lancar({
    tipo: "s", valor: f.valor, categoriaId: f.categoriaId, sub: f.sub,
    desc: f.nome + (f.parcelas ? ` (${k}/${f.parcelas})` : ""),
    data: isoDe(y, m, f.dia), pag: f.pag, fixo: { id: f.id, mes: mk }
  });
}

export function salvarFixo(f) { gravar(setDoc(doc(colU("fixos")), { ...f, ...novo() })); }
export function salvarFutura(f) { gravar(setDoc(doc(colU("futuras")), { ...f, ...novo() })); }

/* ---------- Lixeira ---------- */

export function excluir(colecao, id) {
  gravar(updateDoc(refDe(colecao, id), { excluido: true, excluidoEm: Date.now(), ...carimbo() }));
}
export function restaurar(colecao, id) {
  gravar(updateDoc(refDe(colecao, id), { excluido: false, excluidoEm: null, ...carimbo() }));
}
export function apagarDeVez(colecao, id) { gravar(deleteDoc(refDe(colecao, id))); }

export async function itensLixeira() {
  const lanc = (await getDocs(query(colU("lancamentos"), where("excluido", "==", true)))).docs
    .map(d => ({ id: d.id, ...d.data() }));
  const meu = x => x.excluido && (!x.autor || x.autor === st.uid);
  const itens = [
    ...lanc.map(l => ({ colecao: "lancamentos", id: l.id, titulo: l.desc || l.categoriaNome, detalhe: `lançamento de ${l.data.split("-").reverse().join("/")}`, valor: l.valor, quando: l.excluidoEm })),
    ...st.parc.filter(meu).map(p => ({ colecao: "parcelamentos", id: p.id, titulo: p.desc || p.categoriaNome, detalhe: `parcelado em ${p.n}x`, valor: p.valorTotal, quando: p.excluidoEm })),
    ...st.inv.filter(meu).map(i => ({ colecao: "investimentos", id: i.id, titulo: i.tipoInvNome, detalhe: "investimento", valor: i.valor, quando: i.excluidoEm })),
    ...st.fixos.filter(meu).map(f => ({ colecao: "fixos", id: f.id, titulo: f.nome, detalhe: "gasto fixo", valor: f.valor, quando: f.excluidoEm })),
    ...st.futuras.filter(meu).map(f => ({ colecao: "futuras", id: f.id, titulo: f.nome, detalhe: "compra futura", valor: f.valor, quando: f.excluidoEm })),
    ...st.cats.filter(meu).map(c => ({ colecao: "categorias", id: c.id, titulo: c.nome, detalhe: "categoria", quando: c.excluidoEm })),
    ...st.tiposInv.filter(x => x.excluido).map(c => ({ colecao: "tiposInvestimento", id: c.id, titulo: c.nome, detalhe: "tipo de investimento", quando: c.excluidoEm }))
  ];
  return itens.sort((a, b) => (b.quando || 0) - (a.quando || 0));
}

/* ---------- Categorias ---------- */

export function addCategoria(grupo, nome) {
  const ordem = Math.max(0, ...st.cats.map(c => c.ordem ?? 0)) + 1;
  gravar(setDoc(doc(colU("categorias")), { grupo, nome, subs: [], ordem, ...novo() }));
}
export function addTipoInv(nome) {
  const ordem = Math.max(0, ...st.tiposInv.map(c => c.ordem ?? 0)) + 1;
  gravar(setDoc(doc(colC("tiposInvestimento")), { nome, ordem, ...novo() }));
}
export function mudarSubs(cat, subs) {
  gravar(updateDoc(refDe("categorias", cat.id), { subs, ...carimbo() }));
}

/* ---------- Consultas para as telas ---------- */

const ativo = x => !x.excluido;
export const nomePessoa = uid => (uid === st.uid ? "Você" : st.casa?.nomes?.[uid] || "Outra pessoa");

/* Parcelas das minhas compras parceladas que caem no mês, como se fossem lançamentos */
function minhasParcelas(mk) {
  return st.parc.filter(p => ativo(p) && p.autor === st.uid).flatMap(p =>
    p.parcelas.filter(x => x.mes === mk).map(x => ({
      id: `${p.id}#${x.n}`, parcelamentoId: p.id, tipo: "s", valor: x.valor, data: x.data, mes: mk,
      categoriaId: p.categoriaId, categoriaNome: p.categoriaNome, sub: p.sub, desc: p.desc,
      pag: "Crédito", parc: `${x.n}/${p.n}`, criadoLocal: p.criadoLocal
    })));
}

/* Tudo que mexe no MEU saldo do mês: lançamentos, minhas parcelas e meus investimentos */
export function itensDoMes(mk) {
  const inv = st.inv.filter(i => ativo(i) && i.autor === st.uid && i.mes === mk)
    .map(i => ({ ...i, categoriaNome: i.tipoInvNome, colecao: "investimentos" }));
  return [
    ...st.lancMes.filter(ativo).map(l => ({ ...l, colecao: "lancamentos" })),
    ...minhasParcelas(mk),
    ...inv
  ];
}

export function totais(lista) {
  const t = { e: 0, s: 0, i: 0, r: 0, a: 0 };
  lista.forEach(l => (t[l.tipo] = (t[l.tipo] || 0) + l.valor));
  t.investiu = t.i - t.r;
  t.saldo = t.e - t.s - t.investiu;
  return t;
}

export function fixosDoMes(mk) {
  return st.fixos.filter(ativo)
    .filter(f => { const k = mesesEntre(f.inicio, mk); return k >= 0 && (!f.parcelas || k < f.parcelas); })
    .map(f => ({
      f,
      k: mesesEntre(f.inicio, mk) + 1,
      pago: st.lancMes.find(l => ativo(l) && l.fixoId === f.id && l.fixoMes === mk)
    }))
    .sort((a, b) => a.f.dia - b.f.dia);
}

/* Minha fatura do mês: compras à vista no crédito + parcelas */
export function faturaDoMes(mk) {
  const porId = new Map([...st.lancFuturos, ...st.lancMes].map(l => [l.id, l]));
  const avista = [...porId.values()].filter(l => ativo(l) && l.tipo === "s" && l.pag === "Crédito" && l.mes === mk)
    .reduce((a, l) => a + l.valor, 0);
  return avista + minhasParcelas(mk).reduce((a, p) => a + p.valor, 0);
}

/* Parcelamentos da casa (dos dois), com quanto falta */
export function parcelamentosAtivos() {
  const inicioMes = mesHoje();
  return st.parc.filter(ativo).map(p => {
    const pagas = p.parcelas.filter(x => x.data <= hoje()).length;
    return {
      ...p, pagas,
      restante: p.parcelas.filter(x => x.data > hoje()).reduce((a, x) => a + x.valor, 0),
      ultima: p.parcelas[p.parcelas.length - 1].data
    };
  }).filter(p => p.ultima.slice(0, 7) >= inicioMes).sort((a, b) => a.ultima.localeCompare(b.ultima));
}

/* Investimentos da casa: total, por tipo e por pessoa */
export function resumoInvestimentos() {
  const porTipo = {}, porPessoa = {};
  let total = 0;
  st.inv.filter(ativo).forEach(i => {
    const v = i.tipo === "r" ? -i.valor : i.valor;
    const nome = nomeTipoInv(i.tipoInvId) || i.tipoInvNome || "Sem tipo";
    porTipo[nome] = (porTipo[nome] || 0) + v;
    porPessoa[i.autor] = (porPessoa[i.autor] || 0) + v;
    total += v;
  });
  return { total, porTipo, porPessoa };
}

/* ---------- Backup ---------- */

const semCarimbos = o => JSON.parse(JSON.stringify(o, (k, v) =>
  v && typeof v === "object" && "seconds" in v && "nanoseconds" in v ? new Date(v.seconds * 1000).toISOString() : v));

/* Lê direto do servidor. Sem internet dá erro em vez de devolver só o que está no celular
   (o cache local só tem os meses já abertos, então a cópia sairia incompleta). */
export async function exportarTudo() {
  const ler = async c => (await comPrazo(getDocsFromServer(c), 30000)).docs.map(d => ({ id: d.id, ...d.data() }));
  const dados = {
    app: "controle-financeiro", versao: 2, exportadoEm: new Date().toISOString(),
    perfil: st.perfil, casa: st.casa,
    usuario: {
      categorias: await ler(colU("categorias")), lancamentos: await ler(colU("lancamentos")),
      fixos: await ler(colU("fixos")), futuras: await ler(colU("futuras"))
    },
    compartilhado: {
      parcelamentos: await ler(colC("parcelamentos")), investimentos: await ler(colC("investimentos")),
      tiposInvestimento: await ler(colC("tiposInvestimento"))
    }
  };
  // Só chega aqui se todas as leituras vieram completas do servidor
  gravar(updateDoc(doc(db, "usuarios", st.uid), { ultimoBackup: Date.now() }));
  return semCarimbos(dados);
}

/* Restaura um backup. Também aceita o backup da versão antiga (só no navegador).

   SEGURANÇA: só CRIA o que não existe no banco. Nada que já está lá é sobrescrito,
   então restaurar uma cópia antiga não desfaz o que mudou depois dela, e restaurar
   a mesma cópia duas vezes não duplica nada (os IDs são sempre os mesmos). */
export async function importarBackup(x) {
  const docs = [];  // [ref, dados]
  const limpa = ({ id, ...resto }) => {
    for (const k of ["criadoEm", "atualizadoEm"]) delete resto[k];
    return { ...resto, atualizadoEm: serverTimestamp() };
  };

  if (x && x.app === "controle-financeiro" && x.versao === 2) {
    for (const [c, itens] of Object.entries(x.usuario || {}))
      if (["categorias", "lancamentos", "fixos", "futuras"].includes(c))
        itens.forEach(i => docs.push([doc(db, "usuarios", st.uid, c, i.id), limpa(i)]));
    for (const [c, itens] of Object.entries(x.compartilhado || {}))
      if (COLECOES_CASA.includes(c))
        itens.filter(i => c === "tiposInvestimento" || i.autor === st.uid)
          .forEach(i => docs.push([doc(db, "casas", st.perfil.casaId, c, i.id), limpa(i)]));
  } else if (x && Array.isArray(x.lanc) && x.cats) {
    importarVersaoAntiga(x, docs);
  } else {
    throw { code: "formato" };
  }

  // Descobre, no servidor, quais IDs já existem em cada coleção (sem internet dá erro e nada é gravado)
  const existentes = {};
  for (const [ref] of docs) {
    const caminho = ref.parent.path;
    if (!existentes[caminho])
      existentes[caminho] = new Set((await comPrazo(getDocsFromServer(ref.parent), 30000)).docs.map(d => d.id));
  }
  const vistos = new Set();
  const novos = docs.filter(([ref]) => {
    if (existentes[ref.parent.path].has(ref.id) || vistos.has(ref.path)) return false;
    vistos.add(ref.path);
    return true;
  });

  for (let i = 0; i < novos.length; i += 400) {
    const b = writeBatch(db);
    novos.slice(i, i + 400).forEach(([ref, dados]) => b.set(ref, dados));
    await comPrazo(b.commit(), 30000);
  }
  return { novos: novos.length, jaExistiam: docs.length - novos.length };
}

/* ID fixo para cada item da versão antiga: importar de novo cai no mesmo documento.
   Leva o começo do uid para não colidir com itens da outra pessoa na parte compartilhada. */
function hash(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}
const idAntigo = (chave, item) => {
  const base = chave != null && chave !== "" ? String(chave).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) : "h" + hash(JSON.stringify(item));
  return `antigo-${st.uid.slice(0, 8)}-${base}`;
};

function importarVersaoAntiga(x, docs) {
  const idCat = nome => (st.cats.find(c => c.nome === nome && !c.excluido) || {}).id || null;
  const idInv = nome => (st.tiposInv.find(c => c.nome === nome && !c.excluido) || {}).id || null;
  const base = (id) => ({ excluido: false, criadoLocal: Date.now(), atualizadoEm: serverTimestamp(), importadoDe: id ?? null });
  const grupos = {};

  x.lanc.forEach(l => {
    if (l.grupo) { (grupos[l.grupo] = grupos[l.grupo] || []).push(l); return; }
    if ("ira".includes(l.tipo)) {
      docs.push([doc(colC("investimentos"), idAntigo(l.id, l)), { autor: st.uid, tipo: l.tipo, valor: l.valor, tipoInvId: idInv(l.cat), tipoInvNome: l.cat,
        desc: l.desc || "", data: l.data, mes: l.data.slice(0, 7), ...base(l.id) }]);
    } else {
      docs.push([doc(colU("lancamentos"), idAntigo(l.id, l)), { tipo: l.tipo, valor: l.valor, categoriaId: idCat(l.cat), categoriaNome: l.cat, sub: l.sub || "",
        desc: l.desc || "", data: l.data, mes: l.data.slice(0, 7), pag: l.pag || "", ...base(l.id) }]);
    }
  });
  Object.entries(grupos).forEach(([grupo, ps]) => {
    ps.sort((a, b) => a.data.localeCompare(b.data));
    const p0 = ps[0];
    docs.push([doc(colC("parcelamentos"), idAntigo("g" + grupo, ps)), { autor: st.uid, desc: p0.desc || "", categoriaId: idCat(p0.cat), categoriaNome: p0.cat, sub: p0.sub || "",
      valorTotal: ps.reduce((a, p) => a + p.valor, 0), n: ps.length, dataCompra: p0.compra || p0.data,
      parcelas: ps.map((p, i) => ({ n: i + 1, data: p.data, mes: p.data.slice(0, 7), valor: p.valor })), ...base(grupo) }]);
  });
  (x.fixos || []).forEach(f => docs.push([doc(colU("fixos"), idAntigo(f.id, f)), { nome: f.nome, valor: f.valor, categoriaId: idCat(f.cat), sub: f.sub || "",
    pag: f.pag || "", dia: f.dia, inicio: f.inicio, parcelas: f.parcelas || 0, ...base(f.id) }]));
  (x.futuras || []).forEach(f => docs.push([doc(colU("futuras"), idAntigo(f.id, f)), { nome: f.nome, valor: f.valor, categoriaId: idCat(f.cat),
    quando: f.quando || "", obs: f.obs || "", ...base(f.id) }]));
}
