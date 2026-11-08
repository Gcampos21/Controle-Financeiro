/* Funções auxiliares usadas no app todo (datas, valores, criação de elementos) */

export const $ = id => document.getElementById(id);

/* Cria elementos: h("div", {class:"x", onclick:fn}, "texto", outroElemento) */
export function h(tag, attrs, ...filhos) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "style") el.style.cssText = v;
      else if (k in el) el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const f of filhos.flat(Infinity)) {
    if (f == null || f === false) continue;
    el.append(f instanceof Node ? f : String(f));
  }
  return el;
}

export const pad = n => String(n).padStart(2, "0");
export const brl = c => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const mesHoje = () => hoje().slice(0, 7);

/* Ajusta ano/mês quando o mês passa de 12 ou fica abaixo de 1 */
export function normYM(y, m) {
  y += Math.floor((m - 1) / 12);
  m = (((m - 1) % 12) + 12) % 12 + 1;
  return [y, m];
}
/* Data "AAAA-MM-DD", usando o último dia do mês se o dia não existir (ex.: 31 em fevereiro) */
export function isoDe(y, m, d) {
  [y, m] = normYM(y, m);
  const ultimo = new Date(y, m, 0).getDate();
  return `${y}-${pad(m)}-${pad(Math.min(d, ultimo))}`;
}
export function addMeses(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return isoDe(y, m + n, d);
}
export function addMesKey(mk, n) {
  const [y, m] = mk.split("-").map(Number);
  const [ny, nm] = normYM(y, m + n);
  return `${ny}-${pad(nm)}`;
}
export function mesesEntre(a, b) {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

export function nomeMes(mk) {
  const [y, m] = mk.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(" de ", " ");
}
export function nomeMesCurto(mk) {
  const [y, m] = mk.split("-").map(Number);
  const mes = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return `${mes[0].toUpperCase() + mes.slice(1)}/${String(y).slice(2)}`;
}
export function fmtData(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/* Converte "1.234,56" / "25,9" / "25.90" em centavos */
export function parseValor(s) {
  s = String(s || "").trim().replace(/\s|R\$/g, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return Math.round(parseFloat(s) * 100);
}
export const valorParaCampo = c => c ? (c / 100).toFixed(2).replace(".", ",") : "";

let _toastT;
export function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(_toastT);
  _toastT = setTimeout(() => (t.hidden = true), 2000);
}
