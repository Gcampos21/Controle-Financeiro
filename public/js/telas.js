/* As 5 abas do menu. Cada função devolve uma lista de elementos para mostrar. */

import { h, brl, hoje, mesHoje, addMesKey, mesesEntre, nomeMes, nomeMesCurto, fmtData, toast } from "./util.js";
import {
  st, atualizarTela, mudarMes, nomeCat, nomePessoa, itensDoMes, totais, fixosDoMes, faturaDoMes,
  parcelamentosAtivos, resumoInvestimentos, pagarFixo, excluir, restaurar, apagarDeVez, itensLixeira,
  salvarCartao, addCategoria, addTipoInv, mudarSubs, exportarTudo, importarBackup, codigoBonito
} from "./dados.js";
import { abrirSheet, fecharSheet, formLancamento, formFixo, formFutura, campoInput } from "./formularios.js";
import { sair } from "./app.js";

let aberto = null;   // lançamento com as opções abertas
export const fecharOpcoes = () => { aberto = null; };

/* ---------- Peças comuns ---------- */

const secao = (titulo, acao, ...conteudo) =>
  h("section", { class: "section" },
    h("div", { class: "sec-head" }, h("h2", null, titulo), acao || null),
    ...conteudo);

const vazio = (titulo, texto) => h("div", { class: "empty" }, h("b", null, titulo), h("span", null, texto));
const carregando = () => h("div", { class: "empty" }, h("span", null, "Carregando…"));

/* Botão que pede um segundo toque para confirmar */
function botaoConfirmar(rotulo, rotuloConfirma, acao, classe = "mini") {
  let armado = false, t;
  const b = h("button", { type: "button", class: classe }, rotulo);
  b.onclick = () => {
    if (armado) { clearTimeout(t); acao(); return; }
    armado = true; b.textContent = rotuloConfirma; b.classList.add("kill");
    t = setTimeout(() => { armado = false; b.textContent = rotulo; b.classList.remove("kill"); }, 4000);
  };
  return b;
}

function barras(itens, total, classe = "") {
  const max = Math.max(...itens.map(x => x[1]), 1);
  return h("div", { class: "card cats" }, itens.map(([nome, v]) =>
    h("div", { class: "cat" },
      h("span", null, nome),
      h("span", { class: "num" }, `${brl(v)}${total > 0 ? " · " + Math.round(v / total * 100) + "%" : ""}`),
      h("div", { class: "bar" }, h("i", { class: classe, style: `width:${Math.max(0, v / max * 100)}%` })))));
}

const SINAL = { s: "− ", i: "− ", e: "+ ", r: "+ ", a: "" };
const CLASSE = { s: "s", i: "inv", e: "e", r: "e", a: "inv" };
const nomeCatDe = l => nomeCat(l.categoriaId) || l.categoriaNome || "Sem categoria";

function linhaLanc(l, { mostrarAutor = false } = {}) {
  const cat = nomeCatDe(l);
  const sub = [
    mostrarAutor ? nomePessoa(l.autor) : null,
    l.desc ? cat : null, l.sub || null, l.pag || null, l.parc ? `parcela ${l.parc}` : null,
    l.tipo === "r" ? "resgate" : null, l.tipo === "a" ? "saldo que já tinha" : null
  ].filter(Boolean).join(" · ");
  const linha = h("button", { type: "button", class: "item", onclick: () => { aberto = aberto === l.id ? null : l.id; atualizarTela(); } },
    h("span", { class: `dot ${CLASSE[l.tipo]}` }, cat[0]),
    h("span", { class: "t" }, h("span", null, l.desc || cat), h("span", null, sub)),
    h("span", { class: "vcol" },
      h("span", { class: `v num ${CLASSE[l.tipo]}` }, SINAL[l.tipo] + brl(l.valor)),
      l.data > hoje() ? h("span", { class: "pill" }, "a vencer") : null));
  if (aberto !== l.id) return [linha];

  const meu = !l.autor || l.autor === st.uid;
  const fechar = () => { aberto = null; atualizarTela(); };
  const acoes = h("div", { class: "item acoes" },
    h("button", { type: "button", class: "mini", onclick: fechar }, meu ? "Cancelar" : "Fechar"),
    !meu ? h("span", { class: "hint" }, `Lançado por ${nomePessoa(l.autor)}. Só quem lançou pode apagar.`)
      : l.parcelamentoId
        ? botaoConfirmar("Apagar a compra parcelada", "Confirmar: vai para a lixeira", () => {
            excluir("parcelamentos", l.parcelamentoId); fechar(); toast("Compra parcelada foi para a lixeira");
          })
        : botaoConfirmar("Apagar", "Confirmar: vai para a lixeira", () => {
            excluir(l.colecao || "lancamentos", l.id); fechar(); toast("Foi para a lixeira");
          }));
  return [linha, acoes];
}

function listaPorDia(lista) {
  const ord = [...lista].sort((a, b) => b.data.localeCompare(a.data) || (b.criadoLocal || 0) - (a.criadoLocal || 0));
  const dias = {};
  ord.forEach(l => (dias[l.data] = dias[l.data] || []).push(l));
  return Object.entries(dias).map(([dia, ls]) => {
    const [y, m, d] = dia.split("-").map(Number);
    const rot = dia === hoje() ? "Hoje" : new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric" });
    return [h("div", { class: "day" }, rot), h("div", { class: "list" }, ls.flatMap(l => linhaLanc(l)))];
  });
}

function avisoBackup() {
  const ult = st.perfil?.ultimoBackup;
  const dias = ult ? Math.floor((Date.now() - ult) / 86400000) : null;
  if (dias !== null && dias < 30) return null;
  return h("div", { class: "notice" },
    h("span", null, dias === null ? "Você ainda não fez nenhuma cópia de segurança." : `Sua última cópia de segurança foi há ${dias} dias.`),
    h("button", { type: "button", class: "mini go", onclick: fazerBackup }, "Fazer agora"));
}

/* ---------- Mês ---------- */

export function telaMes() {
  const mk = st.mesSel;
  const itens = itensDoMes(mk);
  const t = totais(itens);
  const fx = fixosDoMes(mk);
  const pend = fx.filter(x => !x.pago);
  const aPagar = pend.reduce((a, x) => a + x.f.valor, 0);
  const porCat = {};
  itens.filter(l => l.tipo === "s").forEach(l => { const c = nomeCatDe(l); porCat[c] = (porCat[c] || 0) + l.valor; });
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);

  return [
    h("div", { class: "top" },
      h("div", { class: "brand" }, `Olá, ${st.perfil?.nome || ""}`),
      h("div", { class: "month" },
        h("button", { type: "button", "aria-label": "Mês anterior", onclick: () => mudarMes(addMesKey(mk, -1)) }, "‹"),
        h("span", { class: "num" }, nomeMes(mk)),
        h("button", { type: "button", "aria-label": "Próximo mês", onclick: () => mudarMes(addMesKey(mk, 1)) }, "›"))),

    avisoBackup(),

    h("section", { class: "hero" },
      h("div", null, h("small", null, "Seu saldo do mês"), h("div", { class: "saldo num" }, brl(t.saldo))),
      h("div", { class: "split" },
        h("div", null, h("small", null, "Entrou"), h("b", { class: "num" }, brl(t.e))),
        h("div", null, h("small", null, "Saiu"), h("b", { class: "num" }, brl(t.s))),
        h("div", null, h("small", null, "Investiu"), h("b", { class: "num" }, brl(t.investiu)))),
      pend.length > 0 && h("div", { class: "prev num" },
        `Fixos a pagar: ${brl(aPagar)} · Saldo previsto: ${brl(t.saldo - aPagar)}`)),

    h("div", { class: "actions" },
      h("button", { type: "button", class: "btn out", onclick: () => formLancamento({ tipo: "s" }) }, h("span", { class: "plus" }, "−"), " Gasto"),
      h("button", { type: "button", class: "btn in", onclick: () => formLancamento({ tipo: "e" }) }, h("span", { class: "plus" }, "+"), " Entrada")),

    fx.length > 0 && secao("Gastos fixos do mês", null,
      h("div", { class: "list" }, fx.map(({ f, k, pago }) =>
        h("div", { class: "item static" },
          h("span", { class: "dot s" }, f.dia),
          h("span", { class: "t" }, h("span", null, f.nome),
            h("span", null, [`dia ${f.dia}`, f.parcelas ? `parcela ${k} de ${f.parcelas}` : "todo mês", nomeCat(f.categoriaId)].filter(Boolean).join(" · "))),
          h("span", { class: "vcol" },
            h("span", { class: "v num" }, brl(f.valor)),
            pago ? h("span", { class: "pill ok" }, "pago")
                 : h("button", { type: "button", class: "mini go", onclick: () => { pagarFixo(f, mk); toast(`${f.nome} pago`); } }, "Pagar")))))),

    cats.length > 0 && secao("Para onde foi o dinheiro", null, barras(cats, t.s, "s")),

    secao("Lançamentos", null,
      !st.pronto.lancMes ? carregando()
        : itens.length ? listaPorDia(itens)
        : vazio("Nada lançado neste mês", "Toque em Gasto ou Entrada para registrar o primeiro."))
  ];
}

/* ---------- Cartão ---------- */

export function telaCartao() {
  const c = st.perfil?.cartao || { fecha: 0, vence: 10 };
  const fecha = h("input", { id: "c-fecha", type: "number", min: 0, max: 31, value: c.fecha, inputMode: "numeric" });
  const vence = h("input", { id: "c-vence", type: "number", min: 1, max: 31, value: c.vence, inputMode: "numeric" });
  const guardar = () => {
    salvarCartao(Math.min(31, Math.max(0, parseInt(fecha.value) || 0)), Math.min(31, Math.max(1, parseInt(vence.value) || 1)));
    toast("Datas do cartão salvas");
  };
  fecha.onchange = guardar; vence.onchange = guardar;

  const meses = Array.from({ length: 6 }, (_, i) => addMesKey(mesHoje(), i));
  const faturas = meses.map(mk => [nomeMesCurto(mk), faturaDoMes(mk)]);
  const ativos = parcelamentosAtivos();
  const porPessoa = {};
  ativos.forEach(p => (porPessoa[p.autor] = (porPessoa[p.autor] || 0) + p.restante));

  return [
    h("div", { class: "top" }, h("div", { class: "brand" }, "Cartão de crédito")),
    h("button", { type: "button", class: "btn out wide", onclick: () => formLancamento({ tipo: "s", pag: "Crédito" }) },
      h("span", { class: "plus" }, "+"), " Compra no crédito"),

    secao("Suas próximas faturas", null, barras(faturas, 0, "s")),

    secao("Parcelamentos da casa", null,
      Object.keys(porPessoa).length > 0 && h("div", { class: "chips" },
        Object.entries(porPessoa).map(([u, v]) => h("span", { class: "chip static num" }, `${nomePessoa(u)}: falta ${brl(v)}`))),
      !st.pronto.parc ? carregando()
        : ativos.length
        ? h("div", { class: "list" }, ativos.map(p =>
            h("div", { class: "item static col" },
              h("div", { class: "rowline" },
                h("span", { class: "t" },
                  h("span", null, p.desc || nomeCat(p.categoriaId) || p.categoriaNome),
                  h("span", null, `${nomePessoa(p.autor)} · ${p.n}x de ${brl(p.parcelas[p.n - 1].valor)} · total ${brl(p.valorTotal)}`)),
                p.autor === st.uid
                  ? botaoConfirmar("Apagar", "Confirmar", () => { excluir("parcelamentos", p.id); toast("Compra parcelada foi para a lixeira"); })
                  : null),
              h("div", { class: "bar" }, h("i", { class: "s", style: `width:${p.pagas / p.n * 100}%` })),
              h("span", { class: "hint num" },
                `${p.pagas} de ${p.n} pagas · faltam ${brl(p.restante)} · última em ${nomeMesCurto(p.ultima.slice(0, 7))}`))))
        : vazio("Nenhum parcelamento", "Lance uma compra com Pago com: Crédito e escolha 2 ou mais parcelas. Vocês dois veem os parcelamentos aqui.")),

    secao("Datas do seu cartão", null,
      h("div", { class: "card stack" },
        h("div", { class: "row2" }, campoInput("Dia do fechamento", fecha), campoInput("Dia do vencimento", vence)),
        h("p", { class: "hint" },
          "Com o fechamento preenchido, cada compra no crédito cai na data de vencimento da fatura certa. ",
          "Deixe o fechamento em 0 para registrar na data da compra.")))
  ];
}

/* ---------- Planejar ---------- */

export function telaPlanejar() {
  const mk = mesHoje();
  const fixos = st.fixos.filter(f => !f.excluido).sort((a, b) => a.dia - b.dia);
  const futuras = st.futuras.filter(f => !f.excluido);
  const totalFut = futuras.reduce((a, f) => a + f.valor, 0);

  return [
    h("div", { class: "top" }, h("div", { class: "brand" }, "Planejar")),

    secao("Gastos fixos agendados",
      h("button", { type: "button", class: "mini go", onclick: formFixo }, "+ Novo"),
      fixos.length
        ? h("div", { class: "list" }, fixos.map(f => {
            const k = mesesEntre(f.inicio, mk) + 1;
            const status = k < 1 ? `começa em ${nomeMesCurto(f.inicio)}`
              : f.parcelas ? (k > f.parcelas ? "terminou" : `parcela ${k} de ${f.parcelas}`)
              : "todo mês";
            return h("div", { class: "item static" },
              h("span", { class: "dot s" }, f.dia),
              h("span", { class: "t" }, h("span", null, f.nome),
                h("span", null, [`dia ${f.dia}`, status, nomeCat(f.categoriaId)].filter(Boolean).join(" · "))),
              h("span", { class: "vcol" }, h("span", { class: "v num" }, brl(f.valor)),
                botaoConfirmar("Remover", "Confirmar", () => { excluir("fixos", f.id); toast("Gasto fixo foi para a lixeira"); })));
          }))
        : vazio("Nenhum gasto fixo", "Agende aluguel, condomínio, academia, financiamento… Eles aparecem todo mês na aba Mês para você marcar como pago.")),

    secao("Compras futuras",
      h("button", { type: "button", class: "mini go", onclick: formFutura }, "+ Nova"),
      futuras.length > 0 && h("p", { class: "hint num" }, `Total planejado: ${brl(totalFut)}`),
      futuras.length
        ? h("div", { class: "list" }, futuras.map(f =>
            h("div", { class: "item static col" },
              h("div", { class: "rowline" },
                h("span", { class: "t" }, h("span", null, f.nome),
                  h("span", null, [nomeCat(f.categoriaId), f.quando ? `para ${nomeMesCurto(f.quando)}` : null, f.obs || null].filter(Boolean).join(" · "))),
                h("span", { class: "v num" }, brl(f.valor))),
              h("div", { class: "acts" },
                botaoConfirmar("Remover", "Confirmar", () => excluir("futuras", f.id)),
                h("button", { type: "button", class: "mini go", onclick: () =>
                  formLancamento({ tipo: "s", valor: f.valor, categoriaId: f.categoriaId, desc: f.nome },
                    () => excluir("futuras", f.id)) }, "Comprei")))))
        : vazio("Nenhuma compra planejada", "Anote o que pretende comprar para ir se preparando. Quando comprar, toque em Comprei."))
  ];
}

/* ---------- Investir ---------- */

export function telaInvestir() {
  const { total, porTipo, porPessoa } = resumoInvestimentos();
  const tipos = Object.entries(porTipo).filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
  const mk = mesHoje();
  const doMes = st.inv.filter(i => !i.excluido && i.mes === mk);
  const aplicado = doMes.filter(i => i.tipo === "i").reduce((a, i) => a + i.valor, 0);
  const resgatado = doMes.filter(i => i.tipo === "r").reduce((a, i) => a + i.valor, 0);
  const movs = st.inv.filter(i => !i.excluido)
    .sort((a, b) => b.data.localeCompare(a.data) || (b.criadoLocal || 0) - (a.criadoLocal || 0)).slice(0, 25)
    .map(i => ({ ...i, categoriaNome: i.tipoInvNome, colecao: "investimentos" }));

  return [
    h("div", { class: "top" }, h("div", { class: "brand" }, "Investimentos da casa")),
    h("section", { class: "hero inv" },
      h("div", null, h("small", null, "Total investido"), h("div", { class: "saldo num" }, brl(total))),
      h("div", { class: "split" },
        Object.entries(porPessoa).map(([u, v]) => h("div", null, h("small", null, nomePessoa(u)), h("b", { class: "num" }, brl(v)))),
        h("div", null, h("small", null, "Aplicado no mês"), h("b", { class: "num" }, brl(aplicado - resgatado))))),
    h("div", { class: "actions three" },
      h("button", { type: "button", class: "btn inv", onclick: () => formLancamento({ tipo: "i" }) }, "Aplicar"),
      h("button", { type: "button", class: "btn in", onclick: () => formLancamento({ tipo: "r" }) }, "Resgatar"),
      h("button", { type: "button", class: "btn ghost", onclick: () => formLancamento({ tipo: "a" }) }, "Já tenho")),
    secao("Onde está o dinheiro", null,
      !st.pronto.inv ? carregando()
        : tipos.length ? barras(tipos, total, "inv")
        : vazio("Nada investido ainda", "Use Já tenho para informar o que já está aplicado, e Aplicar para cada novo aporte.")),
    movs.length > 0 && secao("Últimas movimentações", null,
      h("div", { class: "list" }, movs.flatMap(l => linhaLanc(l, { mostrarAutor: true }))))
  ];
}

/* ---------- Ajustes ---------- */

export function telaAjustes() {
  const membros = st.casa?.membros || [];

  const blocoCats = (titulo, itens, aoAdicionar, colecao, comDetalhes) => {
    const novo = h("input", { placeholder: "Nova categoria", maxLength: 30, "aria-label": `Nova categoria em ${titulo}` });
    const adicionar = () => {
      const n = novo.value.trim();
      if (!n) return;
      if (itens.some(c => c.nome.toLowerCase() === n.toLowerCase())) { toast("Essa categoria já existe."); return; }
      aoAdicionar(n); novo.value = ""; toast("Categoria adicionada");
    };
    novo.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } };

    return secao(titulo, null,
      h("div", { class: "list" }, itens.map(c => {
        const nsub = comDetalhes && h("input", { class: "small-in", placeholder: "+ detalhe", maxLength: 25, enterKeyHint: "done", "aria-label": `Novo detalhe em ${c.nome}` });
        if (nsub) nsub.onkeydown = e => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const v = nsub.value.trim();
          if (v && !(c.subs || []).includes(v)) mudarSubs(c, [...(c.subs || []), v]);
        };
        return h("div", { class: "item static col" },
          h("div", { class: "rowline" }, h("b", null, c.nome),
            botaoConfirmar("Remover", "Confirmar", () => excluir(colecao, c.id))),
          comDetalhes && h("div", { class: "chips" },
            (c.subs || []).map(s => h("span", { class: "chip static" }, s,
              h("button", { type: "button", class: "chip-x", "aria-label": `Remover ${s}`, onclick: () => mudarSubs(c, c.subs.filter(x => x !== s)) }, "×"))),
            nsub));
      })),
      h("div", { class: "addrow" }, novo, h("button", { type: "button", class: "mini go", onclick: adicionar }, "Adicionar")));
  };

  const ativosDo = g => st.cats.filter(c => c.grupo === g && !c.excluido);

  return [
    h("div", { class: "top" }, h("div", { class: "brand" }, "Ajustes")),

    secao("Sua casa", null,
      h("div", { class: "card stack" },
        h("div", { class: "rowline" },
          h("span", { class: "t" }, h("span", null, "Código da casa"), h("span", null, "Passe para a outra pessoa entrar")),
          h("b", { class: "code num" }, codigoBonito(st.perfil?.casaId))),
        h("p", { class: "hint" },
          membros.length < 2 ? "Só você por enquanto. A outra pessoa cria a conta dela e escolhe Tenho um código."
            : "Membros: " + membros.map(nomePessoa).join(" e ") + "."),
        h("p", { class: "hint" }, "Compartilhado: compras parceladas e investimentos. Separado: gastos, entradas, fixos e compras futuras."))),

    secao("Cópia de segurança", null,
      h("div", { class: "card stack" },
        h("p", { class: "hint" },
          "Seus dados ficam na nuvem e numa cópia neste celular. Para ter mais uma cópia, exporte um arquivo uma vez por mês e guarde no Google Drive ou no iCloud."),
        st.perfil?.ultimoBackup && h("p", { class: "hint" }, `Última cópia: ${new Date(st.perfil.ultimoBackup).toLocaleDateString("pt-BR")}`),
        h("div", { class: "addrow" },
          h("button", { type: "button", class: "mini go", onclick: fazerBackup }, "Exportar cópia"),
          h("button", { type: "button", class: "mini", onclick: escolherBackup }, "Restaurar cópia"),
          h("button", { type: "button", class: "mini", onclick: abrirLixeira }, "Lixeira")))),

    blocoCats("Tipos de gasto", ativosDo("s"), n => addCategoria("s", n), "categorias", true),
    blocoCats("Tipos de entrada", ativosDo("e"), n => addCategoria("e", n), "categorias", true),
    blocoCats("Tipos de investimento (da casa)", st.tiposInv.filter(c => !c.excluido), addTipoInv, "tiposInvestimento", false),

    secao("Conta", null,
      h("div", { class: "card stack" },
        h("p", { class: "hint" }, "Ao sair, a cópia local deste celular é mantida e volta quando você entrar de novo."),
        h("div", { class: "addrow" }, h("button", { type: "button", class: "mini danger", onclick: sair }, "Sair da conta"))))
  ];
}

/* ---------- Backup e lixeira ---------- */

async function fazerBackup() {
  toast("Preparando a cópia…");
  try {
    const dados = await exportarTudo();
    const nome = `controle-financeiro-${hoje()}.json`;
    const arquivo = new File([JSON.stringify(dados, null, 2)], nome, { type: "application/json" });
    // No celular, abre o menu de compartilhar (salvar no Drive, Arquivos, e-mail…)
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      try { await navigator.share({ files: [arquivo], title: "Cópia do Controle Financeiro" }); toast("Cópia pronta"); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    const a = h("a", { href: URL.createObjectURL(arquivo), download: nome });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("Cópia baixada");
  } catch (e) {
    console.error(e);
    toast("Não deu para gerar a cópia. Precisa de internet para ela sair completa.");
  }
}

function escolherBackup() {
  const arquivo = h("input", { type: "file", accept: "application/json,.json", hidden: true });
  document.body.append(arquivo);
  arquivo.onchange = async () => {
    const f = arquivo.files[0];
    arquivo.remove();
    if (!f) return;
    try {
      const { novos, jaExistiam } = await importarBackup(JSON.parse(await f.text()));
      toast(novos === 0 ? "Nada novo: tudo dessa cópia já estava no app."
        : `Cópia restaurada: ${novos} itens novos` + (jaExistiam ? ` (${jaExistiam} já existiam e não foram mexidos)` : ""));
    } catch (e) {
      console.error(e);
      toast(e.code === "formato" ? "Esse arquivo não é uma cópia deste app." : "Não deu para restaurar. Confira a conexão.");
    }
  };
  arquivo.click();
}

async function abrirLixeira() {
  const corpo = h("div", { class: "stack" }, carregando());
  abrirSheet("Lixeira", corpo);
  const desenhar = async () => {
    let itens;
    try { itens = await itensLixeira(); }
    catch (e) { corpo.replaceChildren(vazio("Não deu para abrir a lixeira", "Confira a conexão e tente de novo.")); return; }
    corpo.replaceChildren(
      h("p", { class: "hint" }, "Itens apagados ficam aqui até você apagar de vez."),
      itens.length
        ? h("div", { class: "list" }, itens.map(i =>
            h("div", { class: "item static col" },
              h("div", { class: "rowline" },
                h("span", { class: "t" }, h("span", null, i.titulo || "Sem nome"),
                  h("span", null, [i.detalhe, i.quando ? `apagado em ${new Date(i.quando).toLocaleDateString("pt-BR")}` : null].filter(Boolean).join(" · "))),
                i.valor != null && h("span", { class: "v num" }, brl(i.valor))),
              h("div", { class: "acts" },
                botaoConfirmar("Apagar de vez", "Confirmar: não tem volta", () => { apagarDeVez(i.colecao, i.id); setTimeout(desenhar, 300); }),
                h("button", { type: "button", class: "mini go", onclick: () => { restaurar(i.colecao, i.id); toast("Restaurado"); setTimeout(desenhar, 300); } }, "Restaurar")))))
        : vazio("Lixeira vazia", "Nada foi apagado."));
  };
  desenhar();
}

export { fecharSheet };
