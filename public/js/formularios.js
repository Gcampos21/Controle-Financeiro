/* Folhas que sobem da parte de baixo da tela: lançamento, gasto fixo e compra futura */

import { $, h, brl, hoje, mesHoje, fmtData, parseValor, valorParaCampo, toast } from "./util.js";
import { st, PAGAMENTOS, datasParcelas, lancar, salvarFixo, salvarFutura } from "./dados.js";

export function abrirSheet(titulo, conteudo) {
  $("panel").replaceChildren(
    h("header", null,
      h("b", null, titulo),
      h("button", { type: "button", class: "x", "aria-label": "Fechar", onclick: fecharSheet }, "×")),
    conteudo
  );
  $("sheet").hidden = false;
}
export function fecharSheet() { $("sheet").hidden = true; }

/* ---------- Peças reutilizáveis ---------- */

/* opcoes: lista de [valor, rótulo] */
export const chips = (opcoes, sel, aoEscolher) =>
  h("div", { class: "chips" }, opcoes.map(([v, rot]) =>
    h("button", { type: "button", class: "chip", "aria-pressed": String(v === sel), onclick: () => aoEscolher(v) }, rot)));
export const seg = (opcoes, sel, aoEscolher) =>
  h("div", { class: "seg", role: "group" }, opcoes.map(([v, rot]) =>
    h("button", { type: "button", "aria-pressed": String(v === sel), onclick: () => aoEscolher(v) }, rot)));
export const campo = (rotulo, el) => h("div", { class: "field" }, h("span", null, rotulo), el);
export const campoInput = (rotulo, input) => h("label", { class: "field" }, h("span", null, rotulo), input);
const campoValor = input => h("label", { class: "amount" }, h("span", null, "R$"), input);
const inputValor = (id, centavos) =>
  h("input", { id, inputMode: "decimal", placeholder: "0,00", "aria-label": "Valor", value: valorParaCampo(centavos) });

const catsDo = grupo => st.cats.filter(c => c.grupo === grupo && !c.excluido);
const opcoesCats = grupo => catsDo(grupo).map(c => [c.id, c.nome]);
const opcoesInv = () => st.tiposInv.filter(c => !c.excluido).map(c => [c.id, c.nome]);
const opcoesPag = () => PAGAMENTOS.map(p => [p, p]);

/* ---------- Lançamento (gasto, entrada ou investimento) ---------- */

export function formLancamento(pre = {}, aoSalvar) {
  const f = { tipo: pre.tipo || "s", cat: pre.categoriaId || null, sub: pre.sub || null, pag: pre.pag || null };
  const grupo = t => (t === "s" ? "s" : t === "e" ? "e" : "i");

  const valor = inputValor("f-valor", pre.valor);
  const desc = h("input", { id: "f-desc", placeholder: "Ex.: feira do sábado", maxLength: 60, value: pre.desc || "" });
  const data = h("input", { id: "f-data", type: "date", value: pre.data || hoje() });
  const parcelas = h("input", { id: "f-parc", type: "number", min: 1, max: 48, value: 1, inputMode: "numeric" });
  const preview = h("span", { class: "hint" });
  const err = h("div", { class: "err", role: "alert" });
  const dyn = h("div", { class: "stack" });

  const nParcelas = () => Math.min(48, Math.max(1, parseInt(parcelas.value) || 1));
  function atualizaPreview() {
    const v = parseValor(valor.value);
    const n = nParcelas();
    const d1 = datasParcelas(data.value || hoje(), n)[0];
    const quanto = v > 0 ? `${n}x de ${brl(Math.floor(v / n))}` : `${n}x`;
    preview.textContent = `${quanto} · ${n > 1 ? "1ª parcela" : "cai"} em ${fmtData(d1)}` +
      (n > 1 ? " · a outra pessoa da casa também vê" : "");
  }
  [valor, parcelas, data].forEach(el => el.addEventListener("input", atualizaPreview));

  const explica = {
    i: "Sai do seu saldo do mês e soma no investido da casa.",
    r: "Volta para o seu saldo do mês e diminui o investido da casa.",
    a: "Só soma no investido da casa. Não mexe no seu saldo do mês."
  };

  function desenhar() {
    const g = grupo(f.tipo);
    const catObj = g !== "i" && st.cats.find(c => c.id === f.cat);
    atualizaPreview();
    dyn.replaceChildren(
      seg([["s", "Gasto"], ["e", "Entrada"], ["inv", "Investimento"]], g === "i" ? "inv" : f.tipo, v => {
        f.tipo = v === "inv" ? "i" : v; f.cat = null; f.sub = null; desenhar();
      }),
      g === "i" && seg([["i", "Aplicar"], ["r", "Resgatar"], ["a", "Já tinha"]], f.tipo, v => { f.tipo = v; desenhar(); }),
      g === "i" && h("p", { class: "hint" }, explica[f.tipo]),
      campo(g === "i" ? "Tipo de investimento" : "Categoria",
        chips(g === "i" ? opcoesInv() : opcoesCats(g), f.cat, x => { f.cat = x; f.sub = null; desenhar(); })),
      catObj && catObj.subs?.length > 0 &&
        campo("Detalhe", chips(catObj.subs.map(s => [s, s]), f.sub, x => { f.sub = f.sub === x ? null : x; desenhar(); })),
      f.tipo === "s" &&
        campo("Pago com", chips(opcoesPag(), f.pag, x => { f.pag = f.pag === x ? null : x; desenhar(); })),
      f.tipo === "s" && f.pag === "Crédito" &&
        campo("Parcelas", h("div", { class: "parc" }, parcelas, preview))
    );
  }

  const salvarBtn = h("button", { class: "save", type: "submit" }, "Salvar");
  const form = h("form", { class: "stack", autocomplete: "off" },
    campoValor(valor), dyn,
    campoInput("Descrição (opcional)", desc),
    campoInput("Data", data),
    err, salvarBtn);

  form.addEventListener("submit", e => {
    e.preventDefault();
    const v = parseValor(valor.value);
    if (!(v > 0)) { err.textContent = "Digite o valor, por exemplo 25,90."; valor.focus(); return; }
    if (!f.cat) { err.textContent = "Escolha uma categoria."; return; }
    if (!st.perfil?.casaId && "ira".includes(f.tipo)) { err.textContent = "Termine de configurar sua casa antes de investir."; return; }
    lancar({
      tipo: f.tipo, valor: v, categoriaId: f.cat, sub: f.sub, desc: desc.value.trim(),
      data: data.value || hoje(), pag: f.tipo === "s" ? f.pag : "", parcelas: nParcelas()
    });
    if (aoSalvar) aoSalvar();
    fecharSheet();
    const parcelado = f.tipo === "s" && f.pag === "Crédito" && nParcelas() > 1;
    toast(parcelado ? "Compra parcelada salva" :
      { s: "Gasto salvo", e: "Entrada salva", i: "Aplicação salva", r: "Resgate salvo", a: "Saldo investido salvo" }[f.tipo]);
  });

  desenhar();
  const titulos = { s: "Novo gasto", e: "Nova entrada", i: "Aplicar", r: "Resgatar", a: "Saldo que já tenho investido" };
  abrirSheet(titulos[f.tipo], form);
}

/* ---------- Gasto fixo agendado ---------- */

export function formFixo() {
  const f = { cat: null, sub: null, pag: null, modo: "sempre" };
  const nome = h("input", { id: "fx-nome", placeholder: "Ex.: Aluguel, Academia, Financiamento", maxLength: 50 });
  const valor = inputValor("fx-valor");
  const dia = h("input", { id: "fx-dia", type: "number", min: 1, max: 31, value: 10, inputMode: "numeric" });
  const inicio = h("input", { id: "fx-inicio", type: "month", value: mesHoje() });
  const qtd = h("input", { id: "fx-qtd", type: "number", min: 2, max: 360, value: 12, inputMode: "numeric" });
  const err = h("div", { class: "err", role: "alert" });
  const dyn = h("div", { class: "stack" });

  function desenhar() {
    const catObj = st.cats.find(c => c.id === f.cat);
    dyn.replaceChildren(
      campo("Categoria", chips(opcoesCats("s"), f.cat, x => { f.cat = x; f.sub = null; desenhar(); })),
      catObj && catObj.subs?.length > 0 &&
        campo("Detalhe", chips(catObj.subs.map(s => [s, s]), f.sub, x => { f.sub = f.sub === x ? null : x; desenhar(); })),
      campo("Pago com", chips(opcoesPag(), f.pag, x => { f.pag = f.pag === x ? null : x; desenhar(); })),
      campo("Repete", seg([["sempre", "Todo mês, sem fim"], ["parcelas", "Número de parcelas"]], f.modo, v => { f.modo = v; desenhar(); })),
      f.modo === "parcelas" && campoInput("Quantas parcelas", qtd)
    );
  }

  const form = h("form", { class: "stack", autocomplete: "off" },
    campoInput("Nome", nome), campoValor(valor), dyn,
    h("div", { class: "row2" }, campoInput("Dia do pagamento", dia), campoInput("A partir de", inicio)),
    err, h("button", { class: "save", type: "submit" }, "Agendar"));

  form.addEventListener("submit", e => {
    e.preventDefault();
    const v = parseValor(valor.value);
    if (!nome.value.trim()) { err.textContent = "Dê um nome, por exemplo Aluguel."; nome.focus(); return; }
    if (!(v > 0)) { err.textContent = "Digite o valor de cada mês."; valor.focus(); return; }
    if (!f.cat) { err.textContent = "Escolha uma categoria."; return; }
    salvarFixo({
      nome: nome.value.trim(), valor: v, categoriaId: f.cat, sub: f.sub || "", pag: f.pag || "",
      dia: Math.min(31, Math.max(1, parseInt(dia.value) || 1)),
      inicio: inicio.value || mesHoje(),
      parcelas: f.modo === "parcelas" ? Math.max(2, parseInt(qtd.value) || 2) : 0
    });
    fecharSheet(); toast("Gasto fixo agendado");
  });

  desenhar();
  abrirSheet("Novo gasto fixo", form);
}

/* ---------- Compra futura ---------- */

export function formFutura() {
  const f = { cat: null };
  const nome = h("input", { id: "fu-nome", placeholder: "Ex.: Geladeira nova", maxLength: 50 });
  const valor = inputValor("fu-valor");
  const quando = h("input", { id: "fu-quando", type: "month" });
  const obs = h("input", { id: "fu-obs", placeholder: "Ex.: esperar a Black Friday", maxLength: 80 });
  const err = h("div", { class: "err", role: "alert" });
  const dyn = h("div");
  const desenhar = () => dyn.replaceChildren(
    campo("Categoria", chips(opcoesCats("s"), f.cat, x => { f.cat = x; desenhar(); })));

  const form = h("form", { class: "stack", autocomplete: "off" },
    campoInput("O que quer comprar", nome), campoValor(valor), dyn,
    campoInput("Quando (opcional)", quando), campoInput("Observação (opcional)", obs),
    err, h("button", { class: "save", type: "submit" }, "Adicionar"));

  form.addEventListener("submit", e => {
    e.preventDefault();
    const v = parseValor(valor.value);
    if (!nome.value.trim()) { err.textContent = "Escreva o que quer comprar."; nome.focus(); return; }
    if (!(v > 0)) { err.textContent = "Digite um valor aproximado."; valor.focus(); return; }
    salvarFutura({ nome: nome.value.trim(), valor: v, categoriaId: f.cat, quando: quando.value || "", obs: obs.value.trim() });
    fecharSheet(); toast("Compra futura adicionada");
  });

  desenhar();
  abrirSheet("Nova compra futura", form);
}
