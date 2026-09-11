/* Servidor MOCK de la API de Mermas Mango (solo para desarrollo/pruebas del front).
   NO es el backend real: guarda todo en memoria y no valida firmas JWT.
   Implementa: /auth/register, /auth/login (form-urlencoded), /auth/me, /mermas,
   /productos, /tipos-merma, /variedades y /caracteristicas (todos cuelgan de un producto;
   el tipo de merma es un catalogo con bandera `aprovechable`, ya no un enum de dos valores),
   y /lineas y /contenedores (globales). La merma lleva id_linea, y el peso va como cant_kg
   (neto) o como peso_bruto_kg + id_contenedor (se resta la tara y se copia en el registro).
   Uso: node scripts/mock-api.mjs   (escucha en http://127.0.0.1:8000)
*/
import http from "node:http";

const PORT = process.env.PORT || 8013;
const users = new Map();          // username -> { id_usuario, password, rol, activo }
let userSeq = 0;
function addUser(username, password, rol) { userSeq++; users.set(username, { id_usuario: userSeq, password, rol, activo: true }); return users.get(username); }
addUser("admin", "admin123", "admin"); // admin inicial (como el .env)
let seq = 0;
const registros = [];             // registros de merma

// Catalogos editables (/productos, /variedades y /caracteristicas). Lectura: cualquiera; escritura: solo admin.
// Cada variedad pertenece a un producto; una caracteristica con id_producto null aplica a todos.
// Tipos de merma: catalogo con bandera. id_producto null = aplica a todos.
let tipoSeq = 0;
const tiposMerma = [];
function addTipo(nombre, aprovechable, idProducto) { tipoSeq++; const t = { id: tipoSeq, nombre, activo: true, aprovechable: !!aprovechable, id_producto: idProducto ?? null, producto: idProducto ? prodNombre(idProducto) : null }; tiposMerma.push(t); return t; }
function tipoDe(id) { return id == null ? null : tiposMerma.find((t) => t.id === Number(id)) || null; }

let prodSeq = 0;
const productos = [];
function addProd(nombre, etiqueta) {
  prodSeq++;
  const p = { id: prodSeq, nombre, activo: true, etiqueta_no_aprovechable: etiqueta };
  productos.push(p);
  // Igual que el backend real: al dar de alta el producto se le crea su tipo no aprovechable.
  addTipo(etiqueta, false, p.id);
  return p;
}
addProd("Mango", "Cascara y Hueso");
addProd("Naranja", "Cascara");

let catSeq = 0;
const catalogos = { variedades: [], caracteristicas: [] };
function addCat(tipo, nombre, idProducto) { catSeq++; const it = { id: catSeq, nombre, activo: true, id_producto: idProducto ?? null }; catalogos[tipo].push(it); return it; }
addTipo("Aprovechable", true, null);   // global: sirve para todos los productos
["KEITT", "KENT", "TOMMY", "HADEN"].forEach((n) => addCat("variedades", n, 1));
["VALENCIA", "NAVEL"].forEach((n) => addCat("variedades", n, 2));
["Sobremaduro", "Maduro", "Verde", "Aguado"].forEach((n) => addCat("caracteristicas", n, null));
addCat("caracteristicas", "Sin cascara", 2);   // exclusiva de naranja

// Lineas y contenedores: globales, no cuelgan de un producto. Nombre unico sin distinguir mayusculas.
let lineaSeq = 0, contSeq = 0;
const lineas = [];
const contenedores = [];
function addLinea(nombre) { lineaSeq++; const l = { id: lineaSeq, nombre, activo: true }; lineas.push(l); return l; }
function addContenedor(nombre, pesoKg) { contSeq++; const c = { id: contSeq, nombre, peso_kg: fmt(pesoKg), activo: true }; contenedores.push(c); return c; }
["L1", "L2", "L3", "L4"].forEach((n) => addLinea(n));
addContenedor("Caja chica", 2.5);
addContenedor("Tina", 8);

/**
 * Pesos de una merma pesada en contenedor, como el backend real: neto = bruto - tara.
 * `taraCopiada` es la que guardo el registro al capturarse: se respeta si no cambia el contenedor.
 */
function pesosConTara(bruto, idContenedor, taraCopiada) {
  const c = contenedores.find((x) => x.id === Number(idContenedor)) || null;
  if (taraCopiada == null) {
    if (!c) return { error: `El contenedor ${idContenedor} no existe.` };
    if (!c.activo) return { error: `El contenedor '${c.nombre}' esta inactivo.` };
  }
  const tara = Number(taraCopiada ?? c.peso_kg);
  const b = Number(bruto);
  if (b < tara) return { error: `El peso bruto (${fmt(b)} kg) es menor que la tara del contenedor '${c ? c.nombre : ""}' (${fmt(tara)} kg).` };
  return { cant_kg: fmt(b - tara), peso_bruto_kg: fmt(b), tara_kg: fmt(tara), id_contenedor: Number(idContenedor), contenedor: c ? c.nombre : null };
}

function catNombre(tipo, id) {
  if (id == null) return null;
  const it = catalogos[tipo].find((x) => x.id === Number(id));
  return it ? it.nombre : null;
}
function prodDe(id) { return id == null ? null : productos.find((p) => p.id === Number(id)) || null; }
function prodNombre(id) { const p = prodDe(id); return p ? p.nombre : null; }

/** Las tres invariantes del backend: producto valido, variedad del producto y caracteristica aplicable. */
function validarCombinacion(idProducto, idTipo, idVariedad, idCaracteristica) {
  const prod = prodDe(idProducto);
  if (!prod) return "El producto es obligatorio y debe existir.";
  if (!prod.activo) return `El producto '${prod.nombre}' esta inactivo.`;
  const tipo = tipoDe(idTipo);
  if (!tipo) return "El tipo de merma es obligatorio y debe existir.";
  if (tipo.id_producto != null && tipo.id_producto !== prod.id) return `El tipo '${tipo.nombre}' es exclusivo de '${prodNombre(tipo.id_producto)}', no aplica a '${prod.nombre}'.`;
  if (!tipo.aprovechable && idCaracteristica != null) return `La caracteristica solo aplica a los tipos aprovechables; '${tipo.nombre}' es un residuo.`;
  if (idVariedad != null) {
    const v = catalogos.variedades.find((x) => x.id === Number(idVariedad));
    if (!v) return "La variedad no existe.";
    if (v.id_producto !== prod.id) return `La variedad '${v.nombre}' pertenece a '${prodNombre(v.id_producto)}', no a '${prod.nombre}'.`;
  }
  if (idCaracteristica != null) {
    const c = catalogos.caracteristicas.find((x) => x.id === Number(idCaracteristica));
    if (!c) return "La caracteristica no existe.";
    if (c.id_producto != null && c.id_producto !== prod.id) return `La caracteristica '${c.nombre}' es exclusiva de '${prodNombre(c.id_producto)}', no aplica a '${prod.nombre}'.`;
  }
  return null;
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
// Igual que el back real: el token solo lleva sub y exp (el rol se consulta en /auth/me).
function makeToken(username) {
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600; // 12 h
  return b64url({ alg: "HS256", typ: "JWT" }) + "." + b64url({ sub: username, exp }) + ".mock";
}
// Devuelve { username, rol } o null (el rol se toma de la "BD", no del token).
function readToken(req) {
  const h = req.headers["authorization"] || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const p = JSON.parse(Buffer.from(m[1].split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    if (p.exp && p.exp * 1000 < Date.now()) return null;
    const u = users.get(p.sub);
    if (!u || !u.activo) return null;
    return { username: p.sub, rol: u.rol };
  } catch { return null; }
}

function send(res, code, body) {
  const data = body == null ? "" : JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  });
  res.end(data);
}
function fmt(n) { return Number(n).toFixed(6); }
// El sistema guarda siempre kg; lb solo convierte al devolver.
const LB_POR_KG = 2.20462262185;
function uni(v) { return v === "lb" ? "lb" : "kg"; }
function conv(kg, u) { return u === "lb" ? kg * LB_POR_KG : kg; }

// Regla unificada en los tres endpoints: "YYYY-MM-DD" se extiende al dia completo,
// "YYYY-MM-DDTHH:MM[:SS]" se respeta exacto (util para cortes por turno).
function nDesde(v) { return v.includes("T") ? (v.length === 16 ? v + ":00" : v) : v + "T00:00:00"; }
function nHasta(v) { return v.includes("T") ? (v.length === 16 ? v + ":59" : v) : v + "T23:59:59"; }
function enRango(f, desde, hasta) {
  f = f || "";
  if (desde && f < nDesde(desde)) return false;
  if (hasta && f > nHasta(hasta)) return false;
  return true;
}

/** Reporte agrupado por producto + lote + linea en un rango (usado por /reporte y /reporte/hoy). */
function buildReporte(registros, desde, hasta, unidad, idProducto) {
  const u = uni(unidad);
  let src = registros.filter((r) => enRango(r.fecha_hora, desde, hasta));
  if (idProducto) src = src.filter((r) => Number(r.id_producto) === Number(idProducto));
  const map = {};
  let tA = 0, tC = 0, tN = 0;
  src.forEach((r) => {
    const linea = r.linea_prod || "";
    const clave = (r.id_producto ?? "") + "|" + r.lote + "|" + linea;
    const g = map[clave] || (map[clave] = { idProd: r.id_producto ?? null, prod: r.producto ?? null, lote: r.lote, idLinea: r.id_linea ?? null, linea, a: 0, c: 0, n: 0, vars: new Set(), cars: new Set(), tipos: {} });
    if (r.variedad) g.vars.add(r.variedad);
    if (r.caracteristica) g.cars.add(r.caracteristica);
    const kg = conv(+r.cant_kg, u);
    if (r.aprovechable) { g.a += kg; tA += kg; } else { g.c += kg; tC += kg; }
    const t = g.tipos[r.id_tipo_merma] || (g.tipos[r.id_tipo_merma] = { id_tipo_merma: r.id_tipo_merma, tipo_merma: r.tipo_merma, aprovechable: r.aprovechable, _n: 0 });
    t._n += kg;
    g.n++; tN++;
  });
  const lotes = Object.keys(map).sort().map((k) => {
    const g = map[k];
    const por_tipo = Object.values(g.tipos).map((t) => ({ id_tipo_merma: t.id_tipo_merma, tipo_merma: t.tipo_merma, aprovechable: t.aprovechable, cant: fmt(t._n) }));
    return { id_producto: g.idProd, producto: g.prod, lote: g.lote, id_linea: g.idLinea, linea_prod: g.linea, variedades: Array.from(g.vars).sort(), caracteristicas: Array.from(g.cars).sort(), rezaga_aprovechable: fmt(g.a), rezaga_no_aprovechable: fmt(g.c), total_rezaga: fmt(g.a + g.c), num_registros: g.n, por_tipo };
  });
  return { desde: desde || null, hasta: hasta || null, unidad: u, lotes, total_aprovechable: fmt(tA), total_no_aprovechable: fmt(tC), total_rezaga: fmt(tA + tC), num_registros: tN };
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, null);

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    // ---- auth ----
    if (path === "/auth/register" && req.method === "POST") {
      const who = readToken(req);
      if (!who) return send(res, 401, { detail: "No autenticado" });
      if (who.rol !== "admin") return send(res, 403, { detail: "Solo admin puede crear usuarios" });
      let b = {};
      try { b = JSON.parse(raw || "{}"); } catch {}
      if (!b.username || !b.password) return send(res, 422, { detail: "username y password requeridos" });
      if (users.has(b.username)) return send(res, 400, { detail: "El usuario ya existe." });
      if (String(b.username).length < 3) return send(res, 422, { detail: [{ loc: ["body", "username"], msg: "String should have at least 3 characters" }] });
      if (String(b.password).length < 4) return send(res, 422, { detail: [{ loc: ["body", "password"], msg: "String should have at least 4 characters" }] });
      const rol = ["admin", "supervisor", "capturista", "reportes"].includes(b.rol) ? b.rol : "reportes";
      const u = addUser(b.username, b.password, rol);
      return send(res, 201, { id_usuario: u.id_usuario, username: b.username, rol, activo: true });
    }
    if (path === "/auth/login" && req.method === "POST") {
      const form = new URLSearchParams(raw);
      const u = form.get("username"), p = form.get("password");
      if (!users.has(u) || users.get(u).password !== p) return send(res, 401, { detail: "Credenciales invalidas" });
      return send(res, 200, { access_token: makeToken(u), token_type: "bearer" });
    }
    if (path === "/auth/me" && req.method === "GET") {
      const who = readToken(req);
      if (!who) return send(res, 401, { detail: "No autenticado" });
      const u = users.get(who.username);
      return send(res, 200, { id_usuario: u.id_usuario, username: who.username, rol: u.rol, activo: u.activo });
    }
    if (path === "/auth/usuarios" && req.method === "GET") {
      const who = readToken(req);
      if (!who) return send(res, 401, { detail: "No autenticado" });
      if (who.rol !== "admin") return send(res, 403, { detail: "Solo admin" });
      return send(res, 200, Array.from(users.entries()).map(([username, v]) => ({ id_usuario: v.id_usuario, username, rol: v.rol, activo: v.activo })));
    }
    const um = path.match(/^\/auth\/usuarios\/(\d+)$/);
    if (um) {
      const who = readToken(req);
      if (!who) return send(res, 401, { detail: "No autenticado" });
      if (who.rol !== "admin") return send(res, 403, { detail: "Solo admin" });
      const id = +um[1];
      let entry = null, uname = null;
      for (const [k, v] of users.entries()) { if (v.id_usuario === id) { entry = v; uname = k; break; } }
      if (!entry) return send(res, 404, { detail: "Usuario no encontrado" });
      if (req.method === "GET") return send(res, 200, { id_usuario: entry.id_usuario, username: uname, rol: entry.rol, activo: entry.activo });
      if (req.method === "PUT") {
        let b = {}; try { b = JSON.parse(raw || "{}"); } catch {}
        if (b.username && b.username !== uname) {
          if (users.has(b.username)) return send(res, 400, { detail: "El usuario ya existe." });
          users.delete(uname); uname = b.username; users.set(uname, entry);
        }
        if (b.password) entry.password = b.password;
        if (b.rol && ["admin", "capturista", "reportes"].includes(b.rol)) entry.rol = b.rol;
        if (typeof b.activo === "boolean") entry.activo = b.activo;
        return send(res, 200, { id_usuario: entry.id_usuario, username: uname, rol: entry.rol, activo: entry.activo });
      }
      if (req.method === "DELETE") { users.delete(uname); return send(res, 204, null); }
    }

    // ---- catalogos globales: /lineas y /contenedores ----
    const gm = path.match(/^\/(lineas|contenedores)(?:\/(\d+))?$/);
    if (gm) {
      const esCont = gm[1] === "contenedores";
      const lista = esCont ? contenedores : lineas;
      const id = gm[2] ? +gm[2] : null;
      const who = readToken(req);
      if (!who) return send(res, 401, { detail: "No autenticado" });
      if (req.method !== "GET" && !["admin", "supervisor"].includes(who.rol)) return send(res, 403, { detail: "Solo admin o supervisor pueden editar catalogos" });
      const pesoMal = (v) => v == null || v === "" || isNaN(Number(v)) || Number(v) < 0;
      const repetido = (nombre, exceptoId) => lista.some((x) => x.id !== exceptoId && x.nombre.toLowerCase() === nombre.toLowerCase());
      const errPeso = { detail: [{ loc: ["body", "peso_kg"], msg: "Input should be greater than or equal to 0" }] };

      if (req.method === "GET" && id === null) {
        return send(res, 200, url.searchParams.get("solo_activos") === "true" ? lista.filter((x) => x.activo) : lista);
      }
      if (req.method === "POST" && id === null) {
        let b = {}; try { b = JSON.parse(raw || "{}"); } catch {}
        const nombre = String(b.nombre || "").trim();
        if (!nombre) return send(res, 422, { detail: [{ loc: ["body", "nombre"], msg: "El nombre es obligatorio" }] });
        if (repetido(nombre, null)) return send(res, 400, { detail: `Ya existe '${nombre}'.` });
        if (!esCont) return send(res, 201, addLinea(nombre));
        if (pesoMal(b.peso_kg)) return send(res, 422, errPeso);
        return send(res, 201, addContenedor(nombre, Number(b.peso_kg)));
      }
      if (id !== null) {
        const idx = lista.findIndex((x) => x.id === id);
        if (idx === -1) return send(res, 404, { detail: "No encontrado." });
        if (req.method === "GET") return send(res, 200, lista[idx]);
        if (req.method === "PUT") {
          let b = {}; try { b = JSON.parse(raw || "{}"); } catch {}
          const nombre = b.nombre !== undefined ? String(b.nombre).trim() : null;
          if (nombre === "") return send(res, 422, { detail: [{ loc: ["body", "nombre"], msg: "El nombre es obligatorio" }] });
          if (nombre !== null && repetido(nombre, id)) return send(res, 400, { detail: `Ya existe '${nombre}'.` });
          if (esCont && b.peso_kg !== undefined && pesoMal(b.peso_kg)) return send(res, 422, errPeso);
          if (nombre !== null) {
            lista[idx].nombre = nombre;
            // Renombrar se ve en todo el historico (el backend real resuelve el nombre por id).
            registros.forEach((r) => {
              if (!esCont && r.id_linea === id) r.linea_prod = nombre;
              if (esCont && r.id_contenedor === id) r.contenedor = nombre;
            });
          }
          if (esCont && b.peso_kg !== undefined) lista[idx].peso_kg = fmt(b.peso_kg);   // no toca mermas: cada una guardo su tara
          if (b.activo !== undefined) lista[idx].activo = !!b.activo;
          return send(res, 200, lista[idx]);
        }
        if (req.method === "DELETE") {
          if (registros.some((r) => (esCont ? r.id_contenedor : r.id_linea) === id)) return send(res, 409, { detail: "Ya se uso en alguna merma: desactivalo en vez de borrarlo." });
          lista.splice(idx, 1);
          return send(res, 204, null);
        }
      }
      return send(res, 405, { detail: "Metodo no permitido" });
    }

    // ---- catalogo de tipos de merma ----
    const tm = path.match(/^\/tipos-merma(?:\/(\d+))?$/);
    if (tm) {
      const id = tm[1] ? +tm[1] : null;
      const who = readToken(req);
      if (!who) return send(res, 401, { detail: "No autenticado" });
      if (req.method !== "GET" && !["admin", "supervisor"].includes(who.rol)) return send(res, 403, { detail: "Solo admin o supervisor pueden editar catalogos" });

      if (req.method === "GET" && id === null) {
        const filtro = url.searchParams.get("id_producto");
        let out = tiposMerma;
        if (filtro) { const n = Number(filtro); out = out.filter((t) => t.id_producto === n || t.id_producto == null); }
        if (url.searchParams.get("solo_activos") === "true") out = out.filter((t) => t.activo);
        return send(res, 200, out);
      }
      if (req.method === "POST" && id === null) {
        let b = {}; try { b = JSON.parse(raw || "{}"); } catch {}
        const nombre = String(b.nombre || "").trim();
        if (!nombre) return send(res, 422, { detail: [{ loc: ["body", "nombre"], msg: "El nombre es obligatorio" }] });
        const idProd = b.id_producto ?? null;
        if (idProd != null && !prodDe(idProd)) return send(res, 400, { detail: "El producto no existe." });
        if (tiposMerma.some((t) => t.id_producto === idProd && t.nombre.toLowerCase() === nombre.toLowerCase())) return send(res, 400, { detail: "Ya existe un tipo con ese nombre." });
        return send(res, 201, addTipo(nombre, b.aprovechable === true, idProd));
      }
      if (id !== null) {
        const idx = tiposMerma.findIndex((t) => t.id === id);
        if (idx === -1) return send(res, 404, { detail: "No encontrado." });
        if (req.method === "GET") return send(res, 200, tiposMerma[idx]);
        if (req.method === "PUT") {
          let b = {}; try { b = JSON.parse(raw || "{}"); } catch {}
          if (b.nombre !== undefined) {
            const nombre = String(b.nombre).trim();
            if (!nombre) return send(res, 422, { detail: [{ loc: ["body", "nombre"], msg: "El nombre es obligatorio" }] });
            tiposMerma[idx].nombre = nombre;
          }
          if (b.aprovechable !== undefined) tiposMerma[idx].aprovechable = !!b.aprovechable;
          if (b.activo !== undefined) tiposMerma[idx].activo = !!b.activo;
          if (b.id_producto !== undefined) {
            if (b.id_producto != null && !prodDe(b.id_producto)) return send(res, 400, { detail: "El producto no existe." });
            tiposMerma[idx].id_producto = b.id_producto ?? null;
            tiposMerma[idx].producto = b.id_producto ? prodNombre(b.id_producto) : null;
          }
          return send(res, 200, tiposMerma[idx]);
        }
        if (req.method === "DELETE") {
          // id_tipo_merma es obligatorio: borrar un tipo usado dejaria registros invalidos.
          if (registros.some((r) => Number(r.id_tipo_merma) === id)) return send(res, 409, { detail: "El tipo ya se uso en alguna merma: desactivalo en vez de borrarlo." });
          tiposMerma.splice(idx, 1);
          return send(res, 204, null);
        }
      }
      return send(res, 405, { detail: "Metodo no permitido" });
    }

    // ---- catalogo de productos ----
    const pm = path.match(/^\/productos(?:\/(\d+))?$/);
    if (pm) {
      const id = pm[1] ? +pm[1] : null;
      const who = readToken(req);
      if (!who) return send(res, 401, { detail: "No autenticado" });
      if (req.method !== "GET" && !["admin", "supervisor"].includes(who.rol)) return send(res, 403, { detail: "Solo admin o supervisor pueden editar catalogos" });

      if (req.method === "GET" && id === null) return send(res, 200, productos);
      if (req.method === "POST" && id === null) {
        let b = {}; try { b = JSON.parse(raw || "{}"); } catch {}
        const nombre = String(b.nombre || "").trim();
        if (!nombre) return send(res, 422, { detail: [{ loc: ["body", "nombre"], msg: "El nombre es obligatorio" }] });
        if (productos.some((x) => x.nombre.toLowerCase() === nombre.toLowerCase())) return send(res, 400, { detail: "Ya existe un producto con ese nombre." });
        return send(res, 201, addProd(nombre, String(b.etiqueta_no_aprovechable || "Cascara y Hueso").trim()));
      }
      if (id !== null) {
        const idx = productos.findIndex((x) => x.id === id);
        if (idx === -1) return send(res, 404, { detail: "No encontrado." });
        if (req.method === "GET") return send(res, 200, productos[idx]);
        if (req.method === "PUT") {
          let b = {}; try { b = JSON.parse(raw || "{}"); } catch {}
          if (b.nombre !== undefined) {
            const nombre = String(b.nombre).trim();
            if (!nombre) return send(res, 422, { detail: [{ loc: ["body", "nombre"], msg: "El nombre es obligatorio" }] });
            if (productos.some((x) => x.id !== id && x.nombre.toLowerCase() === nombre.toLowerCase())) return send(res, 400, { detail: "Ya existe un producto con ese nombre." });
            productos[idx].nombre = nombre;
          }
          if (b.etiqueta_no_aprovechable !== undefined) productos[idx].etiqueta_no_aprovechable = String(b.etiqueta_no_aprovechable).trim() || "Cascara y Hueso";
          if (b.activo !== undefined) productos[idx].activo = !!b.activo;
          return send(res, 200, productos[idx]);
        }
        if (req.method === "DELETE") {
          if (registros.some((r) => Number(r.id_producto) === id)) return send(res, 409, { detail: "El producto ya tiene mermas registradas: desactivalo en vez de borrarlo." });
          productos.splice(idx, 1);
          for (let i = tiposMerma.length - 1; i >= 0; i--) if (tiposMerma[i].id_producto === id) tiposMerma.splice(i, 1);
          return send(res, 204, null);
        }
      }
      return send(res, 405, { detail: "Metodo no permitido" });
    }

    // ---- catalogos: /variedades y /caracteristicas ----
    const cm = path.match(/^\/(variedades|caracteristicas)(?:\/(\d+))?$/);
    if (cm) {
      const tipo = cm[1];
      const id = cm[2] ? +cm[2] : null;
      const who = readToken(req);
      if (!who) return send(res, 401, { detail: "No autenticado" });
      // leer: cualquier autenticado (el capturista necesita los valores para el formulario)
      if (req.method !== "GET" && !["admin", "supervisor"].includes(who.rol)) return send(res, 403, { detail: "Solo admin o supervisor pueden editar catalogos" });

      if (req.method === "GET" && id === null) {
        const filtro = url.searchParams.get("id_producto");
        if (!filtro) return send(res, 200, catalogos[tipo]);
        const n = Number(filtro);
        // variedades: solo las del producto. caracteristicas: las del producto + las globales.
        return send(res, 200, catalogos[tipo].filter((x) => x.id_producto === n || (tipo === "caracteristicas" && x.id_producto == null)));
      }
      if (req.method === "POST" && id === null) {
        let b = {}; try { b = JSON.parse(raw || "{}"); } catch {}
        const nombre = String(b.nombre || "").trim();
        if (!nombre) return send(res, 422, { detail: [{ loc: ["body", "nombre"], msg: "El nombre es obligatorio" }] });
        const idProd = b.id_producto ?? null;
        if (tipo === "variedades" && idProd == null) return send(res, 400, { detail: "La variedad debe pertenecer a un producto." });
        if (idProd != null && !prodDe(idProd)) return send(res, 400, { detail: "El producto no existe." });
        // El nombre es unico dentro del producto: VALENCIA puede existir en naranja y en toronja.
        if (catalogos[tipo].some((x) => x.id_producto === (idProd ?? null) && x.nombre.toLowerCase() === nombre.toLowerCase())) return send(res, 400, { detail: "Ya existe con ese nombre en este producto." });
        return send(res, 201, addCat(tipo, nombre, idProd));
      }
      if (id !== null) {
        const idx = catalogos[tipo].findIndex((x) => x.id === id);
        if (idx === -1) return send(res, 404, { detail: "No encontrado." });
        if (req.method === "GET") return send(res, 200, catalogos[tipo][idx]);
        if (req.method === "PUT") {
          let b = {}; try { b = JSON.parse(raw || "{}"); } catch {}
          if (b.nombre !== undefined) {
            const nombre = String(b.nombre).trim();
            if (!nombre) return send(res, 422, { detail: [{ loc: ["body", "nombre"], msg: "El nombre es obligatorio" }] });
            if (catalogos[tipo].some((x) => x.id !== id && x.nombre.toLowerCase() === nombre.toLowerCase())) return send(res, 400, { detail: "Ya existe con ese nombre." });
            catalogos[tipo][idx].nombre = nombre;
          }
          if (b.id_producto !== undefined) {
            if (tipo === "variedades" && b.id_producto == null) return send(res, 400, { detail: "La variedad debe pertenecer a un producto." });
            if (b.id_producto != null && !prodDe(b.id_producto)) return send(res, 400, { detail: "El producto no existe." });
            catalogos[tipo][idx].id_producto = b.id_producto ?? null;
          }
          if (b.activo !== undefined) catalogos[tipo][idx].activo = !!b.activo;
          return send(res, 200, catalogos[tipo][idx]);
        }
        if (req.method === "DELETE") { catalogos[tipo].splice(idx, 1); return send(res, 204, null); }
      }
      return send(res, 405, { detail: "Metodo no permitido" });
    }

    // ---- mermas (protegido) ----
    if (path.startsWith("/mermas")) {
      const who = readToken(req);
      if (!who) return send(res, 401, { detail: "No autenticado" });
      // crear: admin + capturista; editar/borrar: solo admin
      if (req.method === "POST" && !["admin", "supervisor", "capturista"].includes(who.rol)) return send(res, 403, { detail: "Sin permiso para crear" });
      if ((req.method === "PUT" || req.method === "DELETE") && !["admin", "supervisor"].includes(who.rol)) return send(res, 403, { detail: "Solo admin o supervisor pueden editar o borrar" });

      if (path === "/mermas" && req.method === "GET") {
        let out = registros.slice().sort((a, b) => b.id_registro - a.id_registro);
        const lote = url.searchParams.get("lote");
        const linea = url.searchParams.get("linea_prod");
        const idTipo = url.searchParams.get("id_tipo_merma");
        const apr = url.searchParams.get("aprovechable");
        if (lote) out = out.filter((r) => r.lote === lote);
        if (linea) out = out.filter((r) => r.linea_prod === linea);
        if (idTipo) out = out.filter((r) => Number(r.id_tipo_merma) === Number(idTipo));
        if (apr != null) out = out.filter((r) => r.aprovechable === (apr === "true"));
        const fecha = url.searchParams.get("fecha");
        const desde = url.searchParams.get("desde");
        const hasta = url.searchParams.get("hasta");
        if (fecha) out = out.filter((r) => (r.fecha_hora || "").slice(0, 10) === fecha);
        if (desde || hasta) out = out.filter((r) => enRango(r.fecha_hora, desde, hasta));
        const idp = url.searchParams.get("id_producto");
        if (idp) out = out.filter((r) => Number(r.id_producto) === Number(idp));
        const idl = url.searchParams.get("id_linea");
        const idcont = url.searchParams.get("id_contenedor");
        if (idl) out = out.filter((r) => Number(r.id_linea) === Number(idl));
        if (idcont) out = out.filter((r) => Number(r.id_contenedor) === Number(idcont));
        const idv = url.searchParams.get("id_variedad");
        const idc = url.searchParams.get("id_caracteristica");
        if (idv) out = out.filter((r) => Number(r.id_variedad) === Number(idv));
        if (idc) out = out.filter((r) => Number(r.id_caracteristica) === Number(idc));
        const skip = +(url.searchParams.get("skip") || 0);
        const limit = +(url.searchParams.get("limit") || 100);
        return send(res, 200, out.slice(skip, skip + limit));
      }
      if (path === "/mermas/informe" && req.method === "GET") {
        const desde = url.searchParams.get("desde");
        const hasta = url.searchParams.get("hasta");
        const u = uni(url.searchParams.get("unidad"));
        const idp = url.searchParams.get("id_producto");
        let src = registros.filter((r) => enRango(r.fecha_hora, desde, hasta));
        if (idp) src = src.filter((r) => Number(r.id_producto) === Number(idp));
        const map = {};
        src.forEach((r) => {
          const dia = (r.fecha_hora || "").slice(0, 10);
          const g = map[dia] || (map[dia] = { fecha: dia, a: 0, c: 0, n: 0, tipos: {} });
          const kg = conv(+r.cant_kg, u);
          if (r.aprovechable) g.a += kg; else g.c += kg;
          const t = g.tipos[r.id_tipo_merma] || (g.tipos[r.id_tipo_merma] = { id_tipo_merma: r.id_tipo_merma, tipo_merma: r.tipo_merma, aprovechable: r.aprovechable, _n: 0 });
          t._n += kg;
          g.n++;
        });
        const rows = Object.values(map).map((g) => ({
          fecha: g.fecha, unidad: u, total_aprovechable: fmt(g.a), total_no_aprovechable: fmt(g.c),
          total_general: fmt(g.a + g.c), num_registros: g.n,
          por_tipo: Object.values(g.tipos).map((t) => ({ id_tipo_merma: t.id_tipo_merma, tipo_merma: t.tipo_merma, aprovechable: t.aprovechable, cant: fmt(t._n) })),
        })).sort((a, b) => b.fecha.localeCompare(a.fecha));
        return send(res, 200, rows);
      }
      if (path === "/mermas/reporte/hoy" && req.method === "GET") {
        const d = new Date();
        const ymd = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        return send(res, 200, buildReporte(registros, ymd, ymd, url.searchParams.get("unidad"), url.searchParams.get("id_producto")));
      }
      if (path === "/mermas/reporte" && req.method === "GET") {
        return send(res, 200, buildReporte(registros, url.searchParams.get("desde"), url.searchParams.get("hasta"), url.searchParams.get("unidad"), url.searchParams.get("id_producto")));
      }
      if (path === "/mermas" && req.method === "POST") {
        let b = {};
        try { b = JSON.parse(raw || "{}"); } catch {}
        // Peso de UNA forma: cant_kg (neto), o peso_bruto_kg + id_contenedor. Igual que el schema real.
        const conCont = b.peso_bruto_kg != null || b.id_contenedor != null;
        const errBody = (msg) => send(res, 422, { detail: [{ type: "value_error", loc: ["body"], msg: "Value error, " + msg }] });
        if (b.cant_kg != null && conCont) return errBody("Manda el peso de una sola forma: cant_kg (neto), o peso_bruto_kg + id_contenedor para que la API descuente la tara.");
        if (b.cant_kg == null && !conCont) return errBody("Falta el peso: manda cant_kg, o peso_bruto_kg + id_contenedor.");
        if (conCont && (b.peso_bruto_kg == null || b.id_contenedor == null)) return errBody("peso_bruto_kg e id_contenedor van juntos: manda los dos.");
        const pesoIn = conCont ? b.peso_bruto_kg : b.cant_kg;
        if (isNaN(Number(pesoIn)) || Number(pesoIn) < 0) return send(res, 422, { detail: [{ type: "value_error", loc: ["body", conCont ? "peso_bruto_kg" : "cant_kg"], msg: "Input should be greater than or equal to 0", input: pesoIn }] });
        // La linea ya no es texto libre: un front sin actualizar que manda linea_prod rebota aqui.
        if (b.id_linea == null) return send(res, 422, { detail: [{ type: "missing", loc: ["body", "id_linea"], msg: "Field required" }] });
        const linea = lineas.find((l) => l.id === Number(b.id_linea));
        if (!linea) return send(res, 400, { detail: `La linea ${b.id_linea} no existe.` });
        if (!linea.activo) return send(res, 400, { detail: `La linea '${linea.nombre}' esta inactiva.` });
        if (b.id_tipo_merma == null) return send(res, 422, { detail: [{ loc: ["body", "id_tipo_merma"], msg: "El tipo de merma es obligatorio" }] });
        const mal = validarCombinacion(b.id_producto, b.id_tipo_merma, b.id_variedad, b.id_caracteristica);
        if (mal) return send(res, 400, { detail: mal });
        const pesos = conCont
          ? pesosConTara(b.peso_bruto_kg, b.id_contenedor, null)
          : { cant_kg: fmt(b.cant_kg), peso_bruto_kg: null, tara_kg: null, id_contenedor: null, contenedor: null };
        if (pesos.error) return send(res, 400, { detail: pesos.error });
        const tipoRec = tipoDe(b.id_tipo_merma);
        const rec = {
          id_registro: ++seq, ...pesos,
          id_tipo_merma: tipoRec.id, tipo_merma: tipoRec.nombre, aprovechable: tipoRec.aprovechable,
          lote: b.lote, id_linea: linea.id, linea_prod: linea.nombre,
          fecha_hora: b.fecha_hora || new Date().toISOString().slice(0, 19),
          id_usuario: (users.get(who.username) || {}).id_usuario, registrado_por: who.username,
          id_producto: Number(b.id_producto), producto: prodNombre(b.id_producto),
          id_variedad: b.id_variedad ?? null, variedad: catNombre("variedades", b.id_variedad),
          id_caracteristica: b.id_caracteristica ?? null, caracteristica: catNombre("caracteristicas", b.id_caracteristica),
        };
        registros.push(rec);
        return send(res, 201, rec);
      }
      const idm = path.match(/^\/mermas\/(\d+)$/);
      if (idm) {
        const id = +idm[1];
        const idx = registros.findIndex((r) => r.id_registro === id);
        if (req.method === "GET") { return idx === -1 ? send(res, 404, { detail: "Registro no encontrado." }) : send(res, 200, registros[idx]); }
        if (req.method === "PUT") {
          if (idx === -1) return send(res, 404, { detail: "Registro no encontrado." });
          let b = {}; try { b = JSON.parse(raw || "{}"); } catch {}
          // Se valida el RESULTADO del cambio, no solo lo que viene en el payload.
          const fin = {
            id_producto: b.id_producto !== undefined ? b.id_producto : registros[idx].id_producto,
            id_tipo_merma: b.id_tipo_merma !== undefined ? b.id_tipo_merma : registros[idx].id_tipo_merma,
            id_variedad: b.id_variedad !== undefined ? b.id_variedad : registros[idx].id_variedad,
            id_caracteristica: b.id_caracteristica !== undefined ? b.id_caracteristica : registros[idx].id_caracteristica,
          };
          const malPut = validarCombinacion(fin.id_producto, fin.id_tipo_merma, fin.id_variedad, fin.id_caracteristica);
          if (malPut) return send(res, 400, { detail: malPut });
          const reg = registros[idx];
          let lineaPut = null;
          if (b.id_linea != null) {
            lineaPut = lineas.find((l) => l.id === Number(b.id_linea));
            if (!lineaPut) return send(res, 400, { detail: `La linea ${b.id_linea} no existe.` });
            if (!lineaPut.activo) return send(res, 400, { detail: `La linea '${lineaPut.nombre}' esta inactiva.` });
          }
          // Peso: igual que _pesos_update del backend real. Todo se valida antes de escribir.
          let pesosPut = null;
          if (b.cant_kg != null) {
            if (b.peso_bruto_kg != null || b.id_contenedor != null) return send(res, 422, { detail: [{ type: "value_error", loc: ["body"], msg: "Value error, Manda el peso de una sola forma: cant_kg (neto), o peso_bruto_kg + id_contenedor para que la API descuente la tara." }] });
            if (reg.id_contenedor != null) return send(res, 400, { detail: "Este registro se capturo con contenedor: su peso neto sale de restar la tara. Corrige peso_bruto_kg (o cambia id_contenedor), no cant_kg." });
            pesosPut = { cant_kg: fmt(b.cant_kg) };
          } else if (b.peso_bruto_kg != null || b.id_contenedor != null) {
            const bruto = b.peso_bruto_kg ?? reg.peso_bruto_kg;
            const idCont = b.id_contenedor ?? reg.id_contenedor;
            if (bruto == null || idCont == null) return send(res, 400, { detail: "Este registro no tenia contenedor: para pasarlo a peso con contenedor manda peso_bruto_kg e id_contenedor juntos." });
            const mismo = Number(idCont) === Number(reg.id_contenedor) && reg.tara_kg != null;
            pesosPut = pesosConTara(bruto, idCont, mismo ? reg.tara_kg : null);
            if (pesosPut.error) return send(res, 400, { detail: pesosPut.error });
          }
          ["lote", "fecha_hora"].forEach((k) => { if (b[k] !== undefined) reg[k] = b[k]; });
          if (lineaPut) { reg.id_linea = lineaPut.id; reg.linea_prod = lineaPut.nombre; }
          if (pesosPut) Object.assign(reg, pesosPut);
          if (b.id_tipo_merma !== undefined) {
            const t = tipoDe(b.id_tipo_merma);
            registros[idx].id_tipo_merma = t.id; registros[idx].tipo_merma = t.nombre; registros[idx].aprovechable = t.aprovechable;
          }
          if (b.id_producto !== undefined) { registros[idx].id_producto = Number(b.id_producto); registros[idx].producto = prodNombre(b.id_producto); }
          if (b.id_variedad !== undefined) { registros[idx].id_variedad = b.id_variedad ?? null; registros[idx].variedad = catNombre("variedades", b.id_variedad); }
          if (b.id_caracteristica !== undefined) { registros[idx].id_caracteristica = b.id_caracteristica ?? null; registros[idx].caracteristica = catNombre("caracteristicas", b.id_caracteristica); }
          return send(res, 200, registros[idx]);
        }
        if (req.method === "DELETE") {
          if (idx === -1) return send(res, 404, { detail: "Registro no encontrado." });
          registros.splice(idx, 1);
          return send(res, 204, null);
        }
      }
    }
    return send(res, 404, { detail: "No encontrado" });
  });
});

server.listen(PORT, () => console.log(`Mock API en http://127.0.0.1:${PORT}`));
